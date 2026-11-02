import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  sheetSchema, summarySchema,
  type AttendanceSheet, type AttendanceStatus, type AttendanceSummary,
} from './attendance-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { message: string } | null) {
  if (error) throw error
}

const keys = {
  summary: (offeringId: string) => ['attendance', 'summary', offeringId] as const,
  sheet: (sessionId: string) => ['attendance', 'sheet', sessionId] as const,
}

export type Mark = { enrollment_id: string; status: AttendanceStatus }

function useRefresh(offeringId: string) {
  const cache = useQueryClient()
  return async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['attendance'] }),
      cache.invalidateQueries({ queryKey: ['certificates'] }),
    ])
    return offeringId
  }
}

export function useAttendanceSummary(offeringId: string) {
  return useQuery({
    queryKey: keys.summary(offeringId),
    enabled: !!supabase,
    queryFn: async (): Promise<AttendanceSummary> => {
      const { data, error } = await client().rpc('get_attendance_summary', {
        p_offering_id: offeringId,
      })
      check(error)
      return summarySchema.parse(data)
    },
  })
}

export function useAttendanceSheet(sessionId: string | null) {
  return useQuery({
    queryKey: keys.sheet(sessionId ?? ''),
    enabled: !!supabase && !!sessionId,
    queryFn: async (): Promise<AttendanceSheet> => {
      const { data, error } = await client().rpc('get_attendance_sheet', {
        p_session_id: sessionId!,
      })
      check(error)
      return sheetSchema.parse(data)
    },
  })
}

export function useCreateSession(offeringId: string) {
  const refresh = useRefresh(offeringId)
  return useMutation({
    mutationFn: async (values: { title: string; date: string }): Promise<string> => {
      const { data, error } = await client().rpc('create_attendance_session', {
        p_offering_id: offeringId, p_title: values.title, p_date: values.date,
      })
      check(error)
      return String(data)
    },
    onSuccess: refresh,
  })
}

export function useUpdateSession(offeringId: string) {
  const refresh = useRefresh(offeringId)
  return useMutation({
    mutationFn: async (values: { sessionId: string; title: string; date: string }) => {
      const { error } = await client().rpc('update_attendance_session', {
        p_session_id: values.sessionId, p_title: values.title, p_date: values.date,
      })
      check(error)
    },
    onSuccess: refresh,
  })
}

export function useDeleteSession(offeringId: string) {
  const refresh = useRefresh(offeringId)
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await client().rpc('delete_attendance_session', {
        p_session_id: sessionId,
      })
      check(error)
    },
    onSuccess: refresh,
  })
}

export function useSaveMarks(offeringId: string) {
  const refresh = useRefresh(offeringId)
  return useMutation({
    mutationFn: async (values: { sessionId: string; marks: Mark[] }) => {
      if (values.marks.length === 0) return
      const { error } = await client().rpc('set_attendance', {
        p_session_id: values.sessionId, p_marks: values.marks,
      })
      check(error)
    },
    onSuccess: refresh,
  })
}

export function useCloseSession(offeringId: string) {
  const refresh = useRefresh(offeringId)
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await client().rpc('close_attendance_session', {
        p_session_id: sessionId,
      })
      check(error)
    },
    onSuccess: refresh,
  })
}

export function useReopenSession(offeringId: string) {
  const refresh = useRefresh(offeringId)
  return useMutation({
    mutationFn: async (values: { sessionId: string; reason: string }) => {
      const { error } = await client().rpc('reopen_attendance_session', {
        p_session_id: values.sessionId, p_reason: values.reason,
      })
      check(error)
    },
    onSuccess: refresh,
  })
}
