import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { liveAnalysisSchema, liveWordcloudGroupsSchema } from './live-ai'
import { liveRpc } from './live-api'
import type { LiveRpcInput, LiveRpcName, LiveRpcOutput } from './live-contract'

export const liveActivitiesKey = (lessonId: string) => ['live', 'activities', lessonId] as const
export const liveControlKey = (sessionId: string) => ['live', 'control', sessionId] as const

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
export const useSetLiveRunReveal = () => useControlMutation('set_live_run_reveal')
export const useSetLiveRunRanking = () => useControlMutation('set_live_run_ranking')
export const useModerateLiveResponse = () => useControlMutation('moderate_live_response')
export const useMergeLiveTerm = () => useControlMutation('merge_live_term')
export const useEndLiveSession = () => useControlMutation('end_live_session')
