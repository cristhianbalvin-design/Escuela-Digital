import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/supabase/database.types'
import {
  normalizeCertificateCode, parseCompletion, parseCompletionRules,
  parseOfferingCertificates,
  type Completion, type CompletionRules, type OfferingCertificate,
} from './certificates-utils'

export type { OfferingCertificate } from './certificates-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw error
}

const keys = {
  offering: (id: string) => ['certificates', 'offering', id] as const,
  rules: (id: string) => ['certificates', 'rules', id] as const,
  mine: (userId: string) => ['certificates', 'mine', userId] as const,
  verify: (code: string) => ['certificates', 'verify', code] as const,
}

const RENDER_FALLBACK = 'No se pudo generar el PDF.'

async function renderCertificate(certificateId: string): Promise<void> {
  const { data, error } = await client().auth.getSession()
  check(error)
  const token = data.session?.access_token
  if (!token) throw new Error('No hay una sesión activa para generar el certificado.')
  const response = await fetch('/api/certificates/render', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ certificate_id: certificateId }),
  })
  let body: unknown = null
  try {
    body = await response.json()
  } catch { /* cuerpo no JSON */ }
  const issued = typeof body === 'object' && body !== null && 'status' in body &&
    body.status === 'issued'
  if (!response.ok || !issued) {
    const message = typeof body === 'object' && body !== null && 'error' in body &&
      typeof body.error === 'string' ? body.error : RENDER_FALLBACK
    throw new Error(message)
  }
}

async function tryRender(certificateId: string): Promise<string | null> {
  try {
    await renderCertificate(certificateId)
    return null
  } catch (cause) {
    return cause instanceof Error ? cause.message : RENDER_FALLBACK
  }
}

export async function downloadCertificate(pdfPath: string): Promise<void> {
  const { data, error } = await client().storage.from('certificates')
    .createSignedUrl(pdfPath, 60)
  check(error)
  if (!data) throw new Error('No se pudo obtener el archivo.')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

/** Emite el certificado y genera el PDF; devuelve el error de generación si lo hubo. */
export async function issueAndRender(enrollmentId: string): Promise<string | null> {
  const { data, error } = await client().rpc('issue_certificate', { p_enrollment_id: enrollmentId })
  check(error)
  if (!data) throw new Error('No se pudo emitir el certificado.')
  return tryRender(data)
}

export function useCanIssueCertificates(offeringId: string | undefined) {
  return useQuery({
    queryKey: ['certificates', 'can-issue', offeringId ?? ''],
    enabled: !!supabase && !!offeringId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await client().rpc('can_issue_certificates', { p_offering_id: offeringId! })
      check(error)
      return data === true
    },
  })
}

export function useOfferingCertificates(offeringId: string | undefined) {
  return useQuery({
    queryKey: keys.offering(offeringId ?? ''),
    enabled: !!supabase && !!offeringId,
    queryFn: async (): Promise<OfferingCertificate[]> => {
      const { data, error } = await client().rpc('get_offering_certificates', {
        p_offering_id: offeringId!,
      })
      check(error)
      return parseOfferingCertificates(data)
    },
  })
}

export function useCompletionRules(offeringId: string | undefined) {
  return useQuery({
    queryKey: keys.rules(offeringId ?? ''),
    enabled: !!supabase && !!offeringId,
    queryFn: async (): Promise<CompletionRules> => {
      const { data, error } = await client().from('offerings')
        .select('completion_rules').eq('id', offeringId!).single()
      check(error)
      return parseCompletionRules(data?.completion_rules)
    },
  })
}

export function useSaveCompletionRules(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (rules: CompletionRules) => {
      const { error } = await client().from('offerings')
        .update({ completion_rules: rules as Json }).eq('id', offeringId)
      check(error)
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: keys.rules(offeringId) }),
        cache.invalidateQueries({ queryKey: keys.offering(offeringId) }),
      ])
    },
  })
}

export function useIssueCertificate(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { data, error } = await client().rpc('issue_certificate', {
        p_enrollment_id: enrollmentId,
      })
      check(error)
      if (!data) throw new Error('No se pudo emitir el certificado.')
      return { certificateId: data, renderError: await tryRender(data) }
    },
    onSettled: () => cache.invalidateQueries({ queryKey: keys.offering(offeringId) }),
  })
}

export function useRenderCertificate(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (certificateId: string) => ({
      renderError: await tryRender(certificateId),
    }),
    onSettled: () => cache.invalidateQueries({ queryKey: keys.offering(offeringId) }),
  })
}

type ReasonInput = { certificateId: string; reason: string }

