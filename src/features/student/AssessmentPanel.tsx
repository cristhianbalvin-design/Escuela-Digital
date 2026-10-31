import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card } from '@/components/ui'
import type { Json } from '@/lib/supabase/database.types'
import {
  useAssessmentInfo,
  useAttemptResult,
  useSaveAttemptAnswer,
  useStartAttempt,
  useStudentAttempt,
  useSubmitAttempt,
  type AttemptQuestion,
} from './activities-api'
import {
  buildAnswer,
  formatCountdown,
  isAnswered,
  remainingSeconds,
} from './activities-utils'

class Debouncer {
  private timers = new Map<string, number>()
  schedule(key: string, ms: number, fn: () => void) {
    this.cancel(key)
    this.timers.set(key, window.setTimeout(() => {
      this.timers.delete(key)
      fn()
    }, ms))
  }
  cancel(key: string) {
    const t = this.timers.get(key)
    if (t !== undefined) window.clearTimeout(t)
    this.timers.delete(key)
  }
  keys(): string[] { return [...this.timers.keys()] }
  clear() { this.keys().forEach((k) => this.cancel(k)) }
}

export type AssessmentPanelProps = {
  enrollmentId: string
  assessmentId: string
}

type AnswerValue = string | boolean | string[]

function readValue(question: AttemptQuestion, answer: Json | null): AnswerValue {
  const empty: AnswerValue = question.type === 'multiple' ? []
    : question.type === 'true_false' ? '' : ''
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return empty
  if (question.type === 'single') {
    return typeof answer.option_id === 'string' ? answer.option_id : ''
  }
  if (question.type === 'multiple') {
    return Array.isArray(answer.option_ids)
      ? answer.option_ids.filter((x): x is string => typeof x === 'string') : []
  }
  if (question.type === 'true_false') {
    return typeof answer.value === 'boolean' ? answer.value : ''
  }
  return typeof answer.text === 'string' ? answer.text : ''
}

