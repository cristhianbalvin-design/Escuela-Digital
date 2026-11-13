import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useLiveActivities } from './live-teacher-api'

/** Entrada al guion de la sesión, que se prepara en una pestaña propia. */
export function LiveActivityIndex({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation()
  const activities = useLiveActivities(lessonId)
  const count = activities.data?.length ?? 0
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface-elevated p-3">
    <div className="min-w-0">
      <h4 className="font-semibold">{t('live.editorTitle')}</h4>
      <p className="text-sm text-text-muted">{count > 0 ? t('live.activityCount', { count }) : t('live.indexHint')}</p>
    </div>
    <Button onClick={() => { window.open(`/sesion/${lessonId}`, 'senda-session-prepare') }}>{t('live.prepareSession')}</Button>
  </section>
}
