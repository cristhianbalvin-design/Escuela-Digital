import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useGradingQueue } from './grading-api'
import { EssayGradeDialog } from './EssayGradeDialog'
import { SubmissionGradeDialog } from './SubmissionGradeDialog'

export function GradingQueue({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const queue = useGradingQueue(offeringId)
  const [filter, setFilter] = useState<'all' | 'pending'>('all')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  if (queue.isPending) return <Skeleton className="h-40" />
  if (queue.isError) return <Card><p role="alert">{queue.error.message}</p>
    <Button onClick={() => void queue.refetch()}>{t('retry')}</Button></Card>
  const submissions = queue.data.submissions.filter((item) =>
    filter === 'all' || item.status === 'submitted')
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" aria-label={t('grading.queueFilters')}>
        <Button variant={filter === 'all' ? 'primary' : 'secondary'}
          aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          {t('grading.all')}
        </Button>
        <Button variant={filter === 'pending' ? 'primary' : 'secondary'}
          aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>
          {t('grading.pending')}
        </Button>
      </div>
      <Card className="grid gap-3">
        <h3 className="font-semibold">{t('grading.submissions')}</h3>
        {submissions.length === 0 ? <EmptyState title={t('grading.noSubmissions')} description="" /> :
          <ul className="grid gap-2">{submissions.map((item) => (
            <li key={item.submission_id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{item.assignment_title} · {item.student_name ?? item.student_email}</span>
              <Button onClick={() => setSubmissionId(item.submission_id)}>{t('grading.grade')}</Button>
            </li>
          ))}</ul>}
      </Card>
      <Card className="grid gap-3">
        <h3 className="font-semibold">{t('grading.essays')}</h3>
        {queue.data.attempts.length === 0 ? <EmptyState title={t('grading.noEssays')} description="" /> :
          <ul className="grid gap-2">{queue.data.attempts.map((item) => (
            <li key={item.attempt_id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{item.assessment_title} · {item.student_name ?? item.student_email}</span>
              <Button onClick={() => setAttemptId(item.attempt_id)}>{t('grading.grade')}</Button>
            </li>
          ))}</ul>}
      </Card>
      {submissionId && <SubmissionGradeDialog offeringId={offeringId}
        submissionId={submissionId} onClose={() => setSubmissionId(null)} />}
      {attemptId && <EssayGradeDialog offeringId={offeringId} attemptId={attemptId}
        onClose={() => setAttemptId(null)} />}
    </div>
  )
}