export function AssessmentPanel({ enrollmentId, assessmentId }: AssessmentPanelProps) {
  const { t } = useTranslation()
  const info = useAssessmentInfo(enrollmentId, assessmentId)
  const attemptId = info.data?.in_progress_attempt_id ?? undefined
  const attemptQuery = useStudentAttempt(attemptId)
  const lastDone = info.data?.attempts
    .filter((a) => a.status !== 'in_progress').at(-1)?.id
  const result = useAttemptResult(attemptId ? undefined : lastDone)
  const start = useStartAttempt(enrollmentId, assessmentId)
  const save = useSaveAttemptAnswer(attemptId)
  const submit = useSubmitAttempt(attemptId)
  const saveMutate = save.mutateAsync
  const submitMutate = submit.mutateAsync

  const [answers, setAnswers] = useState<Record<string, Json | null>>({})
  const [index, setIndex] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [saving, setSaving] = useState(0)
  const [savedOnce, setSavedOnce] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [timers] = useState(() => new Debouncer())
  const autoSubmitted = useRef<string | null>(null)

  const attempt = attemptQuery.data
  const questions = useMemo(() => attempt?.questions ?? [], [attempt])
  const current = questions[index]
  const secondsLeft = attempt?.deadline_at && attempt.server_now
    ? remainingSeconds(
      attempt.deadline_at, attempt.server_now, attemptQuery.dataUpdatedAt, nowMs,
    )
    : null

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => {
      window.clearInterval(id)
      timers.clear()
    }
  }, [timers])

  useEffect(() => {
    if (secondsLeft !== 0 || !attemptId || autoSubmitted.current === attemptId) return
    autoSubmitted.current = attemptId
    void submitMutate().catch(() => setSubmitError(true))
  }, [secondsLeft, attemptId, submitMutate])

  function answerOf(question: AttemptQuestion): Json | null {
    return question.id in answers ? (answers[question.id] ?? null) : question.answer
  }

  function change(question: AttemptQuestion, value: AnswerValue) {
    const next = buildAnswer(question.type, value)
    setAnswers((prev) => ({ ...prev, [question.id]: next }))
    timers.schedule(question.id, 600, () => {
      setSaving((n) => n + 1)
      saveMutate({ questionId: question.id, answer: next })
        .then(() => { setSavedOnce(true); setSaveError(false) })
        .catch(() => setSaveError(true))
        .finally(() => setSaving((n) => Math.max(0, n - 1)))
    })
  }

  const unanswered = questions.filter(
    (q) => !isAnswered(q.type, answerOf(q)),
  )

  async function doSubmit() {
    setSubmitError(false)
    // Guarda de inmediato lo pendiente antes de enviar.
    const pendingKeys = timers.keys()
    timers.clear()
    await Promise.all(pendingKeys.map(async (qid) => {
      if (qid in answers) {
        await saveMutate({ questionId: qid, answer: answers[qid] ?? null }).catch(() => undefined)
      }
    }))
    try {
      await submitMutate()
      setConfirming(false)
    } catch {
      setSubmitError(true)
    }
  }

  if (info.isPending) {
    return <Card aria-busy="true">{t('activities.loading')}</Card>
  }
  if (info.isError || !info.data) {
    return (
      <Card role="alert">
        <p>{t('activities.loadError')}</p>
        <Button className="mt-3" onClick={() => void info.refetch()}>
          {t('activities.retry')}
        </Button>
      </Card>
    )
  }
  const data = info.data

  if (attemptId && attemptQuery.isPending) {
    return <Card aria-busy="true">{t('activities.loading')}</Card>
  }

  if (attemptId && attempt?.status === 'in_progress') {
    return (
      <Card>
        <h2 className="text-xl font-bold">{attempt.title || data.title}</h2>
        {attempt.instructions && <p className="mt-2">{attempt.instructions}</p>}
        {secondsLeft !== null && (
          <div className="my-4" role="timer">
            <span className="font-semibold">
              {t('activities.timeRemaining')}: {formatCountdown(secondsLeft)}
            </span>
            {secondsLeft > 0 && secondsLeft < 300 && (
              <p role="alert" className="text-error">
                {t('activities.lessThanFiveMinutes')}
              </p>
            )}
          </div>
        )}
        <nav aria-label={t('activities.questionNavigation')}
          className="my-4 flex flex-wrap gap-2">
          {questions.map((q, i) => (
            <Button key={q.id} variant={i === index ? 'primary' : 'secondary'}
              aria-current={i === index ? 'step' : undefined}
              aria-label={t('activities.questionNumber', { number: i + 1 })}
              onClick={() => setIndex(i)}>
              {i + 1}
            </Button>
          ))}
        </nav>

        {current && (
          <fieldset className="space-y-3">
            <legend className="text-lg font-semibold">
              {t('activities.questionOf', { current: index + 1, total: questions.length })}
              : {current.prompt}
            </legend>
            <p className="text-sm text-text-muted">
              {t('activities.points', { count: current.points })}
            </p>
            {current.type === 'single' && (current.options ?? []).map((o) => (
              <label key={o.id} className="flex min-h-11 items-center gap-2">
                <input type="radio" name={`q-${current.id}`} value={o.id}
                  checked={readValue(current, answerOf(current)) === o.id}
                  onChange={() => change(current, o.id)} />
                {o.label}
              </label>
            ))}
            {current.type === 'multiple' && (current.options ?? []).map((o) => {
              const sel = readValue(current, answerOf(current))
              const list = Array.isArray(sel) ? sel : []
              return (
                <label key={o.id} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" value={o.id} checked={list.includes(o.id)}
                    onChange={(e) => change(current, e.target.checked
                      ? [...list, o.id] : list.filter((x) => x !== o.id))} />
                  {o.label}
                </label>
              )
            })}
            {current.type === 'true_false' && [true, false].map((v) => (
              <label key={String(v)} className="flex min-h-11 items-center gap-2">
                <input type="radio" name={`q-${current.id}`}
                  checked={readValue(current, answerOf(current)) === v}
                  onChange={() => change(current, v)} />
                {t(v ? 'activities.true' : 'activities.false')}
              </label>
            ))}
            {(current.type === 'short' || current.type === 'essay') && (
              <textarea
                className="min-h-28 w-full rounded-control border border-border bg-surface p-3"
                aria-label={t('activities.answer')}
                maxLength={current.type === 'short' ? 500 : 20000}
                value={String(readValue(current, answerOf(current)))}
                onChange={(e) => change(current, e.target.value)} />
            )}
          </fieldset>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            {t('activities.previous')}
          </Button>
          <Button variant="secondary" disabled={index >= questions.length - 1}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
            {t('activities.next')}
          </Button>
          <span role="status" aria-live="polite" className="text-sm">
            {saveError ? t('activities.saveError')
              : saving > 0 ? t('activities.saving')
                : savedOnce ? t('activities.saved') : ''}
          </span>
          <Button className="ml-auto" onClick={() => setConfirming(true)}>
            {t('activities.submit')}
          </Button>
        </div>

        {confirming && (
          <section role="dialog" aria-modal="true" aria-labelledby="submit-title"
            className="mt-5 rounded-control border border-border p-4">
            <h3 id="submit-title" className="font-bold">
              {t('activities.confirmSubmitTitle')}
            </h3>
            <p>{t('activities.confirmSubmitDescription')}</p>
            {unanswered.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold">{t('activities.unansweredQuestions')}</p>
                <ul className="list-inside list-disc">
                  {unanswered.map((q) => (
                    <li key={q.id}>
                      {t('activities.questionNumber', {
                        number: questions.findIndex((x) => x.id === q.id) + 1,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {submitError && (
              <p role="alert" className="mt-2 text-error">{t('activities.submitError')}</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void doSubmit()} disabled={submit.isPending}>
                {t('activities.confirmSubmit')}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t('activities.cancel')}
              </Button>
            </div>
          </section>
        )}
      </Card>
    )
  }

  const res = result.data
  if (lastDone && res) {
    return (
      <Card>
        <h2 className="text-xl font-bold">{data.title}</h2>
        {!res.results_visible ? (
          <p className="mt-3">{t('activities.resultsNotVisible')}</p>
        ) : res.pending_review ? (
          <p className="mt-3">{t('activities.pendingReview')}</p>
        ) : (
          <>
            {typeof res.score === 'number' && typeof res.max_score === 'number' && (
              <p className="mt-3 text-lg font-semibold">
                {t('activities.score')}: {res.score} / {res.max_score}
              </p>
            )}
            {typeof res.passed === 'boolean' && (
              <Badge status={res.passed ? 'success' : 'error'}>
                {t(res.passed ? 'activities.passed' : 'activities.notPassed')}
              </Badge>
            )}
            {(res.questions ?? []).map((q, i) => (
              <section key={q.id} className="mt-5 border-t border-border pt-4">
                <h3 className="font-semibold">
                  {t('activities.questionNumber', { number: i + 1 })}: {q.prompt}
                </h3>
                {typeof q.score === 'number' && (
                  <p>{t('activities.score')}: {q.score} / {q.points}</p>
                )}
                {q.feedback && <p>{t('activities.feedback')}: {q.feedback}</p>}
                {q.correct !== null && q.correct !== undefined && (
                  <p>{t('activities.correctAnswer')}: {JSON.stringify(q.correct)}</p>
                )}
              </section>
            ))}
          </>
        )}
        {data.can_start && (
          <Button className="mt-4" onClick={() => void start.mutateAsync()}
            disabled={start.isPending}>
            {t('activities.retryAttempt')}
          </Button>
        )}
        {!data.can_start && data.reason && (
          <p role="status" className="mt-3">{t(`activities.reasons.${data.reason}`)}</p>
        )}
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-xl font-bold">{data.title}</h2>
      {data.instructions && <p className="mt-2">{data.instructions}</p>}
      <dl className="my-4 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-sm text-text-muted">{t('activities.questions')}</dt>
          <dd>{data.question_count}</dd></div>
        <div><dt className="text-sm text-text-muted">{t('activities.totalPoints')}</dt>
          <dd>{data.total_points}</dd></div>
        {data.time_limit_minutes !== null && (
          <div><dt className="text-sm text-text-muted">{t('activities.timeLimit')}</dt>
            <dd>{data.time_limit_minutes} {t('activities.minutes')}</dd></div>
        )}
        {data.max_attempts !== null && (
          <div><dt className="text-sm text-text-muted">{t('activities.maxAttempts')}</dt>
            <dd>{data.max_attempts}</dd></div>
        )}
      </dl>
      {!data.can_start && data.reason && (
        <p role="status" className="mt-3">{t(`activities.reasons.${data.reason}`)}</p>
      )}
      {start.isError && (
        <p role="alert" className="mt-3 text-error">{t('activities.startError')}</p>
      )}
      {data.can_start && (
        <Button className="mt-4" onClick={() => void start.mutateAsync()}
          disabled={start.isPending}>
          {t('activities.start')}
        </Button>
      )}
    </Card>
  )
}
