import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { planSchema, sessionSchema, summariesSchema, type PlanFile, type PlanItem, type SessionPlan } from './planning-utils'

const bucket = 'lesson-plans'
function client() { if (!supabase) throw new Error('Supabase no está configurado'); return supabase }
export function useLessonPlan(lessonId: string) {
  return useQuery({ queryKey: ['lesson-plan', lessonId], enabled: !!supabase && !!lessonId, queryFn: async () => {
    const { data, error } = await client().rpc('get_lesson_plan', { p_lesson_id: lessonId }); if (error) throw error; return planSchema.parse(data)
  } })
}
export function useSavePlan(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({ mutationFn: async (items: PlanItem[]) => { const { error } = await client().rpc('save_lesson_plan', { p_lesson_id: lessonId, p_items: items }); if (error) throw error }, onSettled: () => Promise.all([cache.invalidateQueries({ queryKey: ['lesson-plan', lessonId] }), cache.invalidateQueries({ queryKey: ['session-plan'] }), cache.invalidateQueries({ queryKey: ['plan-progress'] })]) })
}
export function usePlanFiles(lessonId: string, tenantId: string) {
  const cache = useQueryClient()
  return useMutation({ mutationFn: async (input: { file?: File; remove?: PlanFile }) => {
    const db = client()
    if (input.file) {
      const f = input.file
      if (!/\.(pdf|doc|docx|ppt|pptx)$/i.test(f.name) || f.size <= 0 || f.size > 26214400) throw new Error('Archivo no válido (PDF, Word o PPT, máximo 25 MB)')
      const path = `${tenantId}/${lessonId}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await db.storage.from(bucket).upload(path, f, { contentType: f.type || undefined }); if (error) throw error
      const result = await db.rpc('add_lesson_plan_file', { p_lesson_id: lessonId, p_name: f.name, p_storage_path: path, p_size_bytes: f.size })
      if (result.error) { await db.storage.from(bucket).remove([path]); throw result.error }
    }
    if (input.remove) {
      const result = await db.storage.from(bucket).remove([input.remove.storage_path]); if (result.error) throw result.error
      const { error } = await db.rpc('remove_lesson_plan_file', { p_file_id: input.remove.id }); if (error) throw error
    }
  }, onSettled: () => Promise.all([cache.invalidateQueries({ queryKey: ['lesson-plan', lessonId] }), cache.invalidateQueries({ queryKey: ['session-plan'] })]) })
}
export async function openPlanFile(path: string) { const { data, error } = await client().storage.from(bucket).createSignedUrl(path, 3600); if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener,noreferrer') }
export function useSessionPlan(offeringId: string, lessonId: string) {
  return useQuery({ queryKey: ['session-plan', offeringId, lessonId], enabled: !!supabase && !!offeringId && !!lessonId, queryFn: async () => { const { data, error } = await client().rpc('get_session_plan', { p_offering_id: offeringId, p_lesson_id: lessonId }); if (error) throw error; return sessionSchema.parse(data) } })
}
export function usePlanProgress(offeringId: string | undefined) {
  return useQuery({ queryKey: ['plan-progress', offeringId], enabled: !!supabase && !!offeringId, queryFn: async () => { const { data, error } = await client().rpc('list_offering_plan_progress', { p_offering_id: offeringId! }); if (error) throw error; return summariesSchema.parse(data) } })
}
export function useMarkPlan(offeringId: string, lessonId: string) {
  const cache = useQueryClient(); const key = ['session-plan', offeringId, lessonId]
  return useMutation({ mutationFn: async (input: { id: string; done: boolean }) => { const { error } = await client().rpc('set_plan_item_done', { p_offering_id: offeringId, p_item_id: input.id, p_done: input.done }); if (error) throw error },
    onMutate: async (input) => { await cache.cancelQueries({ queryKey: key }); const previous = cache.getQueryData<SessionPlan>(key); if (previous) cache.setQueryData<SessionPlan>(key, { ...previous, progress: [...previous.progress.filter((p) => p.item_id !== input.id), { item_id: input.id, done: input.done, done_at: input.done ? new Date().toISOString() : null, done_by: null }] }); return { previous } },
    onError: (_e, _i, context) => { if (context?.previous) cache.setQueryData(key, context.previous) }, onSettled: () => Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ queryKey: ['plan-progress', offeringId] })]) })
}
