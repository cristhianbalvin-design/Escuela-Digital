import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { liveRpc } from './live-api'

export const liveNotesKey = (lessonId: string) => ['live-notes', lessonId] as const
export function useLiveNotes(lessonId: string) {
  return useQuery({
    queryKey: liveNotesKey(lessonId), enabled: !!lessonId && !!supabase,
    queryFn: () => liveRpc('get_live_notes', { p_lesson_id: lessonId }),
    retry: false,
  })
}
function useSaveLiveNotes(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (notes: { target_id: string; notes: string }[]) => liveRpc('save_live_notes', { p_lesson_id: lessonId, p_notes: notes }),
    onSuccess: (notes) => { cache.setQueryData(liveNotesKey(lessonId), notes) },
  })
}

/** Guion del docente para una actividad o pregunta: se guarda solo y nunca llega a los alumnos. */
export function NotesField({ lessonId, targetId, label, hint, editable = true, tall = false }: {
  lessonId: string; targetId: string; label: string; hint?: string; editable?: boolean; tall?: boolean
}) {
  const { t } = useTranslation()
  const query = useLiveNotes(lessonId)
  const save = useSaveLiveNotes(lessonId)
  const saved = query.data?.find((item) => item.target_id === targetId)?.notes ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const value = draft ?? saved
  const { mutate } = save

  useEffect(() => {
    if (draft === null || draft === saved) return
    const id = window.setTimeout(() => {
      setStatus(t('presentation.notes.saving'))
      const sent = draft
      mutate([{ target_id: targetId, notes: sent.slice(0, 6000) }], {
        onSuccess: () => { setStatus(t('presentation.notes.saved')); setDraft((current) => current === sent ? null : current) },
        onError: (error) => setStatus(error instanceof Error ? error.message : t('presentation.error')),
      })
    }, 800)
    return () => window.clearTimeout(id)
  }, [draft, saved, targetId, mutate, t])

  return <label className="grid gap-1 text-sm font-semibold">
    <span className="flex flex-wrap items-baseline justify-between gap-2">{label}
      {status && <span role="status" aria-live="polite" className="text-xs font-normal text-text-muted">{status}</span>}</span>
    {hint && <span className="text-xs font-normal text-text-muted">{hint}</span>}
    <textarea className={`w-full rounded-control border border-border bg-surface p-3 text-base font-normal ${tall ? 'min-h-48' : 'min-h-28'}`} maxLength={6000}
      disabled={!editable || query.isPending} value={value} placeholder={t('live.notes.placeholder')} onChange={(event) => setDraft(event.target.value)} />
  </label>
}

/** Dictar: guion de la actividad y de la pregunta en curso, al costado. */
export function TeacherNotesAside({ lessonId, setId, setTitle, questionId, questionTitle }: {
  lessonId: string; setId: string | null; setTitle: string | null; questionId: string | null; questionTitle: string | null
}) {
  const { t } = useTranslation()
  const query = useLiveNotes(lessonId)
  const find = (id: string | null) => id ? query.data?.find((item) => item.target_id === id)?.notes ?? '' : ''
  const setNotes = find(setId)
  const questionNotes = questionId !== setId ? find(questionId) : ''
  return <aside aria-label={t('live.notes.title')} className="grid content-start gap-3 rounded-control border border-border bg-surface p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('live.notes.title')}</p>
    {!setNotes && !questionNotes && <p className="text-sm text-text-muted">{t('live.notes.none')}</p>}
    {setNotes && <div className="grid gap-1">
      {setTitle && <p className="text-sm font-semibold">{setTitle}</p>}
      <p className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-lg leading-relaxed">{setNotes}</p>
    </div>}
    {questionNotes && <div className="grid gap-1 border-t border-border pt-3">
      <p className="text-sm font-semibold">{t('live.notes.question')}{questionTitle ? ` · ${questionTitle}` : ''}</p>
      <p className="max-h-[30vh] overflow-y-auto whitespace-pre-wrap text-lg leading-relaxed">{questionNotes}</p>
    </div>}
  </aside>
}