export function useRevokeCertificate(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ certificateId, reason }: ReasonInput) => {
      const { error } = await client().rpc('revoke_certificate', {
        p_certificate_id: certificateId, p_reason: reason,
      })
      check(error)
    },
    onSettled: () => cache.invalidateQueries({ queryKey: keys.offering(offeringId) }),
  })
}

export function useReissueCertificate(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ certificateId, reason }: ReasonInput) => {
      const { data, error } = await client().rpc('reissue_certificate', {
        p_certificate_id: certificateId, p_reason: reason,
      })
      check(error)
      if (!data) throw new Error('No se pudo reemitir el certificado.')
      return { certificateId: data, renderError: await tryRender(data) }
    },
    onSettled: () => cache.invalidateQueries({ queryKey: keys.offering(offeringId) }),
  })
}

export type MyCertificate = {
  id: string
  code: string
  status: string
  pdf_path: string | null
  course_title: string
  offering_id: string
  enrollment_id: string
  issued_at: string
  last_render_error: string | null
}

export type MyEnrollmentCompletion = {
  enrollment_id: string
  offering_id: string
  course_title: string
  completion: Completion
  certificate: MyCertificate | null
}

export function useMyCertificates(userId: string | undefined) {
  return useQuery({
    queryKey: keys.mine(userId ?? ''),
    enabled: !!supabase && !!userId,
    queryFn: async (): Promise<MyEnrollmentCompletion[]> => {
      const db = client()
      const { data: enrollments, error: enrollmentError } = await db.from('enrollments')
        .select('id,offering_id').eq('user_id', userId!)
      check(enrollmentError)
      const rows = enrollments ?? []
      if (rows.length === 0) return []
      const [offeringResult, certificateResult] = await Promise.all([
        db.from('offerings').select('id,title').in('id', rows.map((row) => row.offering_id)),
        db.from('certificates')
          .select('id,code,status,pdf_path,course_title,offering_id,enrollment_id,issued_at,last_render_error')
          .in('enrollment_id', rows.map((row) => row.id))
          .order('created_at', { ascending: false }),
      ])
      check(offeringResult.error)
      check(certificateResult.error)
      return Promise.all(rows.map(async (row) => {
        const { data, error } = await db.rpc('evaluate_completion', {
          p_enrollment_id: row.id,
        })
        check(error)
        return {
          enrollment_id: row.id,
          offering_id: row.offering_id,
          course_title: offeringResult.data?.find((o) => o.id === row.offering_id)?.title ?? '',
          completion: parseCompletion(data),
          certificate: certificateResult.data?.find((c) => c.enrollment_id === row.id) ?? null,
        }
      }))
    },
  })
}

export type VerifiedCertificate = {
  status: 'issued' | 'pending_render' | 'revoked' | 'reissued'
  holder_name: string
  course_title: string
  hours: number | null
  issuers: { kind: string; name: string; logo_url?: string }[]
  instructor_name: string | null
  issued_at: string
  revoked_at: string | null
}

function parseVerified(value: unknown): VerifiedCertificate | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const row = value[0]
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null
  const data = row as Record<string, unknown>
  const issuers = Array.isArray(data.issuers) ? data.issuers.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const issuer = entry as Record<string, unknown>
    if (typeof issuer.name !== 'string') return []
    return [{
      kind: typeof issuer.kind === 'string' ? issuer.kind : '',
      name: issuer.name,
      ...(typeof issuer.logo_url === 'string' ? { logo_url: issuer.logo_url } : {}),
    }]
  }) : []
  const status = data.status === 'pending_render' || data.status === 'revoked' ||
    data.status === 'reissued' ? data.status : 'issued'
  return {
    status,
    holder_name: typeof data.holder_name === 'string' ? data.holder_name : '',
    course_title: typeof data.course_title === 'string' ? data.course_title : '',
    hours: typeof data.hours === 'number' ? data.hours : null,
    issuers,
    instructor_name: typeof data.instructor_name === 'string' ? data.instructor_name : null,
    issued_at: typeof data.issued_at === 'string' ? data.issued_at : '',
    revoked_at: typeof data.revoked_at === 'string' ? data.revoked_at : null,
  }
}

export function useVerifyCertificate(code: string | undefined) {
  const normalized = code ? normalizeCertificateCode(code) : ''
  return useQuery({
    queryKey: keys.verify(normalized),
    enabled: !!supabase && !!normalized,
    queryFn: async () => {
      const { data, error } = await client().rpc('verify_certificate', { p_code: normalized })
      check(error)
      return parseVerified(data)
    },
  })
}
