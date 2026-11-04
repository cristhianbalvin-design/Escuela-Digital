import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  agendaSchema, analyticsSchema, studentsSchema,
  type AgendaRow, type AnalyticsRow, type GlobalStudent,
} from './global-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useMySchedule(tenantId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['my-schedule', tenantId, from, to],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<AgendaRow[]> => {
      const { data, error } = await client().rpc('get_my_schedule', {
        p_tenant_id: tenantId!, p_from: from, p_to: to,
      })
      if (error) throw error
      return agendaSchema.parse(data)
    },
  })
}

export function useMyStudents(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['my-students', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<GlobalStudent[]> => {
      const { data, error } = await client().rpc('list_my_students', { p_tenant_id: tenantId! })
      if (error) throw error
      return studentsSchema.parse(data)
    },
  })
}

export function useMyAnalytics(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['my-analytics', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<AnalyticsRow[]> => {
      const { data, error } = await client().rpc('get_my_analytics', { p_tenant_id: tenantId! })
      if (error) throw error
      return analyticsSchema.parse(data)
    },
  })
}
