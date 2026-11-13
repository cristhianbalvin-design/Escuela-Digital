import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { liveRpc } from './live-api'
import { isOpportunityAnswer, opportunityAnswerSchema, opportunityStats, type OpportunityAnswer } from './live-utils'

const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-3 text-text'
type Config = { areas: string[]; problems: string[]; solutions: string[] }
function lists(config: Record<string, unknown>): Config {
  const list = (key: string) => Array.isArray(config[key]) ? (config[key] as unknown[]).filter((item): item is string => typeof item === 'string') : []
  return { areas: list('areas'), problems: list('problems'), solutions: list('solutions') }
}

function OpportunityCard({ answer }: { answer: OpportunityAnswer }) {
  const { t } = useTranslation()
  const stats = opportunityStats(answer)
  return <dl className="grid gap-1 rounded-control border border-border p-3 text-sm">
    <div><dt className="inline font-semibold">{t('live.opp.process')}: </dt><dd className="inline break-words">{answer.process} · {answer.area}</dd></div>
    <div><dt className="inline font-semibold">{t('live.opp.opportunity')}: </dt><dd className="inline break-words">{answer.opportunity}</dd></div>
    <div><dt className="inline font-semibold">{t('live.opp.solution')}: </dt><dd className="inline">{answer.solution}</dd></div>
    <div><dt className="inline font-semibold">{t('live.opp.priority')}: </dt><dd className="inline">{stats.priority}/25 · {t('live.opp.impact')} {answer.impact}/5 · {t('live.opp.ease')} {answer.ease}/5</dd></div>
    <div className="font-bold uppercase tracking-wide text-brand">{t(`live.opp.quadrants.${stats.quadrant}`)}</div>
  </dl>
}

