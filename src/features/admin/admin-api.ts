import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  adminCertificatesSchema, assignmentsSchema, instructorsSchema,
  type AdminCertificate, type Assignment, type Instructor, type InstructorRole,
} from './admin-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useTenantInstructors(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-instructors', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<Instructor[]> => {
      const { data, error } = await client().rpc('list_tenant_instructors', { p_tenant_id: tenantId! })
      if (error) throw error
      return instructorsSchema.parse(data)
    },
  })
}

export function useOfferingAssignments(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['offering-assignments', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await client().rpc('list_offering_assignments', { p_tenant_id: tenantId! })
      if (error) throw error
      return assignmentsSchema.parse(data)
    },
  })
}

export function useSetInstructor(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { offeringId: string; userId: string; role: InstructorRole }) => {
      const { error } = await client().rpc('set_offering_instructor', {
        p_offering_id: input.offeringId, p_user_id: input.userId, p_role: input.role,
      })
      if (error) throw error
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['offering-assignments', tenantId] }),
  })
}

export function useRemoveInstructor(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { offeringId: string; userId: string }) => {
      const { error } = await client().rpc('remove_offering_instructor', {
        p_offering_id: input.offeringId, p_user_id: input.userId,
      })
      if (error) throw error
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['offering-assignments', tenantId] }),
  })
}

export function useTenantCertificates(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-certificates', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<AdminCertificate[]> => {
      const { data, error } = await client().rpc('list_tenant_certificates', {
        p_tenant_id: tenantId!,
      })
      if (error) throw error
      return adminCertificatesSchema.parse(data)
    },
  })
}
