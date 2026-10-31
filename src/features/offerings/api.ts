import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { OfferingValues } from './schemas'

type Tables = Database['public']['Tables']
export type Offering = Tables['offerings']['Row']
export type Enrollment = Tables['enrollments']['Row']

const createdInvitationSchema = z.object({
  id: z.string(),
  token: z.string(),
  expires_at: z.string(),
})

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw error
}

export function useOfferings(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['offerings', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async () => {
      const db = client()
      const [offerings, clients, enrollments] = await Promise.all([
        db.from('offerings').select('*').eq('tenant_id', tenantId!)
          .is('deleted_at', null).order('created_at', { ascending: false }),
        db.from('clients').select('id,name').eq('tenant_id', tenantId!),
        db.from('enrollments').select('offering_id,status').eq('tenant_id', tenantId!),
      ])
      check(offerings.error)
      check(clients.error)
      check(enrollments.error)
      return (offerings.data ?? []).map((offering) => ({
        ...offering,
        clientName: clients.data?.find((item) => item.id === offering.client_id)?.name ?? '—',
        usedSeats: (enrollments.data ?? []).filter(
          (item) => item.offering_id === offering.id && item.status !== 'dropped',
        ).length,
      }))
    },
  })
}

export function useOfferingChoices(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['offering-choices', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async () => {
      const db = client()
      const [clients, courses, versions] = await Promise.all([
        db.from('clients').select('id,name').eq('tenant_id', tenantId!)
          .eq('status', 'active').is('deleted_at', null).order('name'),
        db.from('courses').select('id,latest_published_version_id')
          .eq('tenant_id', tenantId!).is('deleted_at', null),
        db.from('course_versions').select('id,course_id,title,version_number,status')
          .eq('tenant_id', tenantId!).eq('status', 'published')
          .order('version_number', { ascending: false }),
      ])
      check(clients.error)
      check(courses.error)
      check(versions.error)
      const courseIds = new Set((courses.data ?? []).map((item) => item.id))
      return {
        clients: clients.data ?? [],
        versions: (versions.data ?? []).filter((item) => courseIds.has(item.course_id))
          .map((item) => ({
            ...item,
            isLatest: courses.data?.find((course) => course.id === item.course_id)
              ?.latest_published_version_id === item.id,
          }))
          .sort((a, b) => Number(b.isLatest) - Number(a.isLatest)),
      }
    },
  })
}

export function useCreateOffering(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (values: OfferingValues) => {
      if (!tenantId) throw new Error('Escuela no disponible')
      const { data, error } = await client().rpc('create_offering', {
        p_tenant_id: tenantId,
        p_client_id: values.clientId,
        p_version_id: values.versionId,
        p_title: values.title.trim(),
        p_code: values.code.trim(),
        p_modality: values.modality,
        p_starts_at: values.startsAt ? new Date(values.startsAt).toISOString() : null,
        p_ends_at: values.endsAt ? new Date(values.endsAt).toISOString() : null,
        p_seats: values.seats ? Number(values.seats) : null,
        p_enrollment_mode: values.enrollmentMode,
        p_timezone: values.timezone,
      })
      check(error)
      if (!data) throw new Error('No se recibió la edición creada')
      return data
    },
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['offerings', tenantId] }),
  })
}

export function useOffering(tenantId: string | undefined, offeringId: string | undefined) {
  return useQuery({
    queryKey: ['offering', tenantId, offeringId],
    enabled: !!supabase && !!tenantId && !!offeringId,
    queryFn: async () => {
      const db = client()
      const [offering, enrollments, clients] = await Promise.all([
        db.from('offerings').select('*').eq('tenant_id', tenantId!)
          .eq('id', offeringId!).single(),
        db.from('enrollments').select('*').eq('tenant_id', tenantId!)
          .eq('offering_id', offeringId!).order('enrolled_at'),
        db.from('clients').select('id,name').eq('tenant_id', tenantId!),
      ])
      check(offering.error)
      check(enrollments.error)
      check(clients.error)
      return {
        offering: offering.data!,
        enrollments: enrollments.data ?? [],
        clientName: clients.data?.find((item) => item.id === offering.data?.client_id)
          ?.name ?? '—',
      }
    },
  })
}

