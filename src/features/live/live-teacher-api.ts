import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { liveAnalysisSchema, liveWordcloudGroupsSchema } from './live-ai'
import { liveRpc } from './live-api'
import type { LiveRpcInput, LiveRpcName, LiveRpcOutput } from './live-contract'

export const liveActivitiesKey = (lessonId: string) => ['live', 'activities', lessonId] as const
export const liveControlKey = (sessionId: string) => ['live', 'control', sessionId] as const
export const offeringLiveSessionKey = (offeringId: string) => ['live', 'offering-session', offeringId] as const

async function liveAiError(error: unknown): Promise<Error> {
  let code = ''
  let status = 0
  if (typeof error === 'object' && error !== null && 'context' in error && error.context instanceof Response) {
    status = error.context.status
    try {
      const body: unknown = await error.context.json()
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') code = body.error
    } catch { /* La respuesta de error puede no ser JSON. */ }
  }
  const key = code === 'not_configured' || (!code && status === 503) ? 'live.aiNotConfigured'
    : code === 'no_data' || (!code && status === 422) ? 'live.aiNoData'
    : code === 'forbidden' || (!code && status === 403) ? 'live.aiForbidden'
    : code === 'model_error' || (!code && status === 502) ? 'live.aiModelError'
    : 'live.aiError'
  return new Error(i18n.t(key))
}

async function invokeLiveAi(body: { action: 'analyze' | 'group'; session_id: string; run_id?: string }): Promise<unknown> {
  if (!supabase) throw new Error(i18n.t('live.aiError'))
  const { data, error } = await supabase.functions.invoke('live-ai', { body })
  if (error) throw await liveAiError(error)
  return data
}

export function useLiveAi() {
  const analyzeGroup = useMutation({
    mutationFn: async (sessionId: string) => {
      const result = liveAnalysisSchema.safeParse(await invokeLiveAi({ action: 'analyze', session_id: sessionId }))
      if (!result.success) throw new Error(i18n.t('live.aiInvalidResponse'))
      return result.data
    },
  })
  const groupWordcloud = useMutation({
    mutationFn: async ({ sessionId, runId }: { sessionId: string; runId: string }) => {
      const result = liveWordcloudGroupsSchema.safeParse(await invokeLiveAi({ action: 'group', session_id: sessionId, run_id: runId }))
      if (!result.success) throw new Error(i18n.t('live.aiInvalidResponse'))
      return result.data
    },
  })
  return { analyzeGroup, groupWordcloud }
}

function useVisibleRefresh(sessionId: string, code: string | undefined, offeringId?: string) {
  const cache = useQueryClient()
  useEffect(() => {
    if (!sessionId) return
    const refresh = () => { if (!document.hidden) {
      void cache.invalidateQueries({ queryKey: liveControlKey(sessionId) })
      if (offeringId) void cache.invalidateQueries({ queryKey: offeringLiveSessionKey(offeringId) })
    } }
    document.addEventListener('visibilitychange', refresh)
    if (!code || !supabase) return () => document.removeEventListener('visibilitychange', refresh)
    const client = supabase
    const channel = client.channel(`live:${code}`).on('broadcast', { event: 'changed' }, refresh).subscribe()
    return () => { document.removeEventListener('visibilitychange', refresh); void client.removeChannel(channel) }
  }, [cache, sessionId, code, offeringId])
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
      const offerings = cache.getQueriesData<LiveRpcOutput<'get_offering_live_session'>>({ queryKey: ['live', 'offering-session'] })
      for (const [key, state] of offerings) if (state?.session.lesson_id === lessonId) {
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

export function useOfferingLiveSession(offeringId: string) {
  const query = useQuery({
    queryKey: offeringLiveSessionKey(offeringId), enabled: !!offeringId && !!supabase,
    queryFn: () => liveRpc('get_offering_live_session', { p_offering_id: offeringId }),
    refetchInterval: 2000,
    retry: false,
  })
  useVisibleRefresh(query.data?.session.id ?? '', query.data?.session.code, offeringId)
  return query
}

export function useLiveSessions(offeringId: string, lessonId: string) {
  return useQuery({
    queryKey: ['live', 'sessions', offeringId, lessonId], enabled: !!offeringId && !!lessonId && !!supabase,
    queryFn: () => liveRpc('list_live_sessions', { p_offering_id: offeringId, p_lesson_id: lessonId }),
    retry: false,
  })
}

type ControlMutation = Exclude<LiveRpcName,
  'get_live_activities' | 'save_live_activities' | 'get_live_control_state' | 'get_offering_live_session' | 'list_live_sessions' |
  'join_live_session' | 'get_live_state' | 'submit_live_response' | 'get_projector_state'>

function useControlMutation<K extends ControlMutation>(name: K) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (input: LiveRpcInput<K>) => liveRpc(name, input),
    onSuccess: (state) => {
      cache.setQueryData(liveControlKey(state.session.id), state)
      cache.setQueryData(offeringLiveSessionKey(state.session.offering_id), state.session.status === 'active' ? state : null)
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
export const useSetLiveRunReveal = () => useControlMutation('set_live_run_reveal')
export const useSetLiveRunRanking = () => useControlMutation('set_live_run_ranking')
export const useModerateLiveResponse = () => useControlMutation('moderate_live_response')
export const useMergeLiveTerm = () => useControlMutation('merge_live_term')
export const useEndLiveSession = () => useControlMutation('end_live_session')
export const useResetLiveRun = () => useControlMutation('reset_live_run')
export const useResetLiveSessionResults = () => useControlMutation('reset_live_session_results')
