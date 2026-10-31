import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from '@/components/ui'
import type { GradeItem, GradebookStudent } from './grading-api'
import { useSetManualGrade } from './grading-api'

export function SetManualGradeDialog({
  offeringId, item, student, onClose,
}: { offeringId: string; item: GradeItem; student: GradebookStudent; onClose: () => void }) {
  const { t } = useTranslation()
  const mutation = useSetManualGrade(offeringId)
  const existing = student.grades[item.id]
  const [score, setScore] = useState(String(existing?.score ?? ''))
  const [comment, setComment] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  async function save() {
    setError('')
    const value = Number(score)
    if (!Number.isFinite(value) || value < 0 || value > item.max_score) {
      setError(t('grading.invalidScore'))
      return
    }
    try {
      await mutation.mutateAsync({
        enrollmentId: student.enrollment_id, gradeItemId: item.id, score: value,
        comment: comment || null, reason: item.source_type === 'manual' ? null : reason || null,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('grading.saveError'))
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="manual-grade-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-lg gap-3">
        <h2 id="manual-grade-title" className="text-xl font-bold">
          {t('grading.editGrade', { student: student.full_name || student.email, item: item.title })}
        </h2>
        <Input id="manual-score" type="number" min={0} max={item.max_score} step="any"
          label={t('grading.rawScore')} value={score} onChange={(event) => setScore(event.target.value)} />
        <label htmlFor="manual-comment">{t('grading.comment')}</label>
        <textarea id="manual-comment" className="min-h-11 border p-2" value={comment}
          onChange={(event) => setComment(event.target.value)} />
        {item.source_type !== 'manual' && <Input id="manual-reason" label={t('grading.reason')}
          value={reason} onChange={(event) => setReason(event.target.value)} />}
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={mutation.isPending} onClick={() => void save()}>{t('grading.save')}</Button>
          <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>
            {t('grading.cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
