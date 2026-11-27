import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { liveSearch } from './live-utils'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useLessonPlan, usePlanProgress, useSessionPlan } from '@/features/planning/planning-api'
import { LiveControlPanel, RunView } from './LiveControlPanel'
import { useRoundCountdown } from './LiveSpecial'
import { SessionNav } from './SessionNav'
import { ScreenControl } from './LivePresentation'
import { BlockTimer } from './BlockTimer'
import { SheetPrivateAside, SheetTeachMain } from './SheetPanel'
import { useBlockSheet } from './sheet-hooks'
import { TeacherNotesAside } from './LiveNotes'
import { effectiveScreen, useLessonPresentation } from './presentation'
import { liveRpc } from './live-api'
import type { LiveRpcOutput } from './live-contract'
import {
  useCloseLiveRun, useCreateLiveSession, useEndLiveSession, useLaunchLiveRun, useLaunchLiveSet, useLiveActivities, useLiveSets, useOfferingLiveSession, useSessionBlocks,
  ping, useLiveScreen, useSetLiveScreen, useResetLiveRun, useResetLiveSessionResults, useSetLiveRunPaused, useSetLiveRunRanking, useSetLiveRunReveal, useSetLiveRunVisibility,
} from './live-teacher-api'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Run = LiveRpcOutput<'get_live_control_state'>['runs'][number]
/** Un cuestionario estático es una sola ronda que cubre todas sus preguntas. */
function coveredIds(run: Run): string[] {
  if (run.type !== 'static_quiz') return [run.activity_id]
  return Array.isArray(run.config.questions) ? (run.config.questions as { id: string }[]).map((question) => question.id) : [run.activity_id]
}

function Countdown({ run }: { run: Run }) {
  const seconds = typeof run.config.seconds === 'number' ? run.config.seconds : 20
  const remaining = useRoundCountdown(run, seconds)
  return <div role="timer" className="flex size-20 shrink-0 items-center justify-center rounded-full border-[6px] border-brand text-3xl font-bold tabular-nums">{String(remaining).padStart(2, '0')}</div>
}

