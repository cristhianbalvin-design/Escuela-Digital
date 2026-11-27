import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  liveRpcInputSchemas, liveRpcOutputSchemas,
  type LiveRpcInput, type LiveRpcName, type LiveRpcOutput,
} from './live-contract'

type RpcResult = { data: unknown; error: { message: string } | null }
type RpcCaller = (name: LiveRpcName, args: Record<string, unknown>) => Promise<RpcResult>

/** Both sides of every RPC are checked at the network boundary. */
export async function liveRpc<K extends LiveRpcName>(name: K, input: LiveRpcInput<K>): Promise<LiveRpcOutput<K>> {
  const args = liveRpcInputSchemas[name].parse(input) as Record<string, unknown>
  if (!supabase) throw new Error('Supabase no está configurado.')
  const call = supabase.rpc.bind(supabase) as unknown as RpcCaller
  const { data, error } = await call(name, args)
  if (error) throw new Error(error.message)
  return liveRpcOutputSchemas[name].parse(data) as LiveRpcOutput<K>
}

function useLiveRefresh(code: string, key: readonly unknown[]) {
  const client = useQueryClient()
  useEffect(() => {
    const sb = supabase
    if (!sb || !code) return
    const refresh = () => {
      if (!document.hidden) void client.invalidateQueries({ queryKey: key })
    }
    document.addEventListener('visibilitychange', refresh)
    const channel = sb.channel(`live:${code}`)
      .on('broadcast', { event: 'changed' }, refresh)
      .subscribe()
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      void sb.removeChannel(channel)
    }
  }, [code, client, ...key]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useLiveState(code: string, token: string | null) {
  const key = ['live', 'student', code, token] as const
  useLiveRefresh(code, key)
  return useQuery({
    queryKey: key,
    queryFn: () => liveRpc('get_live_state', { p_code: code, p_token: token! }),
    enabled: !!token && !!supabase,
    refetchInterval: () => document.hidden ? false : 4000,
    retry: false,
  })
}

export function useProjectorState(code: string) {
  const key = ['live', 'projector', code] as const
  useLiveRefresh(code, key)
  return useQuery({
    queryKey: key,
    queryFn: () => liveRpc('get_projector_state', { p_code: code }),
    enabled: !!supabase,
    refetchInterval: () => document.hidden ? false : 3000,
    retry: false,
  })
}

export function useCoursePrepStatus(versionId: string | undefined) {
  return useQuery({
    queryKey: ['course-prep-status', versionId],
    enabled: !!supabase && !!versionId,
    queryFn: () => liveRpc('get_course_prep_status', { p_version_id: versionId! }),
  })
}

export function useOfferingSessionsStatus(offeringId: string | undefined) {
  return useQuery({
    queryKey: ['offering-sessions-status', offeringId],
    enabled: !!supabase && !!offeringId,
    queryFn: () => liveRpc('get_offering_sessions_status', { p_offering_id: offeringId! }),
  })
}

/** Ficha publicada por el docente: solo su parte pública. Se actualiza con el mismo aviso en vivo de la clase. */
export function useLivePublishedSheet(code: string, token: string | null) {
  const key = ['live', 'student-sheet', code, token] as const
  useLiveRefresh(code, key)
  return useQuery({
    queryKey: key,
    queryFn: () => liveRpc('get_live_published_sheet', { p_code: code, p_token: token! }),
    enabled: !!token && !!supabase,
    refetchInterval: () => document.hidden ? false : 5000,
    retry: false,
  })
}
