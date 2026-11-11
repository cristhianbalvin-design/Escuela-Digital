import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { liveRpc } from './live-api'
import type { LiveRpcInput, LiveRpcName, LiveRpcOutput } from './live-contract'

export const liveActivitiesKey = (lessonId: string) => ['live', 'activities', lessonId] as const
export const liveControlKey = (sessionId: string) => ['live', 'control', sessionId] as const

function useVisibleRefresh(sessionId: string, code: string | undefined) {
  const cache = useQueryClient()
  useEffect(() => {
    if (!sessionId) return
    const refresh = () => { if (!document.hidden) void cache.invalidateQueries({ queryKey: liveControlKey(sessionId) }) }
    document.addEventListener('visibilitychange', refresh)
    if (!code || !supabase) return () => document.removeEventListener('visibilitychange', refresh)
    const client = supabase
    const channel = client.channel(`live:${code}`).on('broadcast', { event: 'changed' }, refresh).subscribe()
    return () => { document.removeEventListener('visibilitychange', refresh); void client.removeChannel(channel) }
  }, [cache, sessionId, code])
}

async function ping(code: string) {
  if (!supabase) return
  try {
    const channel = supabase.channel(`live:${code}`)
    await channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.send({ type: 'broadcast', event: 'changed', payload: {} })
          .catch(() => undefined).finally(() => { void supabase?.removeChannel(channel) })
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') void supabase?.removeChannel(channel)
    })
  } catch { /* El polling mantiene la sincronización. */ }
}

export function useLiveActivities(lessonId: string) {
  return useQuery({
    queryKey: liveActivitiesKey(lessonId), enabled: !!lessonId && !!supabase,
    queryFn: () => liveRpc('get_live_activities', { p_lesson_id: lessonId }),
  })
}

export function useSaveLiveActivities(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (items: LiveRpcInput<'save_live_activities'>['p_items']) =>
      liveRpc('save_live_activities', { p_lesson_id: lessonId, p_items: items }),
    onSuccess: (activities) => {
      cache.setQueryData(liveActivitiesKey(lessonId), activities)
      const controls = cache.getQueriesData<LiveRpcOutput<'get_live_control_state'>>({ queryKey: ['live', 'control'] })
      for (const [key, state] of controls) if (state?.session.lesson_id === lessonId) {
        cache.setQueryData(key, { ...state, activities })
        void ping(state.session.code)
      }
    },
  })
}

export function useLiveControlState(sessionId: string) {
  const query = useQuery({
    queryKey: liveControlKey(sessionId), enabled: !!sessionId && !!supabase,
    queryFn: () => liveRpc('get_live_control_state', { p_session_id: sessionId }),
    refetchInterval: () => document.hidden ? false : 2000,
    retry: false,
  })
  useVisibleRefresh(sessionId, query.data?.session.code)
  return query
}

type ControlMutation = Exclude<LiveRpcName,
  'get_live_activities' | 'save_live_activities' | 'get_live_control_state' |
  'join_live_session' | 'get_live_state' | 'submit_live_response' | 'get_projector_state'>

function useControlMutation<K extends ControlMutation>(name: K) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (input: LiveRpcInput<K>) => liveRpc(name, input),
    onSuccess: (state) => {
      cache.setQueryData(liveControlKey(state.session.id), state)
      cache.setQueryData(liveActivitiesKey(state.session.lesson_id), state.activities)
      void cache.invalidateQueries({ queryKey: ['session-plan', state.session.offering_id, state.session.lesson_id] })
      void cache.invalidateQueries({ queryKey: ['plan-progress', state.session.offering_id] })
      void ping(state.session.code)
    },
  })
}

export const useCreateLiveSession = () => useControlMutation('create_live_session')
export const useLaunchLiveRun = () => useControlMutation('launch_live_run')
export const useCloseLiveRun = () => useControlMutation('close_live_run')
export const useSetLiveRunVisibility = () => useControlMutation('set_live_run_visibility')
export const useSetLiveRunPaused = () => useControlMutation('set_live_run_paused')
export const useModerateLiveResponse = () => useControlMutation('moderate_live_response')
export const useMergeLiveTerm = () => useControlMutation('merge_live_term')
export const useEndLiveSession = () => useControlMutation('end_live_session')
