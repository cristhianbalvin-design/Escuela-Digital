import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { normalizeTerm } from './live-utils'
import { termsToMerge, type LiveWordcloudGroup } from './live-ai'
import type { LiveRpcOutput } from './live-contract'
import { LiveResults } from './LiveResults'
import { TemplateResponses } from './LiveTemplate'
import { useLessonPlan } from '@/features/planning/planning-api'
import { groupLiveActivities, runsForPlanItem } from './live-groups'
import { CompareResults, QuizDistribution, RankingList, useRoundCountdown } from './LiveSpecial'
import {
  useCloseLiveRun, useCreateLiveSession, useEndLiveSession, useLaunchLiveRun,
  useLiveActivities, useLiveAi, useOfferingLiveSession, useMergeLiveTerm, useModerateLiveResponse, useSetLiveRunVisibility, useSetLiveRunPaused, useResetLiveRun, useResetLiveSessionResults, useSetLiveRunReveal, useSetLiveRunRanking,
} from './live-teacher-api'

type State = LiveRpcOutput<'get_live_control_state'>
type Run = State['runs'][number]
type PublicRun = NonNullable<LiveRpcOutput<'get_projector_state'>['run']>
type TermRow = Extract<Run['results']['rows'][number], { term: string }>
const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-2'

export function RunView({ run, participantCount, hideTitle = false }: { run: Run; participantCount: number; hideTitle?: boolean }) {
  const { t } = useTranslation()
  const count = run.results.responses.length
  const percent = participantCount ? Math.min(100, Math.round(count * 100 / participantCount)) : 0
  const displayRun: PublicRun = { ...run, show_results: true, results: { ...run.results,
    responses: run.results.responses.filter((response) => !response.hidden).map((response) => ({ ...response, hidden: false as const, participant_name: null })) } }
  return <div className="grid gap-3 rounded-control border border-border p-3">
    {!hideTitle && <h5 className="font-semibold">{run.title}</h5>}
    {typeof run.config.help === 'string' && <p className="text-sm text-text-muted">{run.config.help}</p>}
    {run.status === 'open' && <><p aria-live="polite">{t('live.responseCount', { count, total: participantCount, percent })}</p>
      <progress className="w-full" max={100} value={percent} aria-label={t('live.responseProgress')} /></>}
    {run.type === 'quiz' && <QuizTeacherTimer run={run} />}
    {run.type === 'compare' ? <CompareResults run={displayRun} teacher /> : run.type === 'quiz' ? <QuizDistribution run={displayRun} /> : <LiveResults run={displayRun} />}
  </div>
}

function QuizTeacherTimer({ run }: { run: Run }) {
  const { t } = useTranslation()
  const seconds = typeof run.config.seconds === 'number' ? run.config.seconds : 5
  const remaining = useRoundCountdown(run, seconds)
  return <p role="timer" className="text-xl font-bold">{t('live.remainingTime')}: {run.paused ? t('live.responsesPaused') : `${remaining}s`}</p>
}

function QuizSummary({ runs, ranking, participants }: { runs: Run[]; ranking: State['ranking']; participants: number }) {
  const { t } = useTranslation()
  const average = runs.length ? runs.reduce((sum, run) => sum + (run.results.correct_percent ?? 0), 0) / runs.length : null
  const timed = runs.filter((run) => run.results.avg_seconds !== null && run.results.avg_seconds !== undefined)
  const averageTime = timed.length ? timed.reduce((sum, run) => sum + (run.results.avg_seconds ?? 0), 0) / timed.length : null
  const byAccuracy = [...runs].sort((a, b) => (a.results.correct_percent ?? 0) - (b.results.correct_percent ?? 0))
  return <section className="space-y-3 rounded-control border border-border p-4"><h4 className="text-xl font-bold">{t('live.quizSummary')}</h4>
    <p>{t('live.participants', { count: participants })}</p><p>{t('live.averageCorrect')}: {average?.toFixed(1) ?? '–'}%</p>
    <p>{t('live.easiestQuestion')}: {byAccuracy.at(-1)?.title ?? '–'}</p><p>{t('live.hardestQuestion')}: {byAccuracy[0]?.title ?? '–'}</p>
    <p>{t('live.averageTime')}: {averageTime?.toFixed(1) ?? '–'}s</p><RankingList entries={ranking} full />
  </section>
}