export function useOfferingRoster(offeringId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['offering-roster', offeringId],
    enabled: !!supabase && !!offeringId && enabled,
    queryFn: async () => {
      const { data, error } = await client().rpc('list_offering_roster', {
        p_offering_id: offeringId!,
      })
      check(error)
      return data ?? []
    },
  })
}

export function useEnrollableStudents(offeringId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['enrollable-students', offeringId],
    enabled: !!supabase && !!offeringId && enabled,
    queryFn: async () => {
      const { data, error } = await client().rpc('list_enrollable_students', {
        p_offering_id: offeringId!,
      })
      check(error)
      return data ?? []
    },
  })
}

export function useEnrollStudents(
  tenantId: string | undefined,
  offeringId: string | undefined,
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!offeringId) throw new Error('Edición no disponible')
      const successes: string[] = []
      const failures: { userId: string; error: unknown }[] = []

      for (const userId of userIds) {
        try {
          const { error } = await client().rpc('enroll_user', {
            p_offering_id: offeringId,
            p_user_id: userId,
          })
          check(error)
          successes.push(userId)
        } catch (error) {
          failures.push({ userId, error })
        }
      }

      return { successes, failures }
    },
    onSettled: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['offering-roster', offeringId] }),
        cache.invalidateQueries({ queryKey: ['enrollable-students', offeringId] }),
        cache.invalidateQueries({ queryKey: ['offering', tenantId, offeringId] }),
        cache.invalidateQueries({ queryKey: ['offerings', tenantId] }),
      ])
    },
  })
}

export function useOutline(offeringId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['outline', offeringId],
    enabled: !!supabase && !!offeringId && enabled,
    queryFn: async () => {
      const { data, error } = await client().rpc('get_course_outline', {
        p_offering_id: offeringId!,
      })
      check(error)
      return data as Json
    },
  })
}

export function useOfferingAction(
  tenantId: string | undefined, offeringId: string | undefined,
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (
      action:
        | { kind: 'status'; status: Database['public']['Enums']['offering_status'] }
        | { kind: 'enrollment'; id: string; status: Database['public']['Enums']['enrollment_status'] },
    ) => {
      if (!offeringId) throw new Error('Edición no disponible')
      if (action.kind === 'status') {
        const { error } = await client().from('offerings')
          .update({ status: action.status }).eq('id', offeringId)
        check(error)
      } else {
        const { error } = await client().rpc('set_enrollment_status', {
          p_enrollment_id: action.id, p_status: action.status,
        })
        check(error)
      }
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['offering', tenantId, offeringId] })
      void cache.invalidateQueries({ queryKey: ['offering-roster', offeringId] })
      void cache.invalidateQueries({ queryKey: ['offerings', tenantId] })
    },
  })
}

export function useOfferingInvitations(offeringId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['offering-invitations', offeringId],
    enabled: !!supabase && !!offeringId && enabled,
    queryFn: async () => {
      const { data, error } = await client().rpc('list_offering_invitations', {
        p_offering_id: offeringId!,
      })
      check(error)
      return data ?? []
    },
  })
}

export function useCreateInvitation(offeringId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      if (!offeringId) throw new Error('Edición no disponible')
      const { data, error } = await client().rpc('create_invitation', {
        p_offering_id: offeringId,
        p_email: email.trim().toLowerCase(),
      })
      check(error)
      return createdInvitationSchema.parse(data)
    },
    onSuccess: () => void cache.invalidateQueries({
      queryKey: ['offering-invitations', offeringId],
    }),
  })
}

export function useRevokeInvitation(offeringId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await client().rpc('revoke_invitation', {
        p_invitation_id: invitationId,
      })
      check(error)
    },
    onSuccess: () => void cache.invalidateQueries({
      queryKey: ['offering-invitations', offeringId],
    }),
  })
}
