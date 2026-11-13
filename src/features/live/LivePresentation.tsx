import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import type { LessonPresentation, LiveScreen } from './live-contract'
import { useLiveScreen, useSetLiveScreen } from './live-teacher-api'
import { effectiveScreen, parseSlideNotes, readNotesFile, slideThumbUrl, slideUrl, useDeletePresentation, useLessonPresentation, useSaveSlideNotes, useSlideNotes, useUploadPresentation } from './presentation'

/** Miniatura liviana; si la presentación es anterior y no la tiene, usa la lámina completa. */
function Thumb({ deck, slide, className, alt = '' }: { deck: LessonPresentation; slide: number; className: string; alt?: string }) {
  const [fallback, setFallback] = useState(false)
  return <img src={fallback ? slideUrl(deck, slide) : slideThumbUrl(deck, slide)} alt={alt} loading="lazy" className={className} onError={() => setFallback(true)} />
}

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
  const [notesOpen, setNotesOpen] = useState(false)
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
      {!notesOpen && <div className="flex flex-wrap gap-2">{thumbs.map((n) => <Thumb key={n} deck={presentation} slide={n} alt={t('presentation.slideN', { number: n })}
        className="h-16 w-auto rounded border border-border bg-white" />)}</div>}
      <div className="flex flex-wrap gap-2">
        <Button variant={notesOpen ? 'primary' : 'secondary'} className="w-fit" onClick={() => setNotesOpen((value) => !value)}>{t(notesOpen ? 'presentation.notes.close' : 'presentation.notes.open')}</Button>
        {!notesOpen && presentation.page_count > 6 && <Button variant="secondary" className="w-fit" onClick={() => setShowAll((value) => !value)}>{t(showAll ? 'presentation.showLess' : 'presentation.showAll', { count: presentation.page_count })}</Button>}
      </div>
      {notesOpen && <SlideNotesEditor lessonId={lessonId} deck={presentation} editable={editable} />}
    </div>}
  </section>
}

