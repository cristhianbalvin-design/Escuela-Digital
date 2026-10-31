import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase/database.types'
import { signatureExtension, validateSignatureFile } from './signers-utils'

export type Signer = Database['public']['Tables']['certificate_signers']['Row']
type SignerValues = Pick<Signer, 'full_name' | 'title'>
type SignerUpdate = SignerValues & { id: string }
type SignatureRemoval = { id: string; path: string }

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { message: string } | null) {
  if (error) throw error
}

const keys = {
  signers: (tenantId: string) => ['certificates', 'signers', tenantId] as const,
  signatureUrl: (path: string) => ['certificates', 'signature-url', path] as const,
  offeringSigners: (offeringId: string) =>
    ['certificates', 'offering-signers', offeringId] as const,
}

async function invalidateSignerData(
  cache: ReturnType<typeof useQueryClient>,
  tenantId: string,
) {
  await Promise.all([
    cache.invalidateQueries({ queryKey: keys.signers(tenantId) }),
    cache.invalidateQueries({ queryKey: ['certificates', 'offering-signers'] }),
    cache.invalidateQueries({ queryKey: ['certificates', 'signature-url'] }),
  ])
}

export function useSigners(tenantId: string | undefined) {
  return useQuery({
    queryKey: keys.signers(tenantId ?? ''),
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<Signer[]> => {
      const { data, error } = await client().from('certificate_signers')
        .select('*').eq('tenant_id', tenantId!).is('deleted_at', null)
        .order('full_name')
      check(error)
      return data ?? []
    },
  })
}

export function useCreateSigner(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (values: SignerValues) => {
      const { error } = await client().from('certificate_signers')
        .insert({ ...values, tenant_id: tenantId })
      check(error)
    },
    onSuccess: () => invalidateSignerData(cache, tenantId),
  })
}

export function useUpdateSigner(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: SignerUpdate) => {
      const { error } = await client().from('certificate_signers')
        .update(values).eq('id', id).eq('tenant_id', tenantId).is('deleted_at', null)
      check(error)
    },
    onSuccess: () => invalidateSignerData(cache, tenantId),
  })
}

export function useDeleteSigner(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (signerId: string) => {
      const { error } = await client().from('certificate_signers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', signerId).eq('tenant_id', tenantId).is('deleted_at', null)
      check(error)
    },
    onSuccess: () => invalidateSignerData(cache, tenantId),
  })
}

export function useUploadSignature(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ signerId, file }: { signerId: string; file: File }) => {
      const validationError = validateSignatureFile(file)
      if (validationError) throw new Error(validationError)

      const extension = signatureExtension(file.type)
      if (!extension) throw new Error('certificates.signers.errors.fileType')
      const path = `${tenantId}/${signerId}.${extension}`
      const { error: uploadError } = await client().storage.from('signatures')
        .upload(path, file, { upsert: true, contentType: file.type })
      check(uploadError)

      const { error } = await client().from('certificate_signers')
        .update({ signature_path: path })
        .eq('id', signerId).eq('tenant_id', tenantId).is('deleted_at', null)
      check(error)
      return path
    },
    onSuccess: () => invalidateSignerData(cache, tenantId),
  })
}

export function useRemoveSignature(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, path }: SignatureRemoval) => {
      const { error: storageError } = await client().storage.from('signatures').remove([path])
      check(storageError)
      const { error } = await client().from('certificate_signers')
        .update({ signature_path: null })
        .eq('id', id).eq('tenant_id', tenantId).is('deleted_at', null)
      check(error)
    },
    onSuccess: () => invalidateSignerData(cache, tenantId),
  })
}

export function useSignatureUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: keys.signatureUrl(path ?? ''),
    enabled: !!supabase && !!path,
    staleTime: 240_000,
    queryFn: async () => {
      if (!path) return null
      const { data, error } = await client().storage.from('signatures')
        .createSignedUrl(path, 300)
      check(error)
      return data?.signedUrl ?? null
    },
  })
}

export function useOfferingSigners(offeringId: string | undefined) {
  return useQuery({
    queryKey: keys.offeringSigners(offeringId ?? ''),
    enabled: !!supabase && !!offeringId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await client().from('offerings')
        .select('certificate_signer_ids').eq('id', offeringId!).single()
      check(error)
      return data?.certificate_signer_ids ?? []
    },
  })
}

export function useSaveOfferingSigners(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (signerIds: string[]) => {
      if (signerIds.length > 2 || new Set(signerIds).size !== signerIds.length) {
        throw new Error('certificates.signers.errors.selection')
      }
      const { error } = await client().from('offerings')
        .update({ certificate_signer_ids: signerIds }).eq('id', offeringId)
      check(error)
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: keys.offeringSigners(offeringId) }),
  })
}
