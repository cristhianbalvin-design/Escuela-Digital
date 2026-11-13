import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useLessonPlan, useSessionPlan } from '@/features/planning/planning-api'
import { RunView } from './LiveControlPanel'
import { RankingList } from './LiveSpecial'
import { SessionNav } from './SessionNav'
import { useLiveAi, useLiveControlState, useLiveSessions } from './live-teacher-api'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`

function Results({ offeringId, lessonId }: { offeringId: string; lessonId: string }) {
  const { t, i18n } = useTranslation()
  const sessions = useLiveSessions(offeringId, lessonId)
  const plan = useLessonPlan(lessonId)
  const sessionPlan = useSessionPlan(offeringId, lessonId)
  const ai = useLiveAi()
  const [picked, setPicked] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const list = sessions.data ?? []
  const sessionId = picked || (list.find((item) => item.run_count > 0) ?? list[0])?.id || ''
  const control = useLiveControlState(sessionId)
  const state = control.data
  const blocks = plan.data?.items ?? []
  const runs = state?.runs ?? []
  const activities = state?.activities ?? []
  const participants = state?.participant_count ?? 0
  const launched = new Set(runs.map((run) => run.activity_id)).size
  const participation = runs.length && participants
    ? Math.round(runs.reduce((sum, run) => sum + Math.min(1, run.results.responses.length / participants), 0) * 100 / runs.length) : null
  const doneBlocks = (sessionPlan.data?.progress ?? []).filter((item) => item.done).length
  const blockOf = (activityId: string) => activities.find((item) => item.id === activityId)?.plan_item_id ?? null
  const groups = [...blocks.map((block) => ({ id: block.id as string | null, title: block.title, time: block.starts_at?.slice(0, 5) ?? '' })),
    { id: null, title: t('live.unlinked'), time: '' }]
    .map((group) => ({ ...group, runs: runs.filter((run) => blockOf(run.activity_id) === group.id) }))
    .filter((group) => group.runs.length > 0)
  const latestQuiz = [...runs].reverse().find((run) => run.type === 'quiz')
  const rankingBlock = latestQuiz ? blockOf(latestQuiz.activity_id) : undefined

  function download() {
    const header = ['bloque', 'actividad', 'tipo', 'participante', 'respuesta', 'oculta'].map(cell).join(',')
    const rows = groups.flatMap((group) => group.runs.flatMap((run) => run.results.responses.map((response) =>
      [group.title, run.title, t(`live.types.${run.type}`), response.participant_name ?? '',
        typeof response.answer === 'string' ? response.answer : JSON.stringify(response.answer), response.hidden ? 'sí' : 'no'].map(cell).join(','))))
    const blob = new Blob([`﻿${[header, ...rows].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `resultados-${state?.session.code ?? 'clase'}.csv`; anchor.click()
    URL.revokeObjectURL(url)
  }
  async function analyze() {
    setMessage(''); setSummary(null)
    try { setSummary((await ai.analyzeGroup.mutateAsync(sessionId)).summary) }
    catch (error) { setMessage(error instanceof Error ? error.message : t('live.aiError')) }
  }

  const kpis = [
    { label: t('live.sessionResults.participants'), value: String(participants), note: t('live.sessionResults.participantsNote') },
    { label: t('live.sessionResults.participation'), value: participation === null ? '–' : `${participation}%`, note: t('live.sessionResults.participationNote') },
    { label: t('live.sessionResults.activities'), value: `${launched} / ${activities.length}`, note: t('live.sessionResults.activitiesNote') },
    { label: t('live.sessionResults.script'), value: `${doneBlocks} / ${blocks.length}`, note: t('live.sessionResults.scriptNote') },
  ]
  return <div className="min-h-screen text-text">
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-4 sm:px-8">
      <h1 className="min-w-0 flex-1 text-2xl font-bold">{t('live.sessionResults.title')}</h1>
      <SessionNav lessonId={lessonId} offeringId={offeringId} current="results" />
    </header>
    <main className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-8">
      {sessions.isPending ? <p role="status">{t('live.loading')}</p>
        : sessions.isError ? <p role="alert">{t('live.restoreError')}</p>
        : list.length === 0 ? <p>{t('live.sessionResults.empty')}</p> : <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm">{t('live.sessionResults.session')}
              <select className="min-h-11 rounded-control border border-border bg-surface p-2" value={sessionId} onChange={(event) => { setPicked(event.target.value); setSummary(null) }}>
                {list.map((item) => <option key={item.id} value={item.id}>
                  {new Date(item.created_at).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })} · {item.code} · {t(item.status === 'active' ? 'live.cockpit.live' : 'live.ended')} · {t('live.connected', { count: item.participant_count })}
                </option>)}
              </select></label>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!runs.length} onClick={download}>{t('live.sessionResults.csv')}</Button>
              <Button disabled={!runs.some((run) => run.results.total > 0) || ai.analyzeGroup.isPending} onClick={() => void analyze()}>{t(ai.analyzeGroup.isPending ? 'live.aiAnalyzing' : 'live.sessionResults.aiClose')}</Button>
            </div>
          </div>
          {message && <p role="alert">{message}</p>}
          {summary !== null && <section className="grid gap-2 rounded-control border border-border bg-surface-elevated p-4" aria-live="polite">
            <h2 className="font-semibold">{t('live.aiSummary')}</h2><p className="whitespace-pre-line break-words">{summary}</p></section>}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
            {kpis.map((kpi) => <div key={kpi.label} className="rounded-control border border-border bg-surface-elevated p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{kpi.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{kpi.value}</p>
              <p className="text-sm text-text-muted">{kpi.note}</p>
            </div>)}
          </div>

          {control.isPending && sessionId ? <p role="status">{t('live.loading')}</p>
            : groups.length === 0 ? <p>{t('live.sessionResults.noRuns')}</p>
            : groups.map((group) => {
              const quiz = group.runs.filter((run) => run.type === 'quiz')
              const sorted = [...quiz].sort((a, b) => (a.results.correct_percent ?? 0) - (b.results.correct_percent ?? 0))
              const average = quiz.length ? quiz.reduce((sum, run) => sum + (run.results.correct_percent ?? 0), 0) / quiz.length : null
              const answered = participants ? Math.round(group.runs.reduce((sum, run) => sum + Math.min(1, run.results.responses.length / participants), 0) * 100 / group.runs.length) : 0
              return <section key={group.id ?? 'unlinked'} className="grid gap-3 rounded-control border border-border bg-surface-elevated p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold"><span className="mr-2 text-sm font-semibold tabular-nums text-text-muted">{group.time}</span>{group.title}</h2>
                  <p className="text-sm text-text-muted">{t('live.sessionResults.blockParticipation', { percent: answered })}</p>
                </div>
                <progress className="w-full" max={100} value={answered} aria-label={t('live.sessionResults.participation')} />
                {quiz.length > 0 && <div className="grid gap-1 text-sm">
                  <p>{t('live.averageCorrect')}: {average?.toFixed(0) ?? '–'}% · {t('live.hardestQuestion')}: {sorted[0]?.title ?? '–'} · {t('live.easiestQuestion')}: {sorted.at(-1)?.title ?? '–'}</p>
                  {rankingBlock === group.id && state && state.ranking.length > 0 && <RankingList entries={state.ranking} full />}
                </div>}
                {group.runs.map((run) => <details key={run.id} className="rounded-control border border-border p-3">
                  <summary className="cursor-pointer font-medium">{run.title} <span className="font-normal text-text-muted">· {t(`live.types.${run.type}`)} · {t('live.sessionResults.answers', { count: run.results.responses.length })}</span></summary>
                  <div className="pt-3"><RunView run={run} participantCount={participants} hideTitle /></div>
                </details>)}
              </section>
            })}
        </>}
    </main>
  </div>
}

/** Momento 3 · Resultados de una sesión, por edición; el permiso lo validan las RPC. */
export function SessionResultsPage() {
  const { t } = useTranslation()
  const { offeringId = '', lessonId = '' } = useParams()
  const auth = useAuth()
  if (auth.status === 'loading') return <main className="p-8" role="status">{t('live.loading')}</main>
  if (!UUID.test(offeringId) || !UUID.test(lessonId) || !auth.user) return <main className="p-8" role="alert">{t('live.unavailable')}</main>
  return <Results offeringId={offeringId} lessonId={lessonId} />
}