/** Guion del docente por lámina: lámina a la izquierda, texto a la derecha; se guarda solo. */
function SlideNotesEditor({ lessonId, deck, editable }: { lessonId: string; deck: LessonPresentation; editable: boolean }) {
  const { t } = useTranslation()
  const query = useSlideNotes(lessonId)
  const save = useSaveSlideNotes(lessonId)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [dirty, setDirty] = useState<number[]>([])
  const [status, setStatus] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const saved = new Map((query.data ?? []).map((item) => [item.slide, item.notes]))
  const value = (slide: number) => drafts[slide] ?? saved.get(slide) ?? ''
  const parsed = importText.trim() ? parseSlideNotes(importText, deck.page_count) : []

  useEffect(() => {
    if (dirty.length === 0) return
    const id = window.setTimeout(() => {
      const batch = dirty.map((slide) => ({ slide, notes: (drafts[slide] ?? '').slice(0, 6000) }))
      setDirty([]); setStatus(t('presentation.notes.saving'))
      save.mutate(batch, { onSuccess: () => setStatus(t('presentation.notes.saved')), onError: (error) => { setStatus(error instanceof Error ? error.message : t('presentation.error')); setDirty((current) => [...new Set([...current, ...batch.map((item) => item.slide)])]) } })
    }, 800)
    return () => window.clearTimeout(id)
  }, [dirty, drafts, save, t])

  async function applyImport() {
    if (parsed.length === 0) return
    try {
      await save.mutateAsync(parsed)
      setDrafts((current) => { const next = { ...current }; for (const item of parsed) delete next[item.slide]; return next })
      setImportOpen(false); setImportText(''); setStatus(t('presentation.notes.imported', { count: parsed.length }))
    } catch (error) { setStatus(error instanceof Error ? error.message : t('presentation.error')) }
  }

  if (query.isPending) return <p role="status">{t('live.loading')}</p>
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 text-sm text-text-muted">{t('presentation.notes.hint', { count: saved.size, total: deck.page_count })}</p>
      {status && <span role="status" aria-live="polite" className="text-sm">{status}</span>}
      {editable && <Button variant="secondary" onClick={() => setImportOpen((open) => !open)}>{t('presentation.notes.import')}</Button>}
    </div>
    {importOpen && editable && <div className="grid gap-2 rounded-control border border-border p-3">
      <p className="text-sm">{t('presentation.notes.importHelp')}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept=".txt,.md,.docx,text/plain,text/markdown" className="sr-only" aria-label={t('presentation.notes.file')}
          onChange={(event) => { const picked = event.target.files?.[0]; if (picked) void readNotesFile(picked).then(setImportText).catch(() => setStatus(t('presentation.notes.fileError'))); event.target.value = '' }} />
        <Button variant="secondary" onClick={() => file.current?.click()}>{t('presentation.notes.file')}</Button>
      </div>
      <textarea className="min-h-40 w-full rounded-control border border-border bg-surface p-2 font-mono text-sm" value={importText} placeholder={t('presentation.notes.placeholder')}
        aria-label={t('presentation.notes.paste')} onChange={(event) => setImportText(event.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={parsed.length === 0 || save.isPending} onClick={() => void applyImport()}>{t('presentation.notes.apply', { count: parsed.length })}</Button>
        {importText.trim() && parsed.length === 0 && <span className="text-sm">{t('presentation.notes.noneFound')}</span>}
        {parsed.length > 0 && <span className="text-sm text-text-muted">{t('presentation.notes.foundSlides', { list: parsed.map((item) => item.slide).join(', ') })}</span>}
      </div>
    </div>}
    <ol className="grid gap-3">{Array.from({ length: deck.page_count }, (_, i) => i + 1).map((slide) => <li key={slide}
      className="grid gap-3 rounded-control border border-border bg-surface p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-1">
        <p className="text-sm font-semibold">{t('presentation.slideN', { number: slide })}</p>
        <Thumb deck={deck} slide={slide} alt={t('presentation.slideN', { number: slide })} className="w-full rounded border border-border bg-white" />
      </div>
      <label className="grid content-start gap-1 text-sm font-semibold">{t('presentation.notes.label')}
        <textarea className="min-h-48 w-full rounded-control border border-border bg-surface-elevated p-3 text-base font-normal" maxLength={6000}
          disabled={!editable} value={value(slide)} placeholder={t('presentation.notes.empty')}
          onChange={(event) => { const next = event.target.value; setDrafts((current) => ({ ...current, [slide]: next })); setDirty((current) => current.includes(slide) ? current : [...current, slide]) }} />
        <span className="text-xs font-normal text-text-muted">{t('live.characterCount', { count: value(slide).length, max: 6000 })}</span>
      </label>
    </li>)}</ol>
  </div>
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Dictar: decide qué ve el proyector y maneja la presentación con libertad. */
export function ScreenControl({ sessionId, lessonId, code, latestRunOpenedAt, presentation }: {
  sessionId: string; lessonId: string; code: string; latestRunOpenedAt: string | null; presentation: LessonPresentation | null
}) {
  const { t } = useTranslation()
  const notes = useSlideNotes(lessonId)
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
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <img src={slideUrl(deck, slide)} alt={t('presentation.slideN', { number: slide })} className="mx-auto max-h-[56vh] w-auto max-w-full rounded-control border-2 border-brand bg-white" />
        <aside aria-label={t('presentation.notes.label')} className="grid content-start gap-3">
          <div className="rounded-control border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">{t('presentation.notes.forSlide', { number: slide })}</p>
            {notes.data?.find((item) => item.slide === slide)?.notes
              ? <p className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap text-lg leading-relaxed">{notes.data.find((item) => item.slide === slide)!.notes}</p>
              : <p className="text-sm text-text-muted">{t('presentation.notes.noneForSlide')}</p>}
          </div>
          {slide < pages && <div className="grid gap-1">
            <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('presentation.notes.nextSlide')}</p>
            <Thumb deck={deck} slide={slide + 1} alt={t('presentation.slideN', { number: slide + 1 })} className="w-48 rounded border border-border bg-white" />
          </div>}
        </aside>
      </div>
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
          <Thumb deck={deck} slide={n} className="h-12 w-auto rounded bg-white" /></button>)}</div>
    </div>}
    {mode !== 'slides' && deck && <Button variant="secondary" className="w-fit" onClick={() => go('slides')}>◀ {t('live.screen.back', { number: slide })}</Button>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </section>
}
