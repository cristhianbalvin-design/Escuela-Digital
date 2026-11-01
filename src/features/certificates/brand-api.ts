import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logoExtension, validateLogoFile } from './brand-utils'

export interface Brand {
  logoPath: string | null
  primary: string | null
  secondary: string | null
  schoolPrimary: string
  schoolSecondary: string
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { message: string } | null) {
  if (error) throw error
}

const brandKey = (tenantId: string) => ['certificates', 'brand', tenantId] as const

export function useBrand(tenantId: string | undefined) {
  return useQuery({
    queryKey: brandKey(tenantId ?? ''),
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<Brand> => {
      const { data, error } = await client().from('tenants')
        .select('certificate_logo_path, certificate_primary_color, certificate_secondary_color, primary_color, secondary_color')
        .eq('id', tenantId!).single()
      check(error)
      return {
        logoPath: data?.certificate_logo_path ?? null,
        primary: data?.certificate_primary_color ?? null,
        secondary: data?.certificate_secondary_color ?? null,
        schoolPrimary: data?.primary_color ?? '#4F46E5',
        schoolSecondary: data?.secondary_color ?? '#14B8A6',
      }
    },
  })
}

export function useSaveBrandColors(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (values: { primary: string | null; secondary: string | null }) => {
      const { error } = await client().from('tenants').update({
        certificate_primary_color: values.primary,
        certificate_secondary_color: values.secondary,
      }).eq('id', tenantId)
      check(error)
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: brandKey(tenantId) }),
  })
}

export function useUploadLogo(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, previousPath }: { file: File; previousPath: string | null }) => {
      const validationError = validateLogoFile(file)
      if (validationError) throw new Error(validationError)
      const extension = logoExtension(file.type)
      if (!extension) throw new Error('certificates.brand.errors.fileType')

      const path = `${tenantId}/logo.${extension}`
      const { error: uploadError } = await client().storage.from('branding')
        .upload(path, file, { upsert: true, contentType: file.type })
      check(uploadError)
      const { error } = await client().from('tenants')
        .update({ certificate_logo_path: path }).eq('id', tenantId)
      check(error)
      if (previousPath && previousPath !== path) {
        await client().storage.from('branding').remove([previousPath])
      }
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: brandKey(tenantId) })
      await cache.invalidateQueries({ queryKey: ['certificates', 'logo-url'] })
    },
  })
}

export function useRemoveLogo(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await client().from('tenants')
        .update({ certificate_logo_path: null }).eq('id', tenantId)
      check(error)
      await client().storage.from('branding').remove([path])
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: brandKey(tenantId) }),
  })
}

export function useLogoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['certificates', 'logo-url', path ?? ''] as const,
    enabled: !!supabase && !!path,
    staleTime: 240_000,
    queryFn: async () => {
      if (!path) return null
      const { data, error } = await client().storage.from('branding')
        .createSignedUrl(path, 300)
      check(error)
      return data?.signedUrl ?? null
    },
  })
}
