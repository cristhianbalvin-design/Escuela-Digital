import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { scheduleSchema, type ScheduleRow } from './schedule-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useSchedule(offeringId: string | undefined) {
  return useQuery({
    queryKey: ['schedule', offeringId],
    enabled: !!supabase && !!offeringId,
    queryFn: async (): Promise<ScheduleRow[]> => {
      const { data, error } = await client().rpc('get_offering_schedule', {
        p_offering_id: offeringId!,
      })
      if (error) throw error
      return scheduleSchema.parse(data)
    },
  })
}

export type ScheduleItem = {
  lesson_id: string
  session_date: string
  start_time: string | null
  end_time: string | null
}

export function useSaveSchedule(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (items: ScheduleItem[]) => {
      const { error } = await client().rpc('save_offering_schedule', {
        p_offering_id: offeringId,
        p_items: items,
      })
      if (error) throw error
    },
    onSuccess: () => Promise.all([
      cache.invalidateQueries({ queryKey: ['schedule', offeringId] }),
      cache.invalidateQueries({ queryKey: ['attendance'] }),
    ]),
  })
}

export function useCreateAttendanceFromSchedule(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await client().rpc('create_attendance_from_schedule', {
        p_offering_id: offeringId,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => Promise.all([
      cache.invalidateQueries({ queryKey: ['schedule', offeringId] }),
      cache.invalidateQueries({ queryKey: ['attendance'] }),
    ]),
  })
}
