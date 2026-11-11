import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { normalizeTerm } from './live-utils'
import type { LiveRpcOutput } from './live-contract'
import { LiveResults } from './LiveResults'
import {
  useCloseLiveRun, useCreateLiveSession, useEndLiveSession, useLaunchLiveRun,
  useLiveControlState, useMergeLiveTerm, useModerateLiveResponse, useSetLiveRunVisibility,
} from './live-teacher-api'

type State = LiveRpcOutput<'get_live_control_state'>
type Run = State['runs'][number]
type PublicRun = NonNullable<LiveRpcOutput<'get_projector_state'>['run']>
type TermRow = Extract<Run['results']['rows'][number], { term: string }>
const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-2'
function readSession(offeringId: string) { try { return localStorage.getItem(`live:teacher:${offeringId}`) ?? '' } catch { return '' } }
function writeSession(offeringId: string, sessionId: string) { try { localStorage.setItem(`live:teacher:${offeringId}`, sessionId) } catch { /* Almacenamiento bloqueado. */ } }

function RunView({ run, participantCount }: { run: Run; participantCount: number }) {
  const { t } = useTranslation()
  const count = run.results.total
  const percent = participantCount ? Math.min(100, Math.round(count * 100 / participantCount)) : 0
  const displayRun: PublicRun = { ...run, show_results: true, results: { ...run.results,
    responses: run.results.responses.filter((response) => !response.hidden).map((response) => ({ ...response, hidden: false as const, participant_name: null })) } }
  return <div className="grid gap-3 rounded-control border border-border p-3">
    <h5 className="font-semibold">{run.title}</h5>
    <p aria-live="polite">{t('live.responseCount', { count, total: participantCount })}</p>
    <progress className="w-full" max={100} value={percent} aria-label={t('live.responseProgress')} />
    <LiveResults run={displayRun} />
  </div>
}

