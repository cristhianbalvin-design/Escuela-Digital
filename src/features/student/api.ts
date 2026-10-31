import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'
import { parseOutline } from './utils'

type Tables = Database['public']['Tables']
export type StudentEnrollment = Pick<Tables['enrollments']['Row'],
  'id' | 'offering_id' | 'status' | 'progress_pct' | 'enrolled_at' |
  'last_activity_at'>
export type StudentOffering = Pick<Tables['offerings']['Row'],
  'id' | 'title' | 'code' | 'status' | 'starts_at' | 'ends_at' |
  'modality' | 'timezone' | 'release_schedule'>
export type StudentProgress = Pick<Tables['lesson_progress']['Row'],
  'enrollment_id' | 'lesson_id' | 'status' | 'completed_at' |
  'last_position_seconds'>
export type StudentCourse = {
  enrollment: StudentEnrollment
  offering: StudentOffering
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw error
}

export function useStudentCourses(tenantId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['student-courses', tenantId, userId],
    enabled: !!supabase && !!tenantId && !!userId,
    queryFn: async (): Promise<StudentCourse[]> => {
      const db = client()
      const enrollments = await db.from('enrollments')
        .select('id,offering_id,status,progress_pct,enrolled_at,last_activity_at')
        .eq('tenant_id', tenantId!)
        .eq('user_id', userId!)
        .order('last_activity_at', { ascending: false, nullsFirst: false })
      check(enrollments.error)
      const rows = enrollments.data ?? []
      if (rows.length === 0) return []

      const offerings = await db.from('offerings')
        .select('id,title,code,status,starts_at,ends_at,modality,timezone,release_schedule')
        .eq('tenant_id', tenantId!)
        .in('id', rows.map((row) => row.offering_id))
        .is('deleted_at', null)
      check(offerings.error)

      return rows.flatMap((enrollment) => {
        const offering = offerings.data?.find((item) =>
          item.id === enrollment.offering_id)
        return offering ? [{ enrollment, offering }] : []
      })
    },
  })
}

export function useStudentProgress(enrollmentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['student-progress', enrollmentId],
    enabled: !!supabase && !!enrollmentId && enabled,
    queryFn: async (): Promise<StudentProgress[]> => {
      const { data, error } = await client().from('lesson_progress')
        .select('enrollment_id,lesson_id,status,completed_at,last_position_seconds')
        .eq('enrollment_id', enrollmentId!)
      check(error)
      return data ?? []
    },
  })
}

export function useStudentOutline(offeringId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['student-outline', offeringId],
    enabled: !!supabase && !!offeringId && enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await client().rpc('get_course_outline', {
        p_offering_id: offeringId!,
      })
      check(error)
      return parseOutline(data as Json | null)
    },
  })
}

export function useMarkLessonProgress(
  tenantId: string | undefined,
  userId: string | undefined,
  enrollmentId: string | undefined,
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({
      lessonId,
      status,
    }: {
      lessonId: string
      status: Database['public']['Enums']['lesson_progress_status']
    }) => {
      if (!enrollmentId) throw new Error('Matrícula no disponible')
      const { data, error } = await client().rpc('mark_lesson_progress', {
        p_enrollment_id: enrollmentId,
        p_lesson_id: lessonId,
        p_status: status,
      })
      check(error)
      return data
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['student-progress', enrollmentId] }),
        cache.invalidateQueries({ queryKey: ['student-courses', tenantId, userId] }),
      ])
    },
  })
}

export function studentErrorKey(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
  if (code === '42501') return 'student.errors.noAccess'
  if (code === '23514') return 'student.errors.unavailable'
  return 'student.errors.generic'
}