/** Miniatura fiel del proyector: se dibuja a 1280×720 y se escala al ancho disponible. */
function ProjectorPreview({ title, src }: { title: string; src: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.2)
  useEffect(() => {
    const element = box.current
    if (!element) return
    const update = () => setScale(element.clientWidth / 1280)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-control border border-border bg-black">
    <iframe title={title} src={src} tabIndex={-1} className="pointer-events-none absolute left-0 top-0 h-[720px] w-[1280px] origin-top-left border-0"
      style={{ transform: `scale(${scale})` }} />
  </div>
}

/** Momento 2 · Dictar: guion a la izquierda, un paso principal al centro, proyector y acceso a la derecha. */
function Cockpit({ offeringId, lessonId, initialItem }: { offeringId: string; lessonId: string; initialItem: string | null }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<string | null>(initialItem)
  const [accessMode, setAccessMode] = useState<'enrolled' | 'guest' | 'both'>('both')
  const [askName, setAskName] = useState(true)
  const [askCompany, setAskCompany] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState('')
  const query = useOfferingLiveSession(offeringId)
  const plan = useLessonPlan(lessonId)
  const sessionPlan = useSessionPlan(offeringId, lessonId)
  const lessonActivities = useLiveActivities(lessonId)
  const deck = useLessonPresentation(lessonId)
  const create = useCreateLiveSession(); const launch = useLaunchLiveRun(); const launchSet = useLaunchLiveSet(); const close = useCloseLiveRun()
  const visibility = useSetLiveRunVisibility(); const pause = useSetLiveRunPaused(); const reveal = useSetLiveRunReveal()
  const ranking = useSetLiveRunRanking(); const resetRun = useResetLiveRun(); const resetAll = useResetLiveSessionResults()
  const end = useEndLiveSession()

  const state = query.data ?? undefined
  const session = state?.session
  const live = session && session.lesson_id === lessonId ? session : null
  const relevant = !!live
  const otherSession = session && !relevant ? session : null
  const progress = usePlanProgress(otherSession ? offeringId : undefined)
  const otherLessonTitle = progress.data?.find((item) => item.lesson_id === otherSession?.lesson_id)?.lesson_title || otherSession?.lesson_id
  const elapsedMinutes = otherSession ? Math.max(0, Math.floor((Date.now() - Date.parse(otherSession.created_at)) / 60000)) : 0
  const stale = !!otherSession && Date.now() - Date.parse(otherSession.created_at) > 6 * 60 * 60 * 1000
  const relativeTime = new Intl.RelativeTimeFormat(i18n.resolvedLanguage, { numeric: 'auto' }).format(
    elapsedMinutes >= 60 ? -Math.floor(elapsedMinutes / 60) : -elapsedMinutes, elapsedMinutes >= 60 ? 'hour' : 'minute')
  const active = live?.status === 'active'
  const blockStates = useSessionBlocks(active && live ? live.id : undefined)
  const stateOf = (id: string) => blockStates.data?.blocks.find((entry) => entry.item_id === id)?.state
  const setsQuery = useLiveSets(lessonId)
  const setOrder = new Map((setsQuery.data ?? []).map((set) => [set.id, set.position]))
  const setRank = (id: string | null) => id === null ? Number.MAX_SAFE_INTEGER : setOrder.get(id) ?? Number.MAX_SAFE_INTEGER - 1
  const activities = [...(relevant ? state?.activities ?? [] : lessonActivities.data ?? [])]
    .sort((a, b) => setRank(a.set_id) - setRank(b.set_id) || a.position - b.position)
  const runs = relevant ? state?.runs ?? [] : []
  const blocks = plan.data?.items ?? []
  const done = new Set((sessionPlan.data?.progress ?? []).filter((item) => item.done).map((item) => item.item_id))
  const launched = (activityId: string) => runs.some((run) => coveredIds(run).includes(activityId))
  const pendingIn = (id: string) => activities.filter((item) => item.plan_item_id === id && !launched(item.id)).length
  const openRun = runs.find((run) => run.status === 'open')
  const openBlock = openRun ? activities.find((item) => item.id === openRun.activity_id)?.plan_item_id ?? null : null
  const runningBlock = blockStates.data?.blocks.find((entry) => entry.state === 'active')?.item_id ?? null
  const selectedId = picked ?? openBlock ?? runningBlock ?? blocks.find((block) => pendingIn(block.id) > 0)?.id ?? blocks[0]?.id ?? null
  const selected = blocks.find((block) => block.id === selectedId)
  const blockActs = activities.filter((item) => item.plan_item_id === selectedId)
  const blockRuns = runs.filter((run) => blockActs.some((item) => coveredIds(run).includes(item.id)))
  const current = openRun && blockRuns.includes(openRun) ? openRun
    : [...blockRuns].sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at))[0]
  const next = blockActs.find((item) => !launched(item.id))
  const nextSet = next ? setsQuery.data?.find((set) => set.id === next.set_id && set.kind === 'static_quiz') : undefined
  const nextTitle = nextSet?.title ?? next?.title ?? ''
  const launchNext = (sessionId: string) => nextSet
    ? launchSet.mutateAsync({ p_session_id: sessionId, p_set_id: nextSet.id })
    : launch.mutateAsync({ p_session_id: sessionId, p_activity_id: next!.id })
  const nextBlock = blocks.find((block) => block.id !== selectedId && pendingIn(block.id) > 0
    && blocks.indexOf(block) > blocks.findIndex((item) => item.id === selectedId))
  const currentSetId = current ? activities.find((item) => item.id === current.activity_id)?.set_id ?? null : null
  const currentSet = setsQuery.data?.find((set) => set.id === currentSetId)
  const setQuestions = blockActs.filter((item) => item.set_id === currentSetId)
  const currentIndex = current && current.type !== 'static_quiz' ? setQuestions.findIndex((item) => item.id === current.activity_id) : -1
  const quizActs = setQuestions.filter((item) => item.type === 'quiz')
  const quizIndex = current ? quizActs.findIndex((item) => item.id === current.activity_id) : -1
  const formative = current?.config.formative === true
  const rankingDue = current?.type === 'quiz' && !formative && (quizIndex === 2 || quizIndex === quizActs.length - 1)
  const participants = state?.participant_count ?? 0
  const link = relevant ? new URL(`/clase/${live!.code}${liveSearch()}`, window.location.origin).href : ''

  useEffect(() => {
    if (!link) { setQr(''); return }
    let mounted = true
    void import('qrcode').then((module) => module.toDataURL(link, { width: 240, margin: 1 }))
      .then((image) => { if (mounted) setQr(image) }).catch(() => { if (mounted) setQr('') })
    return () => { mounted = false }
  }, [link])

  async function act(task: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await task() } catch (error) { setMessage(error instanceof Error ? error.message : t('live.controlError')) }
    finally { setBusy(false) }
  }
  async function ensureSession() {
    if (live) return live
    try {
      return (await create.mutateAsync({ p_offering_id: offeringId, p_lesson_id: lessonId,
        p_access_mode: accessMode, p_ask_name: askName, p_ask_company: askCompany })).session
    } catch (error) {
      const recovered = (await query.refetch()).data
      if (recovered?.session.lesson_id === lessonId) return recovered.session
      throw error
    }
  }

  // Un solo paso principal: siempre el siguiente movimiento lógico de la clase.
  let primary: { label: string; run: () => void; disabled?: boolean } | null = null
  if (!session || otherSession) primary = next
    ? { label: t('live.cockpit.startAndLaunch'), disabled: !!otherSession && !stale, run: () => void act(async () => { const s = await ensureSession(); await launchNext(s.id) }) }
    : { label: t('live.startClass'), disabled: !!otherSession && !stale, run: () => void act(ensureSession) }
  else if (active && openRun && !blockRuns.includes(openRun)) primary = { label: t('live.cockpit.goToOpen'), run: () => setPicked(openBlock) }
  else if (active && current?.status === 'open') primary = {
    label: t(current.type === 'quiz' || current.type === 'static_quiz' ? 'live.cockpit.closeAndReveal' : 'live.cockpit.closeAndShow'),
    run: () => void act(async () => {
      await close.mutateAsync({ p_run_id: current.id })
      if (current.type === 'quiz' || current.type === 'static_quiz') await reveal.mutateAsync({ p_run_id: current.id, p_reveal: true })
      await visibility.mutateAsync({ p_run_id: current.id, p_show_results: true })
    }),
  }
  else if (active && current && (current.type === 'quiz' || current.type === 'static_quiz' || (current.type === 'compare' && current.config.blind !== false)) && !current.reveal) primary = {
    label: t(current.type === 'compare' ? 'live.revealModels' : 'live.revealCorrect'),
    run: () => void act(async () => {
      await reveal.mutateAsync({ p_run_id: current.id, p_reveal: true })
      if (!current.show_results) await visibility.mutateAsync({ p_run_id: current.id, p_show_results: true })
    }),
  }
  else if (active && current && !current.show_results) primary = { label: t('live.showResults'), run: () => void act(() => visibility.mutateAsync({ p_run_id: current.id, p_show_results: true })) }
  else if (active && current && rankingDue && !current.show_ranking) primary = { label: t('live.showRanking'), run: () => void act(() => ranking.mutateAsync({ p_run_id: current.id, p_show: true })) }
  else if (active && next) primary = { label: t('live.cockpit.launchNamed', { title: nextTitle }), run: () => void act(() => launchNext(live!.id)) }
  else if (active && nextBlock) primary = { label: t('live.cockpit.nextBlock', { title: nextBlock.title }), run: () => setPicked(nextBlock.id) }

  const chips = current ? [
    { label: t('live.cockpit.chipLaunched'), on: true },
    { label: t(current.paused ? 'live.responsesPaused' : 'live.cockpit.chipAnswering'), on: current.status === 'open', now: current.status === 'open' },
    { label: t('live.cockpit.chipResults'), on: current.status === 'closed' && current.show_results },
    ...(current.type === 'quiz' || current.type === 'static_quiz' || current.type === 'compare' ? [{ label: t('live.cockpit.chipRevealed'), on: current.reveal }] : []),
    ...(current.type === 'quiz' && !formative ? [{ label: t('live.ranking'), on: current.show_ranking }] : []),
  ] : []

  const selIndex = blocks.findIndex((block) => block.id === selectedId)
  const followBlock = selIndex >= 0 ? blocks[selIndex + 1] : undefined
  const blockSheet = useBlockSheet(lessonId, selectedId)
  const isDone = (id: string) => done.has(id) || stateOf(id) === 'done'
  const doneCount = blocks.filter((block) => isDone(block.id)).length
  const endOf = (start: string | null | undefined, minutes: number | null | undefined) => {
    if (!start || !minutes) return null
    const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 30000); return () => window.clearInterval(id) }, [])
  const card = 'rounded-control border border-border bg-surface p-4'
  const stat = (label: string, value: string, extra?: string) => <div className="flex flex-col items-end leading-tight">
    <span className="text-xs text-text-muted">{label}</span>
    <span className="text-lg font-extrabold tabular-nums">{value}{extra && <span className="ml-1 text-xs font-semibold text-text-muted">{extra}</span>}</span>
  </div>

  const header = <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2">
    <SessionNav lessonId={lessonId} offeringId={offeringId} current="teach" />
    <div className="flex flex-1 flex-wrap items-center justify-end gap-4">
      {stat(t('live.code'), relevant ? live!.code : '--')}
      {stat(t('live.cockpit.connected'), String(participants))}
      {stat(t('dictar.now'), clock.toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }), selected?.starts_at ? t('dictar.vsPlan', { time: selected.starts_at.slice(0, 5) }) : undefined)}
      {relevant && <Button variant="secondary" className="min-h-11" onClick={() => window.open(`/clase/${live!.code}/proyector${liveSearch()}`, '_blank', 'noopener,noreferrer')}>{t('live.openProjector')}</Button>}
      {relevant && <details className="relative">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-control border border-border px-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">{t('live.cockpit.access')}</summary>
        <aside aria-label={t('live.cockpit.screens')} className="absolute right-0 z-20 mt-1 grid max-h-[70vh] w-80 max-w-[90vw] gap-3 overflow-y-auto rounded-control border border-border bg-surface p-3 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t('live.cockpit.projectorView')}</p>
          <ProjectorPreview title={t('live.cockpit.projectorView')} src={`/clase/${live!.code}/proyector${liveSearch()}`} />
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t('live.cockpit.join')}</p>
          <div className="flex items-center gap-3">
            {qr && <img src={qr} className="size-24 shrink-0 rounded-control bg-white p-1" alt={t('live.qrAlt', { code: live!.code })} />}
            <p className="min-w-0 break-all text-sm text-text-muted">{link}</p>
          </div>
          <Button variant="secondary" className="min-h-11" onClick={() => void navigator.clipboard.writeText(link).then(() => setMessage(t('live.linkCopied'))).catch(() => setMessage(t('live.copyError')))}>{t('live.copyLink')}</Button>
        </aside>
      </details>}
      {active && <Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => { if (window.confirm(t('live.confirmEnd'))) void act(() => end.mutateAsync({ p_session_id: live!.id })) }}>{t('live.endClass')}</Button>}
    </div>
  </header>

  const guion = <aside aria-label={t('live.prepareTitle')} className={`${card} grid content-start gap-2 lg:sticky lg:top-0`}>
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="font-bold">{t('dictar.guion')}</h2>
      <span className="text-xs text-text-muted">{t('dictar.guionProgress', { done: doneCount, total: blocks.length })}</span>
    </div>
    <div className="h-1.5 rounded-full bg-border" aria-hidden="true"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${blocks.length ? Math.round(doneCount * 100 / blocks.length) : 0}%` }} /></div>
    <ol className="grid gap-0.5">{blocks.map((block) => {
      const isNow = block.id === selectedId; const st = stateOf(block.id); const finished = isDone(block.id); const pending = pendingIn(block.id)
      const dot = finished ? 'border-emerald-700 bg-emerald-700' : st === 'active' ? 'border-brand bg-brand ring-2 ring-brand/30' : st === 'skipped' ? 'border-text-muted bg-surface-elevated' : st === 'paused' ? 'border-brand' : 'border-border'
      return <li key={block.id}><button type="button" aria-pressed={isNow} onClick={() => setPicked(block.id)}
        className={`flex min-h-11 w-full items-center gap-2 rounded-control border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${isNow ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-surface-elevated'}`}>
        <span aria-hidden="true" className={`size-3 shrink-0 rounded-full border-2 ${dot}`} />
        <span className="w-10 shrink-0 text-xs tabular-nums text-text-muted">{block.starts_at?.slice(0, 5) ?? ''}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm leading-snug ${finished || st === 'skipped' ? 'text-text-muted line-through' : ''} ${isNow ? 'font-bold' : ''}`}>{block.title}</span>
          <span className="block text-xs text-text-muted">{t(`planning.kinds.${block.kind}`)}{block.minutes ? ` · ${block.minutes} min` : ''}{st ? ` · ${t(`blockState.state.${st}`)}` : ''}</span>
        </span>
        {pending > 0 && <span className="shrink-0 rounded-full border border-border px-1.5 text-xs font-semibold" title={t('dictar.interactive')}>{pending}</span>}
      </button></li>
    })}</ol>
  </aside>

  const stageRun = openRun ?? current
  const openItem = stageRun ? activities.find((item) => item.id === stageRun.activity_id) : undefined
  const openSet = openItem ? setsQuery.data?.find((set) => set.id === openItem.set_id) : undefined
  const hasInteractive = blockActs.length > 0 || !!(openRun && !blockRuns.includes(openRun))
  const runStage = stageRun ? <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="min-w-0">
      <h3 className="mb-3 text-xl font-bold">{stageRun.title}</h3>
      {stageRun.status === 'open' && <div className="mb-3 flex items-center gap-3">
        {stageRun.type === 'quiz' && <Countdown run={stageRun} />}
        <div className="min-w-0 flex-1"><p className="text-lg font-semibold" aria-live="polite">{t('live.responseCount', { count: stageRun.results.responses.length, total: participants, percent: participants ? Math.min(100, Math.round(stageRun.results.responses.length * 100 / participants)) : 0 })}</p>
          <progress className="w-full" max={100} value={participants ? Math.min(100, Math.round(stageRun.results.responses.length * 100 / participants)) : 0} aria-label={t('live.responseProgress')} /></div>
      </div>}
      <RunView run={stageRun} participantCount={participants} hideTitle />
    </div>
    <TeacherNotesAside lessonId={lessonId} setId={openItem?.set_id ?? null} setTitle={openSet?.title ?? null}
      questionId={stageRun.type === 'static_quiz' ? null : openItem?.id ?? null} questionTitle={stageRun.type === 'static_quiz' ? null : openItem?.title ?? null} />
  </div> : null

  const interactive = (hasInteractive || !session || otherSession) && <section aria-label={t('dictar.interactive')} className={`${card} grid gap-3`}>
    {hasInteractive && <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-bold">{t('dictar.interactive')}{currentSet ? ` · ${currentSet.title}` : ''}{current && currentIndex >= 0 && setQuestions.length > 1 ? ` · ${t('live.cockpit.question', { number: currentIndex + 1, total: setQuestions.length })}` : ''}</h2>
      <ol aria-label={t('live.cockpit.steps')} className="flex flex-wrap gap-1 text-xs font-semibold">{chips.map((chip) => <li key={chip.label} aria-current={chip.now ? 'step' : undefined} className={`rounded-full border px-2 py-1 ${chip.now ? 'border-brand bg-brand text-white' : chip.on ? 'border-brand text-brand' : 'border-border text-text-muted'}`}>{chip.label}</li>)}</ol>
    </div>}
    {otherSession && <div role="status" className="rounded-control border-2 border-amber-600 bg-amber-50 p-3 text-amber-950">
      <p className="font-bold">{t('live.otherLessonActive')}</p>
      <p>{t('live.otherLessonDetails', { title: otherLessonTitle, code: otherSession.code })}</p>
      <p>{t('live.otherLessonOpened', { date: new Date(otherSession.created_at).toLocaleString(i18n.resolvedLanguage), relative: relativeTime })}</p>
      {stale && <p className="font-semibold">{t('live.otherLessonStale')}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => {
          if (window.confirm(t('live.confirmEndOther', { code: otherSession.code }))) void act(async () => { await end.mutateAsync({ p_session_id: otherSession.id }); await query.refetch() })
        }}>{t('live.endOtherClass')}</Button>
        <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => navigate(`/clase-control/${offeringId}/${otherSession.lesson_id}${liveSearch()}`)}>{t('live.goToOtherClass')}</Button>
      </div>
    </div>}
    {!session && <p className="text-sm text-text-muted">{t('dictar.startClassHint')}</p>}
    {(primary || hasInteractive) && <div className="flex flex-wrap items-stretch gap-2">
      {primary && <Button className="min-h-11 flex-[1_1_14rem] text-lg font-bold" disabled={busy || primary.disabled} onClick={primary.run}>{primary.label}</Button>}
      {!session && deck.data && <Button variant="secondary" className="min-h-11" disabled={busy}
        onClick={() => void act(async () => { const s = await ensureSession(); await liveRpc('set_live_screen', { p_session_id: s.id, p_mode: 'slides', p_slide: 1 }); void ping(s.code) })}>{t('live.screen.startWithSlides')}</Button>}
      {active && current?.status === 'open' && <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void act(() => pause.mutateAsync({ p_run_id: current.id, p_paused: !current.paused }))}>{t(current.paused ? 'live.resumeRound' : 'live.pauseRound')}</Button>}
      {active && current && <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void act(() => visibility.mutateAsync({ p_run_id: current.id, p_show_results: !current.show_results }))}>{t(current.show_results ? 'live.hideResults' : 'live.showResults')}</Button>}
      {active && current && (current.type === 'quiz' || current.type === 'static_quiz' || current.type === 'compare') && <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void act(() => reveal.mutateAsync({ p_run_id: current.id, p_reveal: !current.reveal }))}>{t(current.reveal ? 'live.hideReveal' : current.type === 'compare' ? 'live.revealModels' : 'live.revealCorrect')}</Button>}
      {active && current?.type === 'quiz' && !formative && <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void act(() => ranking.mutateAsync({ p_run_id: current.id, p_show: !current.show_ranking }))}>{t(current.show_ranking ? 'live.hideRanking' : 'live.showRanking')}</Button>}
    </div>}
    {otherSession && !stale && <p className="text-sm text-text-muted">{t('live.endOtherToStart')}</p>}
    {next && current && <p className="text-sm text-text-muted">{t('live.cockpit.after', { title: nextTitle })}</p>}
    {(!session || stale) && <details className="text-sm">
      <summary className="min-h-11 cursor-pointer content-center text-text-muted">{t('live.cockpit.accessOptions')} · {t(accessMode === 'both' ? 'live.accessBoth' : accessMode === 'enrolled' ? 'live.accessEnrolled' : 'live.accessGuest')}{askName ? ` · ${t('live.cockpit.nameRequired')}` : ''}</summary>
      <div className="mt-3 grid gap-3">
        <fieldset className="grid gap-2"><legend className="mb-1 font-semibold">{t('live.cockpit.whoJoins')}</legend>
          {(['both', 'enrolled', 'guest'] as const).map((mode) => <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 ${accessMode === mode ? 'border-brand bg-brand-soft' : 'border-border'}`}>
            <input type="radio" name="access-mode" className="mt-1" checked={accessMode === mode} onChange={() => setAccessMode(mode)} />
            <span><span className="block font-semibold">{t(mode === 'both' ? 'live.accessBoth' : mode === 'enrolled' ? 'live.accessEnrolled' : 'live.accessGuest')}{mode === 'both' ? ` · ${t('live.cockpit.recommended')}` : ''}</span>
              <span className="block text-text-muted">{t(`live.cockpit.accessHelp.${mode}`)}</span></span></label>)}
        </fieldset>
        {accessMode !== 'enrolled' && <div className="grid gap-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={askName} onChange={(event) => setAskName(event.target.checked)} />{t('live.askName')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={askCompany} onChange={(event) => setAskCompany(event.target.checked)} />{t('live.askCompany')}</label>
        </div>}
      </div>
    </details>}
    {runStage}
  </section>

  const latestRunOpenedAt = runs.reduce<string | null>((latest, run) => !latest || Date.parse(run.opened_at) > Date.parse(latest) ? run.opened_at : latest, null)
  const screenQuery = useLiveScreen(active && live ? live.id : '')
  const setScreen = useSetLiveScreen(live?.code ?? '')
  const screenMode = effectiveScreen(screenQuery.data ?? undefined, latestRunOpenedAt)
  const slidesMode = !!(active && live) && screenMode === 'slides' && !!(screenQuery.data?.presentation ?? deck.data)
  const projectSheet = () => {
    if (live && screenMode !== 'activity') setScreen.mutate({ p_session_id: live.id, p_mode: 'activity', p_slide: screenQuery.data?.slide ?? 1 })
  }
  const projector = active && live && <section aria-label={t('dictar.projector')} className={`${card} flex flex-col gap-2 ${slidesMode ? 'min-h-[75vh] flex-1 lg:min-h-0' : ''}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold">{t('dictar.projector')}</h2><span className="text-sm text-text-muted">{t('dictar.projectorHint')}</span></div>
    <ScreenControl sessionId={live.id} lessonId={lessonId} code={live.code} presentation={deck.data ?? null} latestRunOpenedAt={latestRunOpenedAt} toolbar={null}
      activityStage={<p className="py-4 text-sm text-text-muted">{openRun ? t('dictar.projectorActivity') : t('dictar.projectorNoRun')}</p>} />
  </section>

  const kicker = [selIndex >= 0 ? t('dictar.blockOf', { number: selIndex + 1, total: blocks.length }) : '', selected ? t(`planning.kinds.${selected.kind}`) : '',
    selected?.starts_at ? `${selected.starts_at.slice(0, 5)}${endOf(selected.starts_at, selected.minutes) ? `–${endOf(selected.starts_at, selected.minutes)}` : ''}` : ''].filter(Boolean).join(' · ')

  return <div className="flex min-h-screen flex-col bg-surface-elevated text-text lg:h-screen">
    {header}
    {query.isPending || plan.isPending ? <p className="p-8" role="status">{t('live.loading')}</p> : <div className={`grid min-h-0 flex-1 gap-4 p-4 lg:overflow-hidden ${slidesMode ? 'lg:grid-cols-[17rem_minmax(0,1fr)]' : 'lg:grid-cols-[17rem_minmax(0,1fr)_21rem]'}`}>
      <div className="min-h-0 lg:overflow-y-auto">{blocks.length ? guion : <p className={card}>{t('live.prepareEmpty')}</p>}</div>
      {slidesMode && selected ? <main className="flex min-h-0 flex-col gap-3">
        <section aria-label={t('blockState.title')} className={`${card} grid shrink-0 gap-2 py-3`}>
          <p className="truncate text-sm text-text-muted">{kicker} · <span className="font-bold text-text">{selected.title}</span></p>
          <BlockTimer key={selectedId} compact sessionId={live!.id} itemId={selected.id} plannedMinutes={selected.minutes ?? null}
            next={followBlock ? { id: followBlock.id, title: followBlock.title } : null} onAdvance={(id) => setPicked(id)} />
          {message && <p role="alert" className="text-sm">{message}</p>}
        </section>
        {projector}
      </main> :       <main className="grid min-h-0 content-start gap-4 lg:overflow-y-auto">
        {selected && <section aria-label={t('blockState.title')} className={`${card} grid gap-3`}>
          <div className="grid gap-1">
            {kicker && <p className="text-sm text-text-muted">{kicker}</p>}
            <h1 className="text-2xl font-extrabold leading-tight md:text-3xl">{selected.title}</h1>
            {blockSheet.sheet?.objective.trim() ? <p className="text-text-muted">{blockSheet.sheet.objective}</p> : selected.resource ? <p className="text-text-muted">{selected.resource}</p> : null}
          </div>
          {active && live ? <BlockTimer key={selectedId} sessionId={live.id} itemId={selected.id} plannedMinutes={selected.minutes ?? null}
            next={followBlock ? { id: followBlock.id, title: followBlock.title } : null} onAdvance={(id) => setPicked(id)} />
            : relevant && !active ? <p className="font-semibold">{t('live.ended')}</p> : null}
          {message && <p role="alert" className="text-sm">{message}</p>}
        </section>}
        {interactive}
        {selectedId && <SheetTeachMain key={selectedId} lessonId={lessonId} itemId={selectedId} session={active && live ? { id: live.id, code: live.code } : null} onProject={projectSheet} />}
        {selectedId && !blockSheet.isPending && !blockSheet.sheet && <p className="text-sm text-text-muted">{t('dictar.noSheet')}</p>}
        {projector}
      </main>}
      {!slidesMode && <aside aria-label={t('dictar.tools')} className="grid min-h-0 content-start gap-4 lg:overflow-y-auto">
        {selectedId && <SheetPrivateAside lessonId={lessonId} itemId={selectedId} />}
        {selected && (selected.notes || selected.resource) && <section className={`${card} grid gap-1`}>
          <h2 className="font-bold">{t('live.cockpit.notes')}</h2>
          {selected.resource && <p className="text-sm font-semibold">{selected.resource}</p>}
          {selected.notes && <p className="whitespace-pre-wrap text-sm">{selected.notes}</p>}
        </section>}
        <section aria-label={t('dictar.tools')} className={`${card} grid gap-2`}>
          <h2 className="font-bold">{t('dictar.tools')}</h2>
          {current && !openRun && <details className="rounded-control border border-border p-2"><summary className="min-h-11 cursor-pointer content-center font-semibold">{t('live.cockpit.chipResults')}</summary><RunView run={current} participantCount={participants} hideTitle /></details>}
          {selectedId && <details className="rounded-control border border-border p-2"><summary className="min-h-11 cursor-pointer content-center font-semibold">{t('live.cockpit.tools')}</summary><LiveControlPanel embedded offeringId={offeringId} lessonId={lessonId} launchPlanItemId={selectedId} /></details>}
          {active && <details className="rounded-control border border-border p-2"><summary className="min-h-11 cursor-pointer content-center font-semibold text-text-muted">{t('dictar.more')}</summary>
            <div className="mt-2 grid gap-2">
              {current && <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => { if (window.confirm(t('live.confirmResetRun'))) void act(() => resetRun.mutateAsync({ p_run_id: current.id })) }}>{t('live.resetRun')}</Button>}
              <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => { if (window.confirm(t('live.confirmResetAll'))) void act(() => resetAll.mutateAsync({ p_session_id: live!.id })) }}>{t('live.resetAll')}</Button>
            </div>
          </details>}
        </section>
      </aside>}
    </div>}
  </div>
}

/** Cabina del docente en pestaña propia; el permiso lo validan las RPC. */
export function LiveControlPage() {
  const { t } = useTranslation()
  const { offeringId = '', lessonId = '' } = useParams()
  const [search] = useSearchParams()
  const auth = useAuth()
  const item = search.get('item')
  const valid = UUID.test(offeringId) && UUID.test(lessonId)
  if (auth.status === 'loading') return <main className="p-8" role="status">{t('live.loading')}</main>
  if (!valid || !auth.user) return <main className="p-8" role="alert">{t('live.unavailable')}</main>
  return <Cockpit key={item ?? 'all'} offeringId={offeringId} lessonId={lessonId} initialItem={item && UUID.test(item) ? item : null} />
}
