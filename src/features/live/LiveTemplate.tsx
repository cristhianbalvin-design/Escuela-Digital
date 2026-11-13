import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { liveRpc } from './live-api'
import { answerSchema, isTemplateAnswer, liveActivitySchema, templateFieldKinds, type LiveActivity, type TemplateAnswer, type TemplateField } from './live-utils'

const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-3 text-text'
const small = 'w-full min-w-0 rounded-control border border-border bg-surface p-2'

export function templateFields(config: Record<string, unknown>): TemplateField[] {
  return Array.isArray(config.fields) ? config.fields as TemplateField[] : []
}

/** Plantilla de ejemplo: el docente la adapta a su ejercicio. */
export function defaultTemplateConfig(): Record<string, unknown> {
  return { fields: [
    { id: crypto.randomUUID(), label: 'Objetivo', kind: 'text', required: true },
    { id: crypto.randomUUID(), label: 'Contexto', kind: 'long', required: true },
    { id: crypto.randomUUID(), label: 'Resultado esperado', kind: 'long' },
  ] }
}

/** Editor de campos de la plantilla guiada. */
export function TemplateEditor({ config, change, editable }: {
  config: Record<string, unknown>; change: (config: Record<string, unknown>) => void; editable: boolean
}) {
  const { t } = useTranslation()
  const fields = templateFields(config)
  const set = (next: TemplateField[]) => change({ ...config, fields: next })
  const update = (index: number, patch: Partial<TemplateField>) => set(fields.map((item, i) => {
    if (i !== index) return item
    const next: TemplateField = { ...item, ...patch }
    if (next.kind === 'select' && !next.options) next.options = ['', '']
    if (next.kind !== 'select') delete next.options
    if (!next.help) delete next.help
    if (!next.required) delete next.required
    return next
  }))
  const move = (index: number, offset: number) => {
    const copy = [...fields]; const target = index + offset
    if (target < 0 || target >= copy.length) return
    ;[copy[index], copy[target]] = [copy[target]!, copy[index]!]; set(copy)
  }
  return <fieldset className="grid gap-3">
    <legend className="font-medium">{t('live.template.fields')}</legend>
    <p className="text-sm text-text-muted">{t('live.template.fieldsHelp')}</p>
    {fields.map((item, index) => <div key={item.id} className="grid gap-2 rounded-control border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-control bg-brand-soft text-sm font-semibold">{index + 1}</span>
        <input className={`${small} flex-1`} aria-label={t('live.template.fieldLabel', { number: index + 1 })} placeholder={t('live.template.labelPlaceholder')} maxLength={200} value={item.label} disabled={!editable} onChange={(e) => update(index, { label: e.target.value })} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
        <select className={small} aria-label={t('live.template.kind')} value={item.kind} disabled={!editable} onChange={(e) => { const kind = templateFieldKinds.find((value) => value === e.target.value); if (kind) update(index, { kind }) }}>
          {templateFieldKinds.map((kind) => <option key={kind} value={kind}>{t(`live.template.kinds.${kind}`)}</option>)}
        </select>
        <input className={small} aria-label={t('live.template.help')} placeholder={t('live.template.helpPlaceholder')} maxLength={300} value={item.help ?? ''} disabled={!editable} onChange={(e) => update(index, { help: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!item.required} disabled={!editable} onChange={(e) => update(index, { required: e.target.checked })} />{t('live.template.required')}</label>
      </div>
      {item.kind === 'select' && <label className="text-sm">{t('live.template.options')}
        <textarea className={`${small} min-h-20`} disabled={!editable} value={(item.options ?? []).join('\n')} onChange={(e) => update(index, { options: e.target.value.split('\n') })} /></label>}
      {editable && <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={index === 0} aria-label={t('live.moveUp')} onClick={() => move(index, -1)}>↑</Button>
        <Button variant="secondary" disabled={index === fields.length - 1} aria-label={t('live.moveDown')} onClick={() => move(index, 1)}>↓</Button>
        <Button variant="secondary" disabled={fields.length <= 1} onClick={() => set(fields.filter((_, i) => i !== index))}>{t('live.template.removeField')}</Button>
      </div>}
    </div>)}
    {editable && <Button variant="secondary" className="w-fit" disabled={fields.length >= 15} onClick={() => set([...fields, { id: crypto.randomUUID(), label: '', kind: 'long' }])}>{t('live.template.addField')}</Button>}
  </fieldset>
}

/** Limpia las opciones de los campos de selección antes de guardar. */
export function cleanTemplateConfig(config: Record<string, unknown>): Record<string, unknown> {
  return { ...config, fields: templateFields(config).map((item) => item.kind === 'select'
    ? { ...item, options: [...new Set((item.options ?? []).map((value) => value.trim()).filter(Boolean))] } : item) }
}

export function TemplateCard({ fields, answer, name }: { fields: TemplateField[]; answer: TemplateAnswer; name?: string | null }) {
  return <article className="grid gap-2 rounded-card border border-border bg-surface-elevated p-4">
    {name && <p className="text-sm font-semibold text-brand">{name}</p>}
    <dl className="grid gap-2">{fields.filter((item) => (answer[item.id] ?? '').trim()).map((item) => <div key={item.id}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{item.label}</dt>
      <dd className="whitespace-pre-wrap break-words">{answer[item.id]}</dd></div>)}</dl>
  </article>
}

/** Respuestas de la plantilla guiada; en público siempre sin nombre. */
export function TemplateResponses({ config, responses, large = false }: {
  config: Record<string, unknown>; responses: { id: string; answer: unknown; participant_name?: string | null }[]; large?: boolean
}) {
  const { t } = useTranslation()
  const fields = templateFields(config)
  const items = responses.filter((response) => isTemplateAnswer(response.answer))
  if (items.length === 0) return <p>{t('live.noResults')}</p>
  return <section aria-label={t('live.results')} className={`grid gap-3 ${large ? 'text-lg' : ''}`}>
    <p className="text-sm text-text-muted">{t('live.template.received', { count: items.length })}</p>
    <div className="grid gap-3 lg:grid-cols-2">{items.map((response) => <TemplateCard key={response.id} fields={fields} answer={response.answer as TemplateAnswer} name={response.participant_name} />)}</div>
  </section>
}

/** Formulario del alumno: una plantilla por participante, editable mientras la ronda esté abierta. */
export function TemplateRound({ run, code, token, mine, onSaved }: {
  run: { id: string; status: 'open' | 'closed'; paused: boolean; config: Record<string, unknown> }
  code: string; token: string; mine: unknown; onSaved: () => void
}) {
  const { t } = useTranslation()
  const fields = templateFields(run.config)
  const saved = isTemplateAnswer(mine) ? mine : null
  const [editing, setEditing] = useState(!saved)
  const [draft, setDraft] = useState<TemplateAnswer>(saved ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = run.status === 'open' && !run.paused
  const activity = liveActivitySchema.safeParse({ type: 'template', config: run.config })
  const prepared = Object.fromEntries(Object.entries(draft).filter(([key]) => fields.some((item) => item.id === key)))
  const valid = activity.success && answerSchema(activity.data).safeParse(prepared).success

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy || !open) return
    setBusy(true); setError('')
    try {
      await liveRpc('submit_live_response', { p_code: code, p_token: token, p_run_id: run.id, p_answer: prepared })
      setEditing(false); onSaved()
    } catch { setError(t('live.submitError')) } finally { setBusy(false) }
  }

  if (saved && !editing) return <div className="grid gap-3">
    <p role="status" className="font-semibold text-brand">{t('live.template.sent')}</p>
    <TemplateCard fields={fields} answer={saved} />
    {open && <Button variant="secondary" onClick={() => { setDraft(saved); setEditing(true) }}>{t('live.updateAnswer')}</Button>}
  </div>
  if (run.status === 'closed') return <p>{t('live.responsesClosed')}</p>
  return <form onSubmit={(event) => void submit(event)} className="grid gap-4">
    {run.paused && <p role="status">{t('live.responsesPaused')}</p>}
    {fields.map((item, index) => {
      const value = draft[item.id] ?? ''
      const id = `tpl-${item.id}`
      const set = (next: string) => setDraft((current) => ({ ...current, [item.id]: next }))
      return <div key={item.id} className="grid gap-1">
        <label htmlFor={id} className="font-medium">{index + 1}. {item.label}{item.required && <span className="text-brand"> *</span>}</label>
        {item.help && <p className="text-sm text-text-muted">{item.help}</p>}
        {item.kind === 'select' ? <select id={id} className={field} value={value} disabled={!open} onChange={(e) => set(e.target.value)}>
          <option value="">{t('live.opp.choose')}</option>{(item.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : item.kind === 'long' ? <><textarea id={id} className={`${field} min-h-32`} maxLength={4000} value={value} disabled={!open} onChange={(e) => set(e.target.value)} />
            <span className="text-xs text-text-muted">{t('live.characterCount', { count: value.length, max: 4000 })}</span></>
          : <input id={id} className={field} maxLength={300} value={value} disabled={!open} onChange={(e) => set(e.target.value)} />}
      </div>
    })}
    {error && <p role="alert">{error}</p>}
    <Button type="submit" className="min-h-14 w-full text-base" disabled={!valid || busy || !open}>{busy ? t('live.sending') : saved ? t('live.updateAnswer') : t('live.send')}</Button>
  </form>
}

type StaticQuestion = { id: string; title: string; type: string; config: Record<string, unknown> }
type StaticAnswer = { answers: Record<string, unknown>; done: boolean }
export function staticQuestions(config: Record<string, unknown>): StaticQuestion[] {
  return Array.isArray(config.questions) ? config.questions as StaticQuestion[] : []
}
function isStaticAnswer(value: unknown): value is StaticAnswer {
  return typeof value === 'object' && value !== null && 'answers' in value && 'done' in value
}
/** Las preguntas de quiz llegan sin la respuesta correcta; se valida sólo la forma. */
function questionActivity(question: StaticQuestion, reveal: boolean): LiveActivity | null {
  const config = question.type === 'quiz' && !reveal ? { ...question.config, correct: (question.config.options as { id: string }[] | undefined)?.[0]?.id ?? '' } : question.config
  const parsed = liveActivitySchema.safeParse({ type: question.type, config })
  return parsed.success ? parsed.data : null
}
function hasAnswer(value: unknown) {
  return value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0) && !(typeof value === 'number' && Number.isNaN(value))
}

/** Cuestionario estático: cada alumno avanza a su ritmo; se guarda al pasar de pregunta. */
export function StaticQuizRound({ run, code, token, mine, score, onSaved }: {
  run: { id: string; status: 'open' | 'closed'; paused: boolean; reveal: boolean; config: Record<string, unknown> }
  code: string; token: string; mine: unknown; score?: { correct: number; total: number }; onSaved: () => void
}) {
  const { t } = useTranslation()
  const questions = staticQuestions(run.config)
  const saved = isStaticAnswer(mine) ? mine : null
  const [answers, setAnswers] = useState<Record<string, unknown>>(saved?.answers ?? {})
  const [index, setIndex] = useState(() => Math.max(0, Math.min(questions.length - 1, questions.findIndex((question) => !hasAnswer(saved?.answers[question.id])))))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = run.status === 'open' && !run.paused
  const done = saved?.done ?? false

  function validAnswers() {
    return Object.fromEntries(Object.entries(answers).filter(([id, value]) => {
      const question = questions.find((item) => item.id === id)
      const activity = question ? questionActivity(question, run.reveal) : null
      const prepared = Array.isArray(value) && question?.type === 'wordcloud' ? value.map((word: string) => word.trim()).filter(Boolean) : value
      return activity !== null && hasAnswer(value) && answerSchema(activity).safeParse(prepared).success
    }))
  }
  async function persist(finish: boolean, next?: number) {
    if (!open || busy) return
    setBusy(true); setError('')
    try {
      await liveRpc('submit_live_response', { p_code: code, p_token: token, p_run_id: run.id, p_answer: { answers: validAnswers(), done: finish } })
      onSaved()
      if (next !== undefined) setIndex(next)
    } catch { setError(t('live.submitError')) } finally { setBusy(false) }
  }

  if (questions.length === 0) return <p>{t('live.noResults')}</p>
  if (done) return <div className="grid gap-4" role="status">
    <div className="rounded-card border border-border bg-brand-soft p-6 text-center">
      <h3 className="text-xl font-bold">{t('live.static.finished')}</h3>
      {score && score.total > 0 && <p className="mt-2 text-3xl font-bold tabular-nums">{t('live.static.score', { correct: score.correct, total: score.total })}</p>}
      {!run.reveal && <p className="mt-2 text-text-muted">{t('live.static.waitReveal')}</p>}
    </div>
    {run.reveal && <ol className="grid gap-3">{questions.map((question, number) => {
      const given = saved?.answers[question.id]
      const options = Array.isArray(question.config.options) ? question.config.options as { id: string; label: string }[] : []
      const correct = typeof question.config.correct === 'string' ? question.config.correct : null
      return <li key={question.id} className="rounded-control border border-border p-3">
        <p className="font-semibold">{number + 1}. {question.title}</p>
        {question.type === 'quiz' ? <>
          <p className={given === correct ? 'text-brand' : 'text-error'}>{t('live.static.yourAnswer')}: {options.find((option) => option.id === given)?.label ?? '–'} {given === correct ? '✓' : '✗'}</p>
          {given !== correct && <p>{t('live.static.correctAnswer')}: {options.find((option) => option.id === correct)?.label}</p>}
          {typeof question.config.explanation === 'string' && <p className="text-sm text-text-muted">{question.config.explanation}</p>}
        </> : <p className="text-sm text-text-muted">{t('live.static.yourAnswer')}: {Array.isArray(given) ? given.map((id) => options.find((option) => option.id === id)?.label ?? String(id)).join(', ') : options.find((option) => option.id === given)?.label ?? String(given ?? '–')}</p>}
      </li>
    })}</ol>}
  </div>
  if (run.status === 'closed') return <p>{t('live.responsesClosed')}</p>

  const question = questions[index]!
  const activity = questionActivity(question, run.reveal)
  const value = answers[question.id]
  const set = (next: unknown) => setAnswers((current) => ({ ...current, [question.id]: next }))
  const answered = questions.filter((item) => hasAnswer(answers[item.id])).length
  const last = index === questions.length - 1
  return <div className="grid gap-5">
    {run.paused && <p role="status">{t('live.responsesPaused')}</p>}
    <div className="grid gap-2">
      <div className="flex justify-between text-sm text-text-muted"><span>{t('live.static.progress', { number: index + 1, total: questions.length })}</span><span>{t('live.static.answered', { count: answered, total: questions.length })}</span></div>
      <progress className="w-full" max={questions.length} value={answered} aria-label={t('live.responseProgress')} />
      <nav aria-label={t('live.static.questions')} className="flex flex-wrap gap-1">{questions.map((item, i) => <button key={item.id} type="button" onClick={() => void persist(false, i)} disabled={busy}
        aria-current={i === index ? 'step' : undefined} aria-label={t('live.static.goTo', { number: i + 1 })}
        className={`size-9 rounded-control border text-sm font-semibold ${i === index ? 'border-brand bg-brand text-white' : hasAnswer(answers[item.id]) ? 'border-brand bg-brand-soft' : 'border-border'}`}>{i + 1}</button>)}</nav>
    </div>
    <fieldset className="grid gap-3">
      <legend className="text-xl font-semibold">{question.title}</legend>
      {typeof question.config.help === 'string' && <p className="text-text-muted">{question.config.help}</p>}
      {activity && (activity.type === 'quiz' || activity.type === 'poll_single' || activity.type === 'vote' || activity.type === 'poll_multi') && activity.config.options.map((option) => {
        const multi = activity.type === 'poll_multi'
        const list = Array.isArray(value) ? value as string[] : []
        const checked = multi ? list.includes(option.id) : value === option.id
        return <label key={option.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control border p-4 text-lg ${checked ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
          <input type={multi ? 'checkbox' : 'radio'} name={`static-${question.id}`} checked={checked} disabled={!open}
            onChange={() => set(multi ? (checked ? list.filter((id) => id !== option.id) : [...list, option.id]) : option.id)} />{option.label}</label>
      })}
      {activity?.type === 'scale' && <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{Array.from({ length: activity.config.scale_max - activity.config.scale_min + 1 }, (_, i) => activity.config.scale_min + i).map((n) =>
        <label key={n} className={`flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-control border p-2 ${value === n ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
          <input className="sr-only" type="radio" name={`static-${question.id}`} checked={value === n} disabled={!open} onChange={() => set(n)} />
          <span className="text-xl font-bold">{n}</span>{activity.config.labels?.[String(n)] && <span className="text-center text-xs">{activity.config.labels[String(n)]}</span>}</label>)}</div>}
      {activity?.type === 'open' && <><textarea className={`${field} min-h-36`} maxLength={activity.config.max_length ?? 280} disabled={!open} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} />
        <span className="text-xs text-text-muted">{t('live.characterCount', { count: typeof value === 'string' ? value.length : 0, max: activity.config.max_length ?? 280 })}</span></>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={index === 0 || busy} onClick={() => void persist(false, index - 1)}>{t('live.static.previous')}</Button>
      {!last && <Button disabled={busy || !open} onClick={() => void persist(false, index + 1)}>{t('live.static.next')}</Button>}
      {last && <Button disabled={busy || !open} onClick={() => { if (answered === questions.length || window.confirm(t('live.static.confirmFinish', { count: questions.length - answered }))) void persist(true) }}>{t('live.static.finish')}</Button>}
    </div>
  </div>
}

type StaticResultsData = { completed?: number; total: number; questions?: { id: string; title: string; type: string; answered: number; correct_percent: number | null; options: { id: string; label: string; count: number; correct: boolean | null }[] }[] }
/** Resultados agregados del cuestionario estático. */
export function StaticQuizResults({ results, large = false }: { results: StaticResultsData; large?: boolean }) {
  const { t } = useTranslation()
  const questions = results.questions ?? []
  return <section aria-label={t('live.results')} className={`grid gap-4 ${large ? 'text-lg' : ''}`}>
    <p className="font-semibold">{t('live.static.completedCount', { completed: results.completed ?? 0, started: results.total })}</p>
    <ol className="grid gap-4">{questions.map((question, number) => {
      const max = Math.max(1, question.answered)
      return <li key={question.id} className="grid gap-2 rounded-control border border-border p-3">
        <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{number + 1}. {question.title}</p>
          <span className="text-sm text-text-muted">{t('live.static.answeredBy', { count: question.answered })}{question.correct_percent !== null && ` · ${t('live.static.correctPercent', { percent: question.correct_percent })}`}</span></div>
        {question.options.length > 0 && <ul className="grid gap-2">{question.options.map((option) => <li key={option.id}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span>{option.label}{option.correct && ' ✓'}</span><span className="tabular-nums">{option.count}</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-brand-soft"><div className={`h-full rounded-full ${option.correct === false ? 'bg-text-muted' : 'bg-brand'}`} style={{ width: `${Math.round(option.count * 100 / max)}%` }} /></div>
        </li>)}</ul>}
      </li>
    })}</ol>
  </section>
}
