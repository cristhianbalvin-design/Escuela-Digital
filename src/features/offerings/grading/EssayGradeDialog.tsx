import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Skeleton } from '@/components/ui'
import { useAttemptForGrading, useGradeAttemptAnswer } from './grading-api'

export function EssayGradeDialog({
  offeringId, attemptId, onClose,
}: { offeringId: string; attemptId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const query = useAttemptForGrading(attemptId)
  const grade = useGradeAttemptAnswer(offeringId, attemptId)
  const [values, setValues] = useState<Record<string, { score: string; feedback: string }>>({})
  const [error, setError] = useState('')
  if (query.isPending) return <div role="dialog" aria-modal="true"
    aria-labelledby="essay-grade-title"><h2 id="essay-grade-title">{t('grading.essays')}</h2>
    <Skeleton className="h-40" /></div>
  if (query.isError) return <div role="dialog" aria-modal="true"
    aria-labelledby="essay-grade-title"><h2 id="essay-grade-title">{t('grading.essays')}</h2>
    <p role="alert">{query.error.message}</p><Button onClick={onClose}>{t('grading.cancel')}</Button></div>
  const essays = query.data.questions.filter((question) => question.type === 'essay')
  async function save(questionId: string, points: number) {
    setError('')
    const current = values[questionId]
    try {
      await grade.mutateAsync({
        questionId, score: Number(current?.score ?? 0), feedback: current?.feedback || null,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('grading.saveError'))
    }
    if (grade.isError) setError(grade.error.message)
    if (essays.every((item) => item.id === questionId || item.score !== null)) onClose()
    void points
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="essay-grade-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-3xl gap-4">
        <h2 id="essay-grade-title" className="text-xl font-bold">{t('grading.essays')}</h2>
        {essays.map((question) => {
          const answer = question.answer && typeof question.answer === 'object' &&
            !Array.isArray(question.answer) && 'text' in question.answer
            ? String(question.answer.text ?? '') : ''
          return <section key={question.id} className="grid gap-2 border-b pb-4">
            <h3>{question.prompt}</h3><p className="whitespace-pre-wrap">{answer}</p>
            <Input type="number" min={0} max={question.points} step="any"
              label={t('grading.scoreOf', { points: question.points })}
              value={values[question.id]?.score ?? String(question.score ?? '')}
              onChange={(event) => setValues((current) => ({
                ...current, [question.id]: { score: event.target.value,
                  feedback: current[question.id]?.feedback ?? question.feedback ?? '' },
              }))} />
            <label htmlFor={`essay-feedback-${question.id}`}>{t('grading.comment')}</label>
            <textarea id={`essay-feedback-${question.id}`} className="min-h-11 border p-2"
              value={values[question.id]?.feedback ?? question.feedback ?? ''}
              onChange={(event) => setValues((current) => ({
                ...current, [question.id]: { score: current[question.id]?.score ??
                  String(question.score ?? ''), feedback: event.target.value },
              }))} />
            <Button disabled={grade.isPending} onClick={() => void save(question.id, question.points)}>
              {t('grading.save')}
            </Button>
          </section>
        })}
        {error && <p role="alert">{error}</p>}
        {essays.length === 0 && <p>{t('grading.noEssays')}</p>}
        <Button variant="secondary" onClick={onClose}>{t('grading.close')}</Button>
      </Card>
    </div>
  )
}