export function LiveControlPanel({ offeringId, lessonId, launchPlanItemId }: {
  offeringId: string; lessonId: string; launchPlanItemId?: string | null
}) {
  const { t } = useTranslation()
  const [sessionId, setSessionId] = useState(() => readSession(offeringId))
  const [accessMode, setAccessMode] = useState<'enrolled' | 'guest' | 'both'>('both')
  const [askName, setAskName] = useState(false)
  const [askCompany, setAskCompany] = useState(false)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState(false)
  const [termAction, setTermAction] = useState<{ runId: string; term: string } | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const create = useCreateLiveSession()
  const launch = useLaunchLiveRun()
  const close = useCloseLiveRun()
  const visibility = useSetLiveRunVisibility()
  const moderate = useModerateLiveResponse()
  const merge = useMergeLiveTerm()
  const end = useEndLiveSession()
  const query = useLiveControlState(sessionId)
  const state = query.data?.session.offering_id === offeringId ? query.data : undefined
  const session = state?.session
  const relevant = session?.lesson_id === lessonId
  const active = session?.status === 'active'
  const openRun = state?.runs.find((run) => run.status === 'open')
  const latest = openRun ?? state?.runs.at(-1)
  const activities = [...(state?.activities ?? [])].sort((a, b) =>
    Number(b.plan_item_id === launchPlanItemId) - Number(a.plan_item_id === launchPlanItemId) || a.position - b.position)
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
      writeSession(offeringId, next.session.id); setSessionId(next.session.id)
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail.includes('Ya existe una clase activa') ? t('live.existingSessionNoId') : detail || t('live.controlError'))
    }
  }
  async function act(task: () => Promise<unknown>) {
    setMessage('')
    try { await task() } catch (error) { setMessage(error instanceof Error ? error.message : t('live.controlError')) }
  }
  async function finish() {
    if (!session || !window.confirm(t('live.confirmEnd'))) return
    await act(() => end.mutateAsync({ p_session_id: session.id }))
  }
  function targetRun(run: Run) {
    return <div className="grid gap-3"><RunView run={run} participantCount={state?.participant_count ?? 0} />
      <div className="flex flex-wrap gap-2">
        {run.status === 'open' && <Button disabled={close.isPending} onClick={() => void act(() => close.mutateAsync({ p_run_id: run.id }))}>{t('live.closeRound')}</Button>}
        <Button variant="secondary" disabled={visibility.isPending} onClick={() => void act(() => visibility.mutateAsync({ p_run_id: run.id, p_show_results: !run.show_results }))}>{t(run.show_results ? 'live.hideResults' : 'live.showResults')}</Button>
      </div>
      {run.type === 'open' && <div className="grid gap-2"><h6 className="font-semibold">{t('live.moderation')}</h6>{run.results.responses.map((response) => <div key={response.id} className="rounded-control border border-border p-2"><p className="break-words">{String(response.answer)}</p><p className="text-sm text-text-muted">{response.participant_name ?? t('live.unnamed')}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={moderate.isPending} onClick={() => void act(() => moderate.mutateAsync({ p_response_id: response.id, p_hidden: !response.hidden, p_pinned: response.pinned }))}>{t(response.hidden ? 'live.unhideResponse' : 'live.hideResponse')}</Button><Button variant="secondary" disabled={moderate.isPending} onClick={() => void act(() => moderate.mutateAsync({ p_response_id: response.id, p_hidden: response.hidden, p_pinned: !response.pinned }))}>{t(response.pinned ? 'live.unpinResponse' : 'live.pinResponse')}</Button></div></div>)}</div>}
      {run.type === 'wordcloud' && <div className="grid gap-2"><h6 className="font-semibold">{t('live.termModeration')}</h6>{run.results.rows.filter((row): row is TermRow => 'term' in row).map((row) => <div key={row.term} className="flex flex-wrap items-center gap-2"><span>{row.term} ({row.count})</span><Button variant="secondary" onClick={() => { setTermAction({ runId: run.id, term: row.term }); setMergeTarget('') }}>{t('live.manageTerm')}</Button></div>)}</div>}
    </div>
  }

  return <section className="grid gap-4 rounded-control border border-border bg-surface-elevated p-4" aria-label={t('live.classTitle')}>
    {sessionId && query.isPending ? <p role="status">{t('live.loading')}</p> : !session || session.status === 'ended' ? <>
      <div className="grid gap-2 sm:grid-cols-3"><label>{t('live.accessMode')}<select className={field} value={accessMode} onChange={(e) => setAccessMode(e.target.value as typeof accessMode)}><option value="both">{t('live.accessBoth')}</option><option value="enrolled">{t('live.accessEnrolled')}</option><option value="guest">{t('live.accessGuest')}</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={askName} onChange={(e) => setAskName(e.target.checked)} />{t('live.askName')}</label><label className="flex items-center gap-2"><input type="checkbox" checked={askCompany} onChange={(e) => setAskCompany(e.target.checked)} />{t('live.askCompany')}</label></div>
      <Button className="w-fit" disabled={create.isPending} onClick={() => void start()}>{t('live.startClass')}</Button>
      {session?.status === 'ended' && relevant && state?.runs.length ? <details><summary className="cursor-pointer font-semibold">{t('live.roundHistory')}</summary><div className="grid gap-4 pt-3">{state.runs.map((run) => <RunView key={run.id} run={run} participantCount={state.participant_count} />)}</div></details> : null}
    </> : <>
      {!relevant && <p role="status">{t('live.otherLessonActive')}</p>}
      <div className="flex flex-wrap items-center gap-4"><div><p>{t('live.code')}</p><p className="font-mono text-4xl font-bold tracking-widest text-brand" aria-live="polite">{session.code}</p></div>{qr && <img src={qr} className="size-32 rounded-control bg-white p-1" alt={t('live.qrAlt', { code: session.code })} />}{qrError && <p role="status">{t('live.qrError')}</p>}</div>
      <p className="break-all"><a className="text-brand underline" href={link} target="_blank" rel="noopener noreferrer">{link}</a></p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(link).then(() => setMessage(t('live.linkCopied'))).catch(() => setMessage(t('live.copyError')))}>{t('live.copyLink')}</Button><Button variant="secondary" onClick={() => window.open(`/clase/${session.code}/proyector${window.location.search}`, '_blank', 'noopener,noreferrer')}>{t('live.openProjector')}</Button></div>
      <p aria-live="polite">{t('live.participants', { count: state?.participant_count ?? 0 })}</p>
      {relevant && <><h5 className="font-semibold">{t('live.editorTitle')}</h5><ul className="grid gap-2">{activities.map((activity) => <li key={activity.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-2"><span>{activity.title} · {t(`live.types.${activity.type}`)}</span><Button disabled={!!openRun || launch.isPending || !active} onClick={() => void act(() => launch.mutateAsync({ p_session_id: session.id, p_activity_id: activity.id }))}>{t('live.launch')}</Button></li>)}</ul>
        {latest && <><h5 className="font-semibold">{t(openRun ? 'live.openRound' : 'live.latestRound')}</h5>{targetRun(latest)}</>}
        {state?.runs.some((run) => run.status === 'closed') && <details><summary className="cursor-pointer font-semibold">{t('live.roundHistory')}</summary><div className="grid gap-4 pt-3">{state.runs.filter((run) => run.status === 'closed').map((run) => <RunView key={run.id} run={run} participantCount={state.participant_count} />)}</div></details>}
      </>}
      {active && <Button variant="destructive" className="w-fit" disabled={end.isPending} onClick={() => void finish()}>{t('live.endClass')}</Button>}
    </>}
    {termAction && <div role="dialog" aria-modal="true" aria-label={t('live.termModeration')} className="grid gap-2 rounded-control border border-border bg-surface p-3"><p>{termAction.term}</p><label>{t('live.mergeInto')}<input className={field} maxLength={30} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} /></label><div className="flex flex-wrap gap-2"><Button disabled={merge.isPending || !normalizeTerm(mergeTarget) || normalizeTerm(mergeTarget) === termAction.term} onClick={() => void act(async () => { await merge.mutateAsync({ p_run_id: termAction.runId, p_term: termAction.term, p_merged_into: mergeTarget, p_hidden: false }); setTermAction(null) })}>{t('live.mergeTerm')}</Button><Button variant="secondary" disabled={merge.isPending} onClick={() => void act(async () => { await merge.mutateAsync({ p_run_id: termAction.runId, p_term: termAction.term, p_merged_into: null, p_hidden: true }); setTermAction(null) })}>{t('live.hideTerm')}</Button><Button variant="secondary" onClick={() => setTermAction(null)}>{t('live.cancel')}</Button></div></div>}
    {query.isError && <p role="alert">{t('live.restoreError')}</p>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {launchPlanItemId && relevant && !state?.activities.some((activity) => activity.plan_item_id === launchPlanItemId) && <p className="text-sm text-text-muted">{t('live.noLinkedActivity')}</p>}
  </section>
}
