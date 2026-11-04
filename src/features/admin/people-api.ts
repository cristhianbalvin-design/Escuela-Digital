import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  inviteResultSchema, peopleSchema, placeholderStudentsSchema,
  type PlaceholderStudent, type SchoolPeople,
} from './people-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useSchoolPeople(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['school-people', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<SchoolPeople> => {
      const { data, error } = await client().rpc('list_school_people', { p_tenant_id: tenantId! })
      if (error) throw error
      return peopleSchema.parse(data)
    },
  })
}

export function useInvitePerson(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role: string; clientId?: string }) => {
      const { data, error } = await client().rpc('invite_school_member', {
        p_tenant_id: tenantId!, p_email: input.email.trim(), p_role: input.role,
        ...(input.clientId ? { p_client_id: input.clientId } : {}),
      })
      if (error) throw error
      return inviteResultSchema.parse(data)
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['school-people', tenantId] }),
  })
}

export function useSetMemberStatus(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string; status: 'active' | 'suspended' }) => {
      const { error } = await client().rpc('set_school_member_status', {
        p_tenant_id: tenantId!, p_user_id: input.userId, p_status: input.status,
      })
      if (error) throw error
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['school-people', tenantId] }),
  })
}

export function useRevokeInvitation(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await client().rpc('revoke_school_invitation', { p_invitation_id: invitationId })
      if (error) throw error
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['school-people', tenantId] }),
  })
}

export function usePlaceholderStudents(tenantId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['placeholder-students', tenantId],
    enabled: !!supabase && !!tenantId && enabled,
    queryFn: async (): Promise<PlaceholderStudent[]> => {
      const { data, error } = await client().rpc('list_placeholder_students', { p_tenant_id: tenantId! })
      if (error) throw error
      return placeholderStudentsSchema.parse(data)
    },
  })
}

export function useSetStudentEmail(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { userId: string; email: string }) => {
      const { data: session } = await client().auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('unauthorized')
      const response = await fetch('/api/people/student-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, user_id: input.userId, email: input.email.trim() }),
      })
      const body = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(body?.error ?? String(response.status))
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ['placeholder-students', tenantId] })
      void cache.invalidateQueries({ queryKey: ['students'] })
    },
  })
}
