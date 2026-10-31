import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Skeleton } from '@/components/ui'
import { useGradeSubmission, useSubmissionForGrading, getSubmissionFileUrl } from './grading-api'
import type { RubricScoreInput } from './grading-api'
import { penalizedScore, rubricTotal } from './grading-utils'
import { displayFileName } from '@/features/student/activities-utils'

type Selection = { levelId: string; comment: string }
export function SubmissionGradeDialog({
  offeringId, submissionId, onClose,
}: { offeringId: string; submissionId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const query = useSubmissionForGrading(submissionId)
  const grade = useGradeSubmission(offeringId)
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [rawScore, setRawScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  if (query.isPending) return <div role="dialog" aria-modal="true"
    aria-labelledby="submission-grade-title"><h2 id="submission-grade-title">{t('grading.grade')}</h2>
    <Skeleton className="h-40" /></div>
  if (query.isError) return <div role="dialog" aria-modal="true"
    aria-labelledby="submission-grade-title"><h2 id="submission-grade-title">{t('grading.grade')}</h2>
    <p role="alert">{query.error.message}</p><Button onClick={onClose}>{t('grading.cancel')}</Button></div>
  const { submission, assignment, criteria } = query.data
  const total = rubricTotal(criteria, selections)
  const lateScore = submission.is_late
    ? penalizedScore(total, assignment.max_score, assignment.late_penalty_pct, true) : total
  const files = Array.isArray(submission.files) ? submission.files.flatMap((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) return []
    return typeof file.path === 'string' && typeof file.name === 'string'
      ? [{ path: file.path, name: file.name }] : []
  }) : []
  async function openFile(path: string) {
    setFileError('')
    try { window.open(await getSubmissionFileUrl(path), '_blank', 'noopener,noreferrer') }
    catch (cause) { setFileError(cause instanceof Error ? cause.message : t('grading.saveError')) }
  }
  async function save() {
    setError('')
    const scores: RubricScoreInput[] = criteria.map((criterion) => ({
      criterion_id: criterion.id,
      level_id: selections[criterion.id]?.levelId ?? '',
      comment: selections[criterion.id]?.comment ?? '',
    }))
    if (criteria.length && scores.some((item) => !item.level_id)) {
      setError(t('grading.selectAllLevels'))
      return
    }
    try {
      await grade.mutateAsync({
        submissionId, scores: criteria.length ? scores : null, feedback: feedback || null,
        rawScore: criteria.length ? null : Number(rawScore),
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('grading.saveError'))
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="submission-grade-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-3xl gap-4">
        <h2 id="submission-grade-title" className="text-xl font-bold">{assignment.title}</h2>
        <p>{assignment.instructions}</p>
        {submission.text && <section><h3 className="font-semibold">{t('grading.answer')}</h3>
          <p className="whitespace-pre-wrap">{submission.text}</p></section>}
        {submission.link && <a href={submission.link} target="_blank" rel="noopener noreferrer"
          className="min-h-11 text-brand underline">{submission.link}</a>}
        {files.length > 0 && <section><h3>{t('grading.files')}</h3>
          <ul>{files.map((file) => <li key={file.path}>
            <Button variant="secondary" onClick={() => void openFile(file.path)}>{displayFileName(file.name)}</Button>
          </li>)}</ul></section>}
        {fileError && <p role="alert">{fileError}</p>}
        {submission.is_late && <p role="status">{t('grading.latePenalty', {
          pct: assignment.late_penalty_pct,
          score: lateScore.toFixed(2),
        })}</p>}
        {criteria.length ? <div className="overflow-x-auto">
          <table className="w-full text-left"><thead><tr><th>{t('grading.criterion')}</th>
            <th>{t('grading.level')}</th><th>{t('grading.comment')}</th></tr></thead>
            <tbody>{criteria.map((criterion) => <tr key={criterion.id}>
              <th scope="row">{criterion.title}</th>
              <td><fieldset><legend className="sr-only">{criterion.title}</legend>
                {criterion.levels.map((level) => <label key={level.id} className="flex min-h-11 gap-2">
                  <input type="radio" name={`level-${criterion.id}`} value={level.id}
                    checked={selections[criterion.id]?.levelId === level.id}
                    onChange={() => setSelections((current) => ({
                      ...current, [criterion.id]: {
                        levelId: level.id, comment: current[criterion.id]?.comment ?? '',
                      },
                    }))} />
                  {level.label} ({level.points}) — {level.descriptor}
                </label>)}</fieldset></td>
              <td><label className="sr-only" htmlFor={`comment-${criterion.id}`}>
                {t('grading.comment')} {criterion.title}</label>
                <textarea id={`comment-${criterion.id}`} className="min-h-11 border p-2"
                  value={selections[criterion.id]?.comment ?? ''}
                  onChange={(event) => setSelections((current) => ({
                    ...current, [criterion.id]: {
                      levelId: current[criterion.id]?.levelId ?? '', comment: event.target.value,
                    },
                  }))} /></td>
            </tr>)}</tbody></table>
          <p role="status">{t('grading.rubricTotal', { score: total.toFixed(2),
            max: assignment.max_score })}</p>
        </div> : <Input id="raw-score" type="number" label={t('grading.rawScore')}
          min={0} max={assignment.max_score} step="any" value={rawScore}
          onChange={(event) => setRawScore(event.target.value)} />}
        <label htmlFor="general-feedback" className="font-semibold">{t('grading.generalFeedback')}</label>
        <textarea id="general-feedback" className="min-h-20 border p-2" value={feedback}
          onChange={(event) => setFeedback(event.target.value)} />
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={grade.isPending} onClick={() => void save()}>
            {grade.isPending ? t('grading.saving') : t('grading.save')}
          </Button>
          <Button variant="secondary" disabled={grade.isPending} onClick={onClose}>
            {t('grading.cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
