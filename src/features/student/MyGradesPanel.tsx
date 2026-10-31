import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { gradeLabel } from './activities-utils'

type GradeRow = {
  grade_item_id: string
  title: string
  source_type: string
  weight: number
  score: number | null
  max_score: number | null
  hidden: boolean
  normalized: number | null
}
type Summary = { items: GradeRow[]; partial: number | null; final: number | null }

function useMyGrades(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: ['student-grades', enrollmentId],
    enabled: !!supabase && !!enrollmentId,
    queryFn: async (): Promise<Summary> => {
      if (!supabase) throw new Error('Supabase no está configurado')
      const { data, error } = await supabase.rpc('get_my_grades', {
        p_enrollment_id: enrollmentId!,
      })
      if (error) throw error
      return (data ?? { items: [], partial: null, final: null }) as unknown as Summary
    },
  })
}

export function MyGradesPanel({ enrollmentId }: { enrollmentId: string }) {
  const { t } = useTranslation()
  const q = useMyGrades(enrollmentId)
  if (q.isPending) return <Skeleton className="h-32" />
  if (q.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('activities.gradesError')}</p>
        <Button onClick={() => void q.refetch()}>{t('activities.retry')}</Button>
      </Card>
    )
  }
  const { items, partial, final } = q.data
  return (
    <Card className="grid gap-3">
      <h2 className="text-xl font-bold">{t('activities.myGrades')}</h2>
      {items.length === 0 ? (
        <p>{t('activities.noGradedItems')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-2">{t('activities.item')}</th>
                <th scope="col" className="p-2">{t('activities.weight')}</th>
                <th scope="col" className="p-2">{t('activities.score')}</th>
                <th scope="col" className="p-2">{t('activities.grade')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.grade_item_id} className="border-t border-border">
                  <th scope="row" className="p-2 font-normal">{i.title}</th>
                  <td className="p-2">{i.weight}</td>
                  <td className="p-2">
                    {i.hidden ? t('activities.hidden')
                      : i.score === null ? '—' : `${i.score} / ${i.max_score}`}
                  </td>
                  <td className="p-2">{i.hidden ? '—' : gradeLabel(i.normalized)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Badge status="info">{t('activities.partialGrade')}: {gradeLabel(partial)}</Badge>
        <Badge status={final === null ? 'neutral' : 'info'}>
          {t('activities.finalGrade')}: {gradeLabel(final)}
        </Badge>
      </div>
    </Card>
  )
}
