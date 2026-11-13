import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import type { LessonPresentation, LiveScreen } from './live-contract'
import { useLiveScreen, useSetLiveScreen } from './live-teacher-api'
import { effectiveScreen, slideUrl, useDeletePresentation, useLessonPresentation, useUploadPresentation } from './presentation'

/** Guion de la sesión: subir, reemplazar o quitar la presentación en PDF. */
export function PresentationPanel({ lessonId, editable }: { lessonId: string; editable: boolean }) {
  const { t } = useTranslation()
  const query = useLessonPresentation(lessonId)
  const upload = useUploadPresentation(lessonId)
  const remove = useDeletePresentation(lessonId)
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  const [showAll, setShowAll] = useState(false)
  const presentation = query.data ?? null

  async function pick(file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setMessage(t('presentation.onlyPdf')); return }
    setMessage(''); setProgress({ done: 0, total: 0 })
    try {
      await upload.mutateAsync({ file, onProgress: (done, total) => setProgress({ done, total }) })
      setMessage(t('presentation.ready'))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('presentation.error')) }
    finally { setProgress(null); if (input.current) input.current.value = '' }
  }

  const thumbs = presentation ? Array.from({ length: showAll ? presentation.page_count : Math.min(6, presentation.page_count) }, (_, i) => i + 1) : []
  return <section aria-label={t('presentation.title')} className="grid gap-3 rounded-control border border-border bg-surface-elevated p-4">
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('presentation.title')}</p>
        {presentation ? <>
          <p className="break-words font-semibold">{presentation.file_name}</p>
          <p className="text-sm text-text-muted">{t('presentation.summary', { count: presentation.page_count })}</p>
        </> : <p className="text-sm text-text-muted">{t('presentation.empty')}</p>}
      </div>
      {editable && <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={t('presentation.choose')} onChange={(event) => void pick(event.target.files?.[0])} />
        <Button variant={presentation ? 'secondary' : 'primary'} disabled={upload.isPending} onClick={() => input.current?.click()}>{t(presentation ? 'presentation.replace' : 'presentation.upload')}</Button>
        {presentation && <Button variant="secondary" disabled={upload.isPending || remove.isPending} onClick={() => { if (window.confirm(t('presentation.confirmRemove'))) void remove.mutateAsync().catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('presentation.error'))) }}>{t('presentation.remove')}</Button>}
      </div>}
    </div>
    {progress && <div className="grid gap-1" role="status" aria-live="polite">
      <p className="text-sm">{progress.total ? t('presentation.processing', { done: progress.done, total: progress.total }) : t('presentation.opening')}</p>
      <progress className="w-full" max={progress.total || 1} value={progress.done} />
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {presentation && !progress && <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">{thumbs.map((n) => <img key={n} src={slideUrl(presentation, n)} alt={t('presentation.slideN', { number: n })} loading="lazy"
        className="h-16 w-auto rounded border border-border bg-white" />)}</div>
      {presentation.page_count > 6 && <Button variant="secondary" className="w-fit" onClick={() => setShowAll((value) => !value)}>{t(showAll ? 'presentation.showLess' : 'presentation.showAll', { count: presentation.page_count })}</Button>}
    </div>}
  </section>
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Dictar: decide qué ve el proyector y maneja la presentación con libertad. */
export function ScreenControl({ sessionId, code, latestRunOpenedAt, presentation }: {
  sessionId: string; code: string; latestRunOpenedAt: string | null; presentation: LessonPresentation | null
}) {
  const { t } = useTranslation()
  const screen = useLiveScreen(sessionId)
  const set = useSetLiveScreen(code)
  const [error, setError] = useState('')
  const data = screen.data
  const pages = data?.presentation?.page_count ?? presentation?.page_count ?? 0
  const deck = data?.presentation ?? presentation
  const mode = effectiveScreen(data, latestRunOpenedAt)
  const slide = Math.min(Math.max(1, data?.slide ?? 1), Math.max(1, pages))

  function go(nextMode: LiveScreen['mode'], nextSlide = slide) {
    setError('')
    set.mutate({ p_session_id: sessionId, p_mode: nextMode, p_slide: Math.min(Math.max(1, nextSlide), Math.max(1, pages)) },
      { onError: (cause) => setError(cause instanceof Error ? cause.message : t('live.controlError')) })
  }

  useEffect(() => {
    if (mode !== 'slides' || !pages) return
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.altKey || event.ctrlKey || event.metaKey) return
      if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(event.key) && slide < pages) { event.preventDefault(); go('slides', slide + 1) }
      if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(event.key) && slide > 1) { event.preventDefault(); go('slides', slide - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const segment = (value: LiveScreen['mode'], label: string, disabled = false) => <button type="button" aria-pressed={mode === value} disabled={disabled}
    onClick={() => go(value)} className={`min-h-11 rounded-control px-4 text-sm font-semibold disabled:opacity-50 ${mode === value ? 'bg-brand text-white' : 'text-text-muted hover:text-text'}`}>{label}</button>

  return <section aria-label={t('live.screen.title')} className="grid gap-3 rounded-control border border-border bg-surface-elevated p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('live.screen.title')}</p>
      <div role="group" aria-label={t('live.screen.title')} className="inline-flex flex-wrap gap-1 rounded-control border border-border bg-surface p-1">
        {segment('slides', t('live.screen.slides'), !deck)}
        {segment('activity', t('live.screen.activity'))}
        {segment('join', t('live.screen.join'))}
      </div>
    </div>
    {!deck && <p className="text-sm text-text-muted">{t('live.screen.noDeck')}</p>}
    {mode === 'slides' && deck && <div className="grid gap-3">
      <img src={slideUrl(deck, slide)} alt={t('presentation.slideN', { number: slide })} className="mx-auto max-h-[52vh] w-auto max-w-full rounded-control border-2 border-brand bg-white" />
      {slide < pages && <link rel="prefetch" href={slideUrl(deck, slide + 1)} />}
      <div className="flex items-center gap-3">
        <Button variant="secondary" className="min-h-14 min-w-14 text-xl" aria-label={t('live.screen.previous')} disabled={slide <= 1} onClick={() => go('slides', slide - 1)}>◀</Button>
        <div className="flex-1 text-center"><p className="text-xl font-bold tabular-nums">{t('live.screen.position', { number: slide, total: pages })}</p>
          <p className="text-xs text-text-muted">{t('live.screen.keys')}</p></div>
        <Button className="min-h-14 min-w-14 text-xl" aria-label={t('live.screen.next')} disabled={slide >= pages} onClick={() => go('slides', slide + 1)}>▶</Button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" aria-label={t('live.screen.all')}>{Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
        <button key={n} type="button" onClick={() => go('slides', n)} aria-label={t('presentation.slideN', { number: n })} aria-current={n === slide ? 'true' : undefined}
          className={`shrink-0 rounded border-2 ${n === slide ? 'border-brand' : 'border-transparent'}`}>
          <img src={slideUrl(deck, n)} alt="" loading="lazy" className="h-12 w-auto rounded bg-white" /></button>)}</div>
    </div>}
    {mode !== 'slides' && deck && <Button variant="secondary" className="w-fit" onClick={() => go('slides')}>◀ {t('live.screen.back', { number: slide })}</Button>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </section>
}
