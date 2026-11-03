import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Skeleton, useToast } from '@/components/ui'
import { downloadCsv, formatGrade, gradebookToCsv } from './grading-utils'
import { useFinalizeGrades, useGradebook } from './grading-api'
import type { GradeItem, GradebookStudent } from './grading-api'
import { SetManualGradeDialog } from './SetManualGradeDialog'
import { shownEmail } from '@/lib/placeholder-email'

export function GradebookPanel({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const notify = useToast()
  const query = useGradebook(offeringId)
  const finalize = useFinalizeGrades(offeringId)
  const [selection, setSelection] = useState<{ item: GradeItem; student: GradebookStudent } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  async function closeGrades() {
    setError('')
    try {
      const count = await finalize.mutateAsync()
      notify(t('grading.finalized', { count }))
      setConfirm(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('grading.saveError'))
    }
  }
  if (query.isPending) return <Skeleton className="h-48" />
  if (query.isError) return <Card><p role="alert">{query.error.message}</p>
    <Button onClick={() => void query.refetch()}>{t('retry')}</Button></Card>
  const { items, students, mode } = query.data
  const totalWeight = items.reduce((sum, item) => sum + (item.weight > 0 ? item.weight : 0), 0)
  const weightPercent = (weight: number, total: number) =>
    weight > 0 && total > 0 ? Math.round((weight / total) * 100) : 0
  const weightsOff = mode === 'dimensions' && Math.abs(totalWeight - 100) > 0.005
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => downloadCsv('libro-de-notas.csv',
          gradebookToCsv(items, students))}>{t('grading.exportCsv')}</Button>
        <Button onClick={() => setConfirm(true)}>{t('grading.finalize')}</Button>
      </div>
      {weightsOff && <p role="alert" className="font-semibold text-amber-700">
        {t('dimensions.gradebookWeights', { value: Math.round(totalWeight * 100) / 100 })}</p>}
      {mode === 'dimensions' && <p className="text-sm text-text-muted">{t('dimensions.gradebookHint')}</p>}
      {items.length === 0 || students.length === 0 ? <EmptyState title={t('grading.emptyGradebook')} description="" /> :
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <caption className="sr-only">{t('grading.gradebook')}</caption>
            <thead><tr><th scope="col">{t('grading.student')}</th><th scope="col">{t('grading.email')}</th>
              {items.map((item) => <th scope="col" key={item.id}>{item.title} ({weightPercent(item.weight, totalWeight)}%)</th>)}
              <th scope="col">{t('grading.partial')}</th><th scope="col">{t('grading.finalGrade')}</th>
            </tr></thead>
            <tbody>{students.map((student) => <tr key={student.enrollment_id}>
              <th scope="row">{student.full_name || student.email}</th><td>{shownEmail(student.email)}</td>
              {items.map((item) => {
                const grade = student.grades[item.id]
                if (item.source_type === 'attendance') {
                  return <td key={item.id}
                    title={t('dimensions.attendanceAuto')}>
                    {formatGrade(grade ? (grade.score / grade.max_score) * 20 : null)}
                    <span className="ml-1 text-xs text-text-muted">{t('dimensions.auto')}</span>
                  </td>
                }
                return <td key={item.id}>
                  <Button variant="ghost" aria-label={t('grading.editCell', {
                    student: student.full_name || student.email, item: item.title,
                  })} onClick={() => setSelection({ item, student })}>
                    {formatGrade(grade ? (grade.score / grade.max_score) * 20 : null)}
                  </Button>
                  {grade?.adjusted && <span title={grade.adjusted_reason ?? ''}
                    className="ml-1 text-amber-700">{t('grading.adjusted')}</span>}
                </td>
              })}
              <td>{formatGrade(student.summary.partial)}</td><td>{formatGrade(student.summary.final)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      {selection && <SetManualGradeDialog offeringId={offeringId} item={selection.item}
        student={selection.student} onClose={() => setSelection(null)} />}
      {confirm && <div role="dialog" aria-modal="true" aria-labelledby="finalize-title"
        className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
        <Card className="grid max-w-lg gap-3">
          <h2 id="finalize-title" className="text-xl font-bold">{t('grading.confirmFinalize')}</h2>
          <p>{t('grading.confirmFinalizeDescription')}</p>
          {error && <p role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={finalize.isPending} onClick={() => void closeGrades()}>
              {t('grading.finalize')}
            </Button>
            <Button variant="secondary" disabled={finalize.isPending}
              onClick={() => setConfirm(false)}>{t('grading.cancel')}</Button>
          </div>
        </Card>
      </div>}
    </div>
  )
}
