import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { liveRpc } from './live-api'
import type { LiveRpcOutput } from './live-contract'
import { SafeMarkdown } from './SafeMarkdown'
import { streakBadge } from './live-special-utils'

type StudentState = LiveRpcOutput<'get_live_state'>
type Run = NonNullable<StudentState['run']>
type Ranking = NonNullable<StudentState['ranking']>
type CompareAnswer = Extract<NonNullable<StudentState['my_response']>, { ratings: Record<string, Record<string, number>> }>
type Option = { id: string; label: string; content?: string; real_name?: string }
type Criterion = { id: string; label: string; description: string }

export function useRoundCountdown(run: Pick<Run, 'opened_at' | 'paused' | 'status'>, seconds: number) {
  const [now, setNow] = useState(Date.now())
  const [timer, setTimer] = useState(() => ({ deadline: Date.parse(run.opened_at) + seconds * 1000, frozen: null as number | null }))
  useEffect(() => {
    if (run.paused || run.status === 'closed') {
      setTimer((value) => value.frozen !== null ? value : { ...value, frozen: Math.max(0, Math.ceil((value.deadline - Date.now()) / 1000)) })
      return
    }
    setTimer((value) => value.frozen === null ? value : { ...value, frozen: null })
  }, [run.paused, run.status])
  useEffect(() => {
    if (run.paused || run.status === 'closed') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [run.paused, run.status])
  return timer.frozen ?? Math.max(0, Math.ceil((timer.deadline - now) / 1000))
}

export function QuizRound({ run, code, token, mine, ranking, myRank, onSaved }: {
  run: Run; code: string; token: string; mine: StudentState['my_response']; ranking?: Ranking;
  myRank?: StudentState['my_rank']; onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const config = run.config as { options: Option[]; seconds: number; correct?: string; explanation?: string }
  const remaining = useRoundCountdown(run, config.seconds)
  const [busy, setBusy] = useState(false)
  const [sentLocally, setSentLocally] = useState(false)
  const [localChoice, setLocalChoice] = useState<string | null>(null)
  const [error, setError] = useState('')
  const submitted = typeof mine === 'string' || sentLocally
  const chosen = typeof mine === 'string' ? mine : localChoice
  const active = run.status === 'open' && !run.paused && !run.reveal && remaining > 0 && !submitted && !busy
  async function choose(id: string) {
    if (!active) return
    setBusy(true); setError('')
    try { await liveRpc('submit_live_response', { p_code: code, p_token: token, p_run_id: run.id, p_answer: id }); setLocalChoice(id); setSentLocally(true); onSaved() }
    catch { setError(t('live.submitError')) }
    finally { setBusy(false) }
  }
  const badge = streakBadge(myRank?.streak_current ?? 0, i18n.language)
  return <div className="space-y-5">
    <p className="text-center text-3xl font-bold" role="timer">{run.paused ? t('live.responsesPaused') : `${remaining}s`}</p>
    <div className="grid gap-3">{config.options.map((option, index) => <button key={option.id} type="button" disabled={!active} onClick={() => void choose(option.id)}
      className={`min-h-20 rounded-control border p-4 text-left text-xl font-semibold disabled:cursor-default ${chosen === option.id ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
      <span className="mr-3 text-brand">{String.fromCharCode(65 + index)}</span>{option.label}</button>)}</div>
    {submitted && <p role="status" className="font-semibold text-brand">{t('live.quizSent')}</p>}
    {!submitted && remaining === 0 && <p role="status">{t('live.timeUp')}</p>}
    {error && <p role="alert" className="text-error">{error}</p>}
    {run.reveal && <div className="space-y-2 rounded-control border border-border p-4">
      {submitted && <p className="text-2xl font-bold">{chosen === config.correct ? '✓' : '✗'} {t(chosen === config.correct ? 'live.correct' : 'live.incorrect')}</p>}
      <p className="font-semibold">{t('live.correct')}: {config.options.find((option) => option.id === config.correct)?.label}</p>
      {config.explanation && <p>{config.explanation}</p>}
    </div>}
    {run.show_results && <QuizDistribution run={run} />}
    {run.show_ranking && <><RankingList entries={ranking ?? []} />{myRank && <p>{t('live.yourPosition')}: #{myRank.rank} · {myRank.points} {t('live.score')}</p>}{badge && <p className="font-bold">{badge}</p>}</>}
  </div>
}

export function QuizDistribution({ run }: { run: Run }) {
  const { t } = useTranslation()
  const config = run.config as { correct?: string }
  if (!run.show_results || !run.results) return null
  return <section className="space-y-3"><h3 className="font-semibold">{t('live.distribution')}</h3>{run.results.rows.filter((row) => 'id' in row).map((row) => <div key={row.id} className={run.reveal && row.id === config.correct ? 'rounded-control border-2 border-green-500 p-2' : ''}>
    <div className="flex justify-between gap-2"><span>{row.label}{run.reveal && row.id === config.correct ? ' ✓' : ''}</span><span>{row.count} · {row.percent}%</span></div>
    <div className="h-3 rounded-full bg-brand-soft"><div className="h-3 rounded-full bg-brand" style={{ width: `${Math.min(100, row.percent)}%` }} /></div></div>)}</section>
}

export function RankingList({ entries, full = false }: { entries: Ranking; full?: boolean }) {
  const { t } = useTranslation()
  return <section className="space-y-2"><h3 className="font-bold">{t('live.ranking')}</h3><ol className="space-y-1">{(full ? entries : entries.slice(0, 5)).map((entry) => <li key={entry.participant_id} className="flex flex-wrap justify-between gap-2 rounded-control border border-border p-2"><span>#{entry.rank} {entry.name}</span><span>{entry.points} {t('live.score')} · {entry.correct} {t('live.correctCount')} · {t('live.bestStreak')}: {entry.best_streak}</span></li>)}</ol></section>
}

export function CompareRound({ run, code, token, mine, onSaved }: { run: Run; code: string; token: string; mine: StudentState['my_response']; onSaved: () => void }) {
  const { t } = useTranslation()
  const config = run.config as { description?: string; options: Option[]; criteria: Criterion[]; scale_max?: number; final_question: string; ask_comment: boolean; comment_max: number }
  const saved = mine && typeof mine === 'object' && !Array.isArray(mine) ? mine as CompareAnswer : null
  const [started, setStarted] = useState(!!saved)
  const [tab, setTab] = useState(0)
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>(saved?.ratings ?? {})
  const [choice, setChoice] = useState(saved?.choice ?? '')
  const [comment, setComment] = useState(saved?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editable = run.status === 'open' && !run.paused
  const complete = !!choice && config.options.every((option) => config.criteria.every((criterion) => ratings[option.id]?.[criterion.id] !== undefined))
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!editable || !complete || busy) return
    setBusy(true); setError('')
    try { await liveRpc('submit_live_response', { p_code: code, p_token: token, p_run_id: run.id, p_answer: { ratings, choice, ...(config.ask_comment ? { comment } : {}) } }); onSaved() }
    catch { setError(t('live.submitError')) }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    {config.description && <p className="whitespace-pre-line">{config.description}</p>}
    {!started ? <Button disabled={!editable} onClick={() => setStarted(true)}>{t('live.startEvaluation')}</Button> : <>
      <div className="flex flex-wrap gap-2" role="tablist">{config.options.map((option, index) => <button key={option.id} type="button" role="tab" aria-selected={tab === index} onClick={() => setTab(index)} className={`rounded-control border px-4 py-3 ${tab === index ? 'border-brand bg-brand-soft' : 'border-border'}`}>{option.label}</button>)}</div>
      <section role="tabpanel" className="rounded-control border border-border p-4"><h3 className="mb-3 text-xl font-bold">{config.options[tab]?.label}{run.reveal && config.options[tab]?.real_name ? ` → ${config.options[tab]?.real_name}` : ''}</h3><SafeMarkdown source={config.options[tab]?.content ?? ''} /></section>
      <form onSubmit={(event) => void submit(event)} className="space-y-5"><div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="border border-border p-2 text-left">{t('live.criterion')}</th>{config.options.map((option) => <th key={option.id} className="border border-border p-2">{option.label}</th>)}</tr></thead><tbody>{config.criteria.map((criterion) => <tr key={criterion.id}><th className="border border-border p-2 text-left"><span>{criterion.label}</span><span className="block text-sm font-normal text-text-muted">{criterion.description}</span></th>{config.options.map((option) => <td key={option.id} className="border border-border p-2"><div className="flex min-w-36 flex-wrap gap-1">{Array.from({ length: config.scale_max ?? 5 }, (_, i) => i + 1).map((value) => <button key={value} type="button" disabled={!editable} aria-label={`${criterion.label}, ${option.label}: ${value}`} aria-pressed={ratings[option.id]?.[criterion.id] === value} onClick={() => setRatings((old) => ({ ...old, [option.id]: { ...old[option.id], [criterion.id]: value } }))} className={`size-9 rounded-control border ${ratings[option.id]?.[criterion.id] === value ? 'border-brand bg-brand-soft font-bold' : 'border-border'}`}>{value}</button>)}</div></td>)}</tr>)}</tbody></table></div>
        <fieldset className="space-y-2"><legend className="font-semibold">{config.final_question}</legend>{config.options.map((option) => <label key={option.id} className="flex gap-2"><input type="radio" name="compare-choice" checked={choice === option.id} disabled={!editable} onChange={() => setChoice(option.id)} />{option.label}</label>)}</fieldset>
        {config.ask_comment && <label className="block">{t('live.optionalComment')}<textarea className="mt-1 min-h-28 w-full rounded-control border border-border bg-surface p-2" maxLength={config.comment_max} value={comment} disabled={!editable} onChange={(event) => setComment(event.target.value)} /><span className="text-sm text-text-muted">{comment.length}/{config.comment_max}</span></label>}
        {saved && <p role="status">{t('live.savedEvaluation')}</p>}{error && <p role="alert" className="text-error">{error}</p>}
        {editable && <Button type="submit" disabled={!complete || busy}>{busy ? t('live.sending') : saved ? t('live.updateAnswer') : t('live.send')}</Button>}
      </form>
    </>}
    {run.show_results && <CompareResults run={run} />}
  </div>
}

export function CompareResults({ run, teacher = false }: { run: Run; teacher?: boolean }) {
  const { t } = useTranslation()
  const config = run.config as { options: Option[]; criteria: Criterion[] }
  const matrix = run.results?.matrix
  const comments = run.results?.comments ?? []
  if (!matrix?.length) return <p>{t('live.noResults')}</p>
  const sorted = [...matrix].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1))
  return <section className="space-y-4"><h3 className="text-xl font-bold">{t('live.compareResults')}</h3>
    <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="border border-border p-2">{t('live.model')}</th>{config.criteria.map((criterion) => <th key={criterion.id} className="border border-border p-2">{criterion.label}</th>)}<th className="border border-border p-2">{t('live.overall')}</th><th className="border border-border p-2">{t('live.votes')}</th></tr></thead><tbody>{sorted.map((row, index) => <tr key={row.option_id}><th className="border border-border p-2 text-left transition-colors duration-500">#{index + 1} {row.label}{(run.reveal || teacher) && row.real_name ? ` → ${row.real_name}` : ''}</th>{config.criteria.map((criterion) => <td key={criterion.id} className="border border-border p-2 text-center">{row.criteria.find((cell) => cell.criterion_id === criterion.id)?.average?.toFixed(1) ?? '–'}</td>)}<td className="border border-border p-2 text-center">{row.overall?.toFixed(1) ?? '–'}</td><td className="border border-border p-2 text-center">{row.vote_percent}% ({row.votes})</td></tr>)}</tbody></table></div>
    <div><h4 className="font-semibold">{t('live.bestByCriterion')}</h4><ul className="list-disc pl-6">{config.criteria.map((criterion) => { const best = [...matrix].sort((a, b) => (b.criteria.find((cell) => cell.criterion_id === criterion.id)?.average ?? -1) - (a.criteria.find((cell) => cell.criterion_id === criterion.id)?.average ?? -1))[0]; const score = best?.criteria.find((cell) => cell.criterion_id === criterion.id)?.average; return <li key={criterion.id}>{criterion.label}: {score === null || score === undefined ? '–' : best?.label}</li> })}</ul></div>
    {comments.length ? <div><h4 className="font-semibold">{t('live.comments')}</h4><ul className="list-disc pl-6">{comments.map((comment, index) => <li key={index} className="break-words">{comment}</li>)}</ul></div> : null}
  </section>
}
