import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const previewSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('invalid') }),
  z.object({
    status: z.enum(['valid', 'used', 'expired']),
    email: z.string(),
    tenant_name: z.string(),
    tenant_slug: z.string(),
    offering_title: z.string().nullable(),
    role: z.string().optional(),
    client_name: z.string().nullable().optional(),
  }),
])

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useInvitationPreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invitation-preview', token],
    enabled: !!supabase && !!token,
    queryFn: async () => {
      const { data, error } = await client().rpc('preview_invitation', {
        p_token: token!,
      })
      if (error) throw error
      return previewSchema.parse(data)
    },
    retry: 1,
  })
}

export async function createAccountFromInvitation(
  token: string,
  password: string,
  fullName: string,
) {
  const { data, error } = await client().functions.invoke('accept-invite', {
    body: { token, password, full_name: fullName || undefined },
  })
  if (error) throw error
  if (
    typeof data !== 'object' ||
    data === null ||
    !('ok' in data) ||
    data.ok !== true
  ) throw new Error('Invalid response')
}

export async function acceptInvitation(token: string) {
  const { error } = await client().rpc('accept_invitation', {
    p_token: token,
  })
  if (error) throw error
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
}

export function invitationRpcErrorKey(error: unknown): string {
  const code = codeOf(error)
  if (code === '42501') return 'invitations.acceptNoPermission'
  if (code === '23514') return 'invitations.acceptInvalid'
  return 'invitations.genericError'
}

export async function invitationEdgeErrorKey(error: unknown): Promise<string> {
  let body: unknown
  if (
    typeof error === 'object' &&
    error !== null &&
    'context' in error &&
    error.context instanceof Response
  ) {
    try {
      body = await error.context.json()
    } catch {
      body = null
    }
  }
  const edgeCode =
    typeof body === 'object' && body !== null && 'error' in body
      ? String(body.error)
      : ''
  switch (edgeCode) {
    case 'account_exists': return 'invitations.accountExists'
    case 'weak_password': return 'invitations.weakPassword'
    case 'invalid_token': return 'invitations.invalid'
    case 'used': return 'invitations.used'
    case 'expired': return 'invitations.expired'
    default: return 'invitations.genericError'
  }
}
