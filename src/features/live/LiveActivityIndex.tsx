import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useLessonPlan } from '@/features/planning/planning-api'
import { useLiveActivities } from './live-teacher-api'

/** Índice por registro de la guía; la edición se abre en una pestaña propia. */
export function LiveActivityIndex({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation()
  const plan = useLessonPlan(lessonId)
  const activities = useLiveActivities(lessonId)
  const rows = plan.data?.items ?? []
  const count = (id: string | null) => activities.data?.filter((item) => item.plan_item_id === id).length ?? 0
  const open = (id: string | null) => {
    window.open(`/actividades/${lessonId}${id ? `?item=${id}` : '?item=none'}`, 'senda-live-editor')
  }
  return <section className="grid gap-3 rounded-control border border-border bg-surface-elevated p-3">
    <h4 className="font-semibold">{t('live.editorTitle')}</h4>
    <p className="text-sm text-text-muted">{t('live.indexHint')}</p>
    {plan.isPending || activities.isPending ? <p role="status">{t('live.loading')}</p> : <>
      {rows.length === 0 && <p className="text-sm text-text-muted">{t('live.indexEmpty')}</p>}
      <ul className="grid gap-2">
        {rows.map((row, index) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3">
          <span className="min-w-0"><span className="font-medium">{index + 1}. {row.title}</span>
            <span className="block text-sm text-text-muted">{count(row.id) > 0 ? t('live.activityCount', { count: count(row.id) }) : t('live.noActivities')}</span></span>
          <Button variant="secondary" onClick={() => open(row.id)}>{t('live.configure')}</Button>
        </li>)}
        {count(null) > 0 && <li className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3">
          <span className="min-w-0"><span className="font-medium">{t('live.unlinked')}</span>
            <span className="block text-sm text-text-muted">{t('live.activityCount', { count: count(null) })}</span></span>
          <Button variant="secondary" onClick={() => open(null)}>{t('live.configure')}</Button>
        </li>}
      </ul>
    </>}
  </section>
}