/** Formulario del alumno: una oportunidad por participante, editable mientras la ronda esté abierta. */
export function OpportunityRound({ run, code, token, mine, onSaved }: {
  run: { id: string; status: 'open' | 'closed'; paused: boolean; config: Record<string, unknown> }
  code: string; token: string; mine: unknown; onSaved: () => void
}) {
  const { t } = useTranslation()
  const config = lists(run.config)
  const saved = isOpportunityAnswer(mine) ? mine : null
  const [editing, setEditing] = useState(!saved)
  const [draft, setDraft] = useState<OpportunityAnswer>(saved ?? { area: '', process: '', task: '', problems: [], opportunity: '', solution: '', impact: 3, ease: 3 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = run.status === 'open' && !run.paused
  const parsed = opportunityAnswerSchema.safeParse(draft)
  const valid = parsed.success && config.areas.includes(draft.area) && config.solutions.includes(draft.solution)
  const set = <K extends keyof OpportunityAnswer>(key: K, value: OpportunityAnswer[K]) => setDraft((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!parsed.success || !valid || busy || !open) return
    setBusy(true); setError('')
    try {
      await liveRpc('submit_live_response', { p_code: code, p_token: token, p_run_id: run.id, p_answer: parsed.data })
      setEditing(false); onSaved()
    } catch { setError(t('live.submitError')) } finally { setBusy(false) }
  }

  if (saved && !editing) return <div className="grid gap-3">
    <p role="status" className="font-semibold text-brand">{t('live.opp.sent')}</p>
    <OpportunityCard answer={saved} />
    {open && <Button variant="secondary" onClick={() => { setDraft(saved); setEditing(true) }}>{t('live.updateAnswer')}</Button>}
  </div>
  if (run.status === 'closed') return <p>{t('live.responsesClosed')}</p>
  return <form onSubmit={(event) => void submit(event)} className="grid gap-4">
    {run.paused && <p role="status">{t('live.responsesPaused')}</p>}
    <label className="grid gap-1 font-medium">{t('live.opp.area')}
      <select className={field} value={draft.area} disabled={!open} onChange={(event) => set('area', event.target.value)}>
        <option value="">{t('live.opp.choose')}</option>{config.areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
    <label className="grid gap-1 font-medium">{t('live.opp.processQuestion')}
      <input className={field} maxLength={120} value={draft.process} disabled={!open} onChange={(event) => set('process', event.target.value)} /></label>
    <label className="grid gap-1 font-medium">{t('live.opp.taskQuestion')}
      <textarea className={`${field} min-h-24`} maxLength={250} value={draft.task} disabled={!open} onChange={(event) => set('task', event.target.value)} /></label>
    <fieldset className="grid gap-2"><legend className="font-medium">{t('live.opp.problemsQuestion')}</legend>
      {config.problems.map((problem) => { const checked = draft.problems.includes(problem)
        return <label key={problem} className={`flex min-h-11 items-center gap-3 rounded-control border p-3 ${checked ? 'border-brand bg-brand-soft' : 'border-border'}`}>
          <input type="checkbox" checked={checked} disabled={!open} onChange={() => set('problems', checked ? draft.problems.filter((item) => item !== problem) : [...draft.problems, problem])} />{problem}</label> })}
    </fieldset>
    <label className="grid gap-1 font-medium">{t('live.opp.opportunityQuestion')}
      <textarea className={`${field} min-h-24`} maxLength={400} value={draft.opportunity} disabled={!open} onChange={(event) => set('opportunity', event.target.value)} /></label>
    <fieldset className="grid gap-2"><legend className="font-medium">{t('live.opp.solutionQuestion')}</legend>
      {config.solutions.map((solution) => <label key={solution} className={`flex min-h-11 items-center gap-3 rounded-control border p-3 ${draft.solution === solution ? 'border-brand bg-brand-soft' : 'border-border'}`}>
        <input type="radio" name="opp-solution" checked={draft.solution === solution} disabled={!open} onChange={() => set('solution', solution)} />{solution}</label>)}
    </fieldset>
    {(['impact', 'ease'] as const).map((key) => <label key={key} className="grid gap-1 font-medium">
      {t(key === 'impact' ? 'live.opp.impactQuestion' : 'live.opp.easeQuestion')} <span className="text-2xl font-bold">{draft[key]}/5</span>
      <input type="range" min={1} max={5} step={1} value={draft[key]} disabled={!open} onChange={(event) => set(key, Number(event.target.value))} />
      <span className="flex justify-between text-xs font-normal text-text-muted"><span>{t(key === 'impact' ? 'live.opp.veryLow' : 'live.opp.veryHard')}</span><span>{t(key === 'impact' ? 'live.opp.veryHigh' : 'live.opp.veryEasy')}</span></span>
    </label>)}
    <p className="rounded-control border border-border p-3 text-sm">{t('live.opp.priority')}: <strong>{opportunityStats(draft).priority}/25</strong> · {t(`live.opp.quadrants.${opportunityStats(draft).quadrant}`)}</p>
    {error && <p role="alert">{error}</p>}
    <Button type="submit" className="min-h-14 w-full text-base" disabled={!valid || busy || !open}>{busy ? t('live.sending') : saved ? t('live.updateAnswer') : t('live.send')}</Button>
  </form>
}

/** Mapa colectivo Impacto × Facilidad, top por prioridad y conteos. Sin nombres. */
export function OpportunityMap({ answers, large = false }: { answers: unknown[]; large?: boolean }) {
  const { t } = useTranslation()
  const items = answers.filter(isOpportunityAnswer).map((answer) => ({ ...answer, ...opportunityStats(answer) }))
  if (items.length === 0) return <p>{t('live.noResults')}</p>
  const average = (key: 'impact' | 'ease') => (items.reduce((sum, item) => sum + item[key], 0) / items.length).toFixed(1)
  const top = [...items].sort((a, b) => b.priority - a.priority).slice(0, 5)
  const count = (impact: number, ease: number) => items.filter((item) => item.impact === impact && item.ease === ease).length
  const solutions = [...new Set(items.map((item) => item.solution))].map((name) => ({ name, n: items.filter((item) => item.solution === name).length })).sort((a, b) => b.n - a.n)
  const kpis: [string, string][] = [[t('live.opp.sentCount'), String(items.length)], [t('live.opp.quadrants.quick_win'), String(items.filter((item) => item.quadrant === 'quick_win').length)],
    [t('live.opp.avgImpact'), average('impact')], [t('live.opp.avgEase'), average('ease')]]
  return <section aria-label={t('live.opp.map')} className={`grid gap-5 ${large ? 'text-xl' : ''}`}>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
      {kpis.map(([label, value]) => <div key={label} className="rounded-control border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p></div>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 font-semibold">{t('live.opp.map')}</h3>
        <table className="w-full table-fixed border-collapse text-center" aria-label={t('live.opp.map')}>
          <tbody>{[5, 4, 3, 2, 1].map((impact) => <tr key={impact}>
            <th scope="row" className="w-10 text-xs font-semibold text-text-muted">{impact}</th>
            {[1, 2, 3, 4, 5].map((ease) => { const n = count(impact, ease); const quadrant = opportunityStats({ impact, ease }).quadrant
              return <td key={ease} className={`h-12 border border-border ${quadrant === 'quick_win' ? 'bg-brand-soft' : ''}`}>
                {n > 0 && <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand font-bold text-white" aria-label={t('live.opp.cell', { count: n, impact, ease })}>{n}</span>}</td> })}
          </tr>)}
          <tr><td />{[1, 2, 3, 4, 5].map((ease) => <th key={ease} scope="col" className="pt-1 text-xs font-semibold text-text-muted">{ease}</th>)}</tr></tbody>
        </table>
        <p className="mt-1 text-xs text-text-muted">{t('live.opp.axes')}</p>
      </div>
      <div className="grid content-start gap-4">
        <div><h3 className="mb-2 font-semibold">{t('live.opp.top')}</h3>
          <ol className="grid gap-2">{top.map((item, index) => <li key={index} className="rounded-control border border-border p-2 text-sm">
            <p className="break-words font-semibold">{index + 1}. {item.process} <span className="font-normal text-text-muted">· {item.area} · {item.solution}</span></p>
            <p className="break-words">{item.opportunity}</p>
            <p className="text-text-muted">{item.priority}/25 · {t(`live.opp.quadrants.${item.quadrant}`)}</p></li>)}</ol></div>
        <div><h3 className="mb-1 font-semibold">{t('live.opp.bySolution')}</h3>
          <p className="text-sm">{solutions.map((item) => `${item.name} (${item.n})`).join(' · ')}</p></div>
      </div>
    </div>
  </section>
}