export function LiveControlPanel({ offeringId, lessonId, launchPlanItemId, embedded = false }: {
  offeringId: string; lessonId: string; launchPlanItemId?: string | null; embedded?: boolean
}) {
  const { t } = useTranslation()
  const [accessMode, setAccessMode] = useState<'enrolled' | 'guest' | 'both'>('both')
  const [askName, setAskName] = useState(false)
  const [askCompany, setAskCompany] = useState(false)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState(false)
  const [termAction, setTermAction] = useState<{ runId: string; term: string } | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [proposal, setProposal] = useState<{ runId: string; groups: LiveWordcloudGroup[] } | null>(null)
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
  const [applyingGroups, setApplyingGroups] = useState(false)
  const create = useCreateLiveSession()
  const launch = useLaunchLiveRun()
  const close = useCloseLiveRun()
  const visibility = useSetLiveRunVisibility()
  const pause = useSetLiveRunPaused()
  const resetRun = useResetLiveRun()
  const resetAll = useResetLiveSessionResults()
  const reveal = useSetLiveRunReveal()
  const rankingMutation = useSetLiveRunRanking()
  const moderate = useModerateLiveResponse()
  const merge = useMergeLiveTerm()
  const ai = useLiveAi()
  const end = useEndLiveSession()
  const query = useOfferingLiveSession(offeringId)
  const plan = useLessonPlan(lessonId)
  const lessonActivities = useLiveActivities(lessonId)
  const state = query.data ?? undefined
  const session = state?.session
  const sessionId = session?.id ?? ''
  const relevant = session?.lesson_id === lessonId
  const active = session?.status === 'active'
  const openRun = state?.runs.find((run) => run.status === 'open')
  const activities = relevant ? state?.activities ?? [] : lessonActivities.data ?? []
  const groups = groupLiveActivities(activities, plan.data?.items ?? [], launchPlanItemId)
  const link = session ? new URL(`/clase/${session.code}${window.location.search}`, window.location.origin).href : ''

  useEffect(() => {
    if (!link) return
    let mounted = true
    void import('qrcode').then((module) => module.toDataURL(link, { width: 240, margin: 1 }))
      .then((image) => { if (mounted) { setQr(image); setQrError(false) } })
      .catch(() => { if (mounted) { setQr(''); setQrError(true) } })
    return () => { mounted = false }
  }, [link])

  async function start() {
    setMessage('')
    try {
      const next = await create.mutateAsync({ p_offering_id: offeringId, p_lesson_id: lessonId,
        p_access_mode: accessMode, p_ask_name: askName, p_ask_company: askCompany })
      setSummary(null); setProposal(null)
      return next
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      if (detail.includes('Ya existe una clase activa')) {
        const recovered = await query.refetch()
        return recovered.data?.session.lesson_id === lessonId ? recovered.data : null
      }
      else setMessage(detail || t('live.controlError'))
      return null
    }
  }
  async function launchActivity(activityId: string) {
    if (openRun || launch.isPending || create.isPending || (session && !relevant)) return
    const current = session ?? (await start())?.session
    if (current) await act(() => launch.mutateAsync({ p_session_id: current.id, p_activity_id: activityId }))
  }
  async function act(task: () => Promise<unknown>) {
    setMessage('')
    try { await task() } catch (error) { setMessage(error instanceof Error ? error.message : t('live.controlError')) }
  }
  async function finish() {
    if (!session || !window.confirm(t('live.confirmEnd'))) return
    await act(() => end.mutateAsync({ p_session_id: session.id }))
  }
  async function analyzeGroup() {
    setMessage('')
    setSummary(null)
    try { setSummary((await ai.analyzeGroup.mutateAsync(sessionId)).summary) }
    catch (error) { setMessage(error instanceof Error ? error.message : t('live.aiError')) }
  }
  async function groupWordcloud(runId: string) {
    setMessage('')
    setProposal(null)
    try {
      const { groups } = await ai.groupWordcloud.mutateAsync({ sessionId, runId })
      setProposal({ runId, groups })
      setSelectedGroups(new Set(groups.map((_, index) => index)))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('live.aiError')) }
  }
  async function applyGroups(runId: string) {
    if (!proposal || proposal.runId !== runId) return
    setApplyingGroups(true)
    setMessage('')
    try {
      const groups = proposal.groups.filter((_, index) => selectedGroups.has(index))
      for (const { term, canonical } of termsToMerge(groups)) {
        await merge.mutateAsync({ p_run_id: runId, p_term: term, p_merged_into: canonical, p_hidden: false })
      }
      setProposal(null)
      setMessage(t('live.aiGroupingApplied'))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('live.controlError')) }
    finally { await query.refetch(); setApplyingGroups(false) }
  }
  function targetRun(run: Run) {
    return <div className="grid gap-3"><RunView run={run} participantCount={state?.participant_count ?? 0} />
      <div className="flex flex-wrap gap-2">
        {run.status === 'open' && <Button disabled={close.isPending} onClick={() => void act(() => close.mutateAsync({ p_run_id: run.id }))}>{t('live.closeRound')}</Button>}
        <Button variant="secondary" disabled={resetRun.isPending} onClick={() => { if (window.confirm(t('live.confirmResetRun'))) void act(() => resetRun.mutateAsync({ p_run_id: run.id })) }}>{t('live.resetRun')}</Button>
        {run.status === 'open' && <Button variant="secondary" disabled={pause.isPending} onClick={() => void act(() => pause.mutateAsync({ p_run_id: run.id, p_paused: !run.paused }))}>{t(run.paused ? 'live.resumeRound' : 'live.pauseRound')}</Button>}
        <Button variant="secondary" disabled={visibility.isPending} onClick={() => void act(() => visibility.mutateAsync({ p_run_id: run.id, p_show_results: !run.show_results }))}>{t(run.show_results ? 'live.hideResults' : 'live.showResults')}</Button>
        {(run.type === 'quiz' || run.type === 'compare' || run.type === 'static_quiz') && <Button variant="secondary" disabled={reveal.isPending} onClick={() => void act(() => reveal.mutateAsync({ p_run_id: run.id, p_reveal: !run.reveal }))}>{t(run.reveal ? 'live.hideReveal' : run.type === 'compare' ? 'live.revealModels' : 'live.revealCorrect')}</Button>}
        {run.type === 'quiz' && <Button variant="secondary" disabled={rankingMutation.isPending} onClick={() => void act(() => rankingMutation.mutateAsync({ p_run_id: run.id, p_show: !run.show_ranking }))}>{t(run.show_ranking ? 'live.hideRanking' : 'live.showRanking')}</Button>}
      </div>
      {run.type === 'template' && <details className="grid gap-2"><summary className="cursor-pointer font-semibold">{t('live.template.withNames')}</summary><TemplateResponses config={run.config} responses={run.results.responses} /></details>}
      {run.type === 'open' && <div className="grid gap-2"><h6 className="font-semibold">{t('live.moderation')}</h6>{run.results.responses.map((response) => <div key={response.id} className="rounded-control border border-border p-2"><p className="break-words">{String(response.answer)}</p><p className="text-sm text-text-muted">{response.participant_name ?? t('live.unnamed')}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={moderate.isPending} onClick={() => void act(() => moderate.mutateAsync({ p_response_id: response.id, p_hidden: !response.hidden, p_pinned: response.pinned }))}>{t(response.hidden ? 'live.unhideResponse' : 'live.hideResponse')}</Button><Button variant="secondary" disabled={moderate.isPending} onClick={() => void act(() => moderate.mutateAsync({ p_response_id: response.id, p_hidden: response.hidden, p_pinned: !response.pinned }))}>{t(response.pinned ? 'live.unpinResponse' : 'live.pinResponse')}</Button></div></div>)}</div>}
      {run.type === 'wordcloud' && <div className="grid gap-2"><h6 className="font-semibold">{t('live.termModeration')}</h6>{run.results.rows.filter((row): row is TermRow => 'term' in row).map((row) => <div key={row.term} className="flex flex-wrap items-center gap-2"><span>{row.term} ({row.count})</span><Button variant="secondary" disabled={applyingGroups} onClick={() => { setTermAction({ runId: run.id, term: row.term }); setMergeTarget('') }}>{t('live.manageTerm')}</Button></div>)}
        <Button variant="secondary" className="w-fit" disabled={ai.groupWordcloud.isPending || applyingGroups} onClick={() => void groupWordcloud(run.id)}>{ai.groupWordcloud.isPending && ai.groupWordcloud.variables?.runId === run.id && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}{t('live.aiGroupWordcloud')}</Button>
        {proposal?.runId === run.id && <div className="grid gap-3 rounded-control border border-border bg-surface p-3" aria-live="polite"><h6 className="font-semibold">{t('live.aiGroupProposal')}</h6>
          {proposal.groups.length === 0 ? <p>{t('live.aiNoGroups')}</p> : <><div className="grid gap-2">{proposal.groups.map((group, index) => <label key={index} className="flex items-start gap-2"><input type="checkbox" checked={selectedGroups.has(index)} disabled={applyingGroups} onChange={() => setSelectedGroups((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next })} /><span><strong>{group.canonical}</strong> ← {group.terms.join(', ')}</span></label>)}</div><Button className="w-fit" disabled={applyingGroups || selectedGroups.size === 0} onClick={() => void applyGroups(run.id)}>{applyingGroups && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}{t('live.aiApplyGrouping')}</Button></>}
          <Button variant="secondary" className="w-fit" disabled={applyingGroups} onClick={() => setProposal(null)}>{t('live.aiDiscard')}</Button>
        </div>}
      </div>}
    </div>
  }

  return <section className="grid gap-4 rounded-control border border-border bg-surface-elevated p-4" aria-label={t('live.classTitle')}>
    {embedded ? null : query.isPending ? <p role="status">{t('live.loading')}</p> : !session ? <>
      <div className="grid gap-2 sm:grid-cols-3"><label>{t('live.accessMode')}<select className={field} value={accessMode} onChange={(e) => setAccessMode(e.target.value as typeof accessMode)}><option value="both">{t('live.accessBoth')}</option><option value="enrolled">{t('live.accessEnrolled')}</option><option value="guest">{t('live.accessGuest')}</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={askName} onChange={(e) => setAskName(e.target.checked)} />{t('live.askName')}</label><label className="flex items-center gap-2"><input type="checkbox" checked={askCompany} onChange={(e) => setAskCompany(e.target.checked)} />{t('live.askCompany')}</label></div>
      <Button className="w-fit" disabled={create.isPending} onClick={() => void start()}>{t('live.startClass')}</Button>
    </> : <>
      {!relevant && <p role="status">{t('live.otherLessonActive')}</p>}
      <div className="flex flex-wrap items-center gap-4"><div><p>{t('live.code')}</p><p className="font-mono text-4xl font-bold tracking-widest text-brand" aria-live="polite">{session.code}</p></div>{qr && <img src={qr} className="size-32 rounded-control bg-white p-1" alt={t('live.qrAlt', { code: session.code })} />}{qrError && <p role="status">{t('live.qrError')}</p>}</div>
      <p className="break-all"><a className="text-brand underline" href={link} target="_blank" rel="noopener noreferrer">{link}</a></p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(link).then(() => setMessage(t('live.linkCopied'))).catch(() => setMessage(t('live.copyError')))}>{t('live.copyLink')}</Button><Button variant="secondary" onClick={() => window.open(`/clase/${session.code}/proyector${window.location.search}`, '_blank', 'noopener,noreferrer')}>{t('live.openProjector')}</Button></div>
      <p aria-live="polite">{t('live.connected', { count: state?.participant_count ?? 0 })}</p>
      {active && session && <Button variant="secondary" className="w-fit" disabled={resetAll.isPending} onClick={() => { if (window.confirm(t('live.confirmResetAll'))) void act(() => resetAll.mutateAsync({ p_session_id: session.id })) }}>{t('live.resetAll')}</Button>}
      {active && <Button variant="destructive" className="w-fit" disabled={end.isPending} onClick={() => void finish()}>{t('live.endClass')}</Button>}
    </>}
    {(relevant || !session) && <div className="grid gap-4 border-t border-border pt-4"><h5 className="font-semibold">{t('live.itemActivities')}</h5>
      {groups.length === 0 && <p className="text-sm text-text-muted">{t('live.noLinkedActivity')}</p>}
      {groups.map((group) => {
        const groupRuns = state ? runsForPlanItem(state.runs, state.activities, group.id) : []
        const next = group.activities.find((activity) => !groupRuns.some((run) => run.activity_id === activity.id))
        const quizActivities = group.activities.filter((activity) => activity.type === 'quiz')
        const quizRuns = groupRuns.filter((run) => run.type === 'quiz')
        const quizComplete = quizActivities.length > 0 && quizActivities.every((activity) => groupRuns.some((run) => run.activity_id === activity.id && run.status === 'closed'))
        const latestQuiz = [...(state?.runs ?? [])].reverse().find((run) => run.type === 'quiz')
        const groupRanking = latestQuiz && quizRuns.some((run) => run.id === latestQuiz.id) ? state?.ranking ?? [] : []
        return <section key={group.id ?? 'unlinked'} className="grid gap-3 rounded-control border border-border p-3">
          <h6 className="font-semibold">{group.title ?? t('live.unlinked')}</h6>
          {group.activities.length === 0 && <p className="text-sm text-text-muted">{t('live.noLinkedActivity')}</p>}
          <ol className="grid gap-2">{group.activities.map((activity, index) => {
            const run = groupRuns.find((candidate) => candidate.activity_id === activity.id)
            return <li key={activity.id} className="grid gap-2 rounded-control border border-border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="text-sm text-text-muted">{t('live.activityStep', { number: index + 1, total: group.activities.length })}</span><br /><strong>{activity.title}</strong> · {t(`live.types.${activity.type}`)}</span>
                {!run && <Button disabled={!!openRun || launch.isPending || create.isPending || (!!session && !active)} onClick={() => void launchActivity(activity.id)}>{t('live.launch')}</Button>}</div>
              {run && targetRun(run)}
            </li>
          })}</ol>
          {next && <Button className="w-fit" disabled={!!openRun || launch.isPending || create.isPending || (!!session && !active)} onClick={() => void launchActivity(next.id)}>{t('live.launchNext')}</Button>}
          {quizComplete && state && <QuizSummary runs={quizRuns} ranking={groupRanking} participants={state.participant_count} />}
        </section>
      })}
    </div>}
    {relevant && state?.runs.some((run) => run.results.total > 0) && <div className="grid gap-3"><Button className="w-fit" disabled={ai.analyzeGroup.isPending} onClick={() => void analyzeGroup()}>{ai.analyzeGroup.isPending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}{t(ai.analyzeGroup.isPending ? 'live.aiAnalyzing' : 'live.aiAnalyzeGroup')}</Button>
      {summary !== null && <div className="grid gap-3 rounded-control border border-border bg-surface p-3" aria-live="polite"><h5 className="font-semibold">{t('live.aiSummary')}</h5><p className="whitespace-pre-line break-words">{summary}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(summary).then(() => setMessage(t('live.aiSummaryCopied'))).catch(() => setMessage(t('live.copyError')))}>{t('live.aiCopySummary')}</Button><Button variant="secondary" onClick={() => setSummary(null)}>{t('live.aiDiscard')}</Button></div></div>}
    </div>}
    {termAction && <div role="dialog" aria-modal="true" aria-label={t('live.termModeration')} className="grid gap-2 rounded-control border border-border bg-surface p-3"><p>{termAction.term}</p><label>{t('live.mergeInto')}<input className={field} maxLength={30} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} /></label><div className="flex flex-wrap gap-2"><Button disabled={merge.isPending || !normalizeTerm(mergeTarget) || normalizeTerm(mergeTarget) === termAction.term} onClick={() => void act(async () => { await merge.mutateAsync({ p_run_id: termAction.runId, p_term: termAction.term, p_merged_into: mergeTarget, p_hidden: false }); setTermAction(null) })}>{t('live.mergeTerm')}</Button><Button variant="secondary" disabled={merge.isPending} onClick={() => void act(async () => { await merge.mutateAsync({ p_run_id: termAction.runId, p_term: termAction.term, p_merged_into: null, p_hidden: true }); setTermAction(null) })}>{t('live.hideTerm')}</Button><Button variant="secondary" onClick={() => setTermAction(null)}>{t('live.cancel')}</Button></div></div>}
    {query.isError && <p role="alert">{t('live.restoreError')}</p>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>
}
