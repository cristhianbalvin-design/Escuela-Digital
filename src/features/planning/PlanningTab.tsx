import { useTranslation } from 'react-i18next'
import { formatDate, formatRange } from '@/features/schedule/schedule-utils'
import { usePlanProgress } from './planning-api'
import { SessionPlanView } from './Planning'

export function PlanningTab({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation(); const summaries = usePlanProgress(offeringId)
  if (summaries.isPending) return <p>{t('planning.loading')}</p>
  if (summaries.isError) return <p role="alert">{t('planning.error')}</p>
  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const rows = [...(summaries.data ?? [])].sort((a, b) => Number(b.session_date === today) - Number(a.session_date === today))
  return <div className="grid gap-4">{rows.map((row) => { return <details key={row.lesson_id} className="rounded-control border border-border p-4" open={row.session_date === today || undefined}><summary className="cursor-pointer font-semibold">{row.module_title} · {row.lesson_title} · {row.session_date ? formatDate(row.session_date) : t('planning.unscheduled')} {formatRange(row.start_time, row.end_time)} · {row.done}/{row.total}</summary><div className="pt-3"><SessionPlanView offeringId={offeringId} lessonId={row.lesson_id} start={row.start_time} end={row.end_time} /></div></details> })}</div>
}
