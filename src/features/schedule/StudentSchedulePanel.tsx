import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { useSchedule } from './schedule-api'
import { formatDate, formatRange, groupByModule } from './schedule-utils'

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function StudentSchedulePanel({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const query = useSchedule(offeringId)
  if (query.isPending) return <Skeleton className="h-24" />
  if (query.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('schedule.loadError')}</p>
        <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }
  const rows = query.data.filter((row) => row.session_date)
  if (rows.length === 0) return null
  const today = todayIso()
  const next = rows.find((row) => (row.session_date ?? '') >= today)
  return (
    <Card className="grid gap-3">
      <h2 className="text-xl font-bold">{t('schedule.studentTitle')}</h2>
      {groupByModule(rows).map((group) => (
        <div key={group.module} className="grid gap-1">
          <h3 className="font-semibold">{group.module}</h3>
          <ul className="grid gap-1 text-sm">
            {group.rows.map((row) => (
              <li key={row.lesson_id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
                <span>{row.lesson_title}</span>
                <span className="flex items-center gap-2">
                  {next?.lesson_id === row.lesson_id && <Badge>{t('schedule.next')}</Badge>}
                  <span className="font-semibold">
                    {formatDate(row.session_date ?? '')}
                    {formatRange(row.start_time, row.end_time)
                      ? ` · ${formatRange(row.start_time, row.end_time)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}
