import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Progress, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { useMyAnalytics } from './global-api'
import { formatPercent, summarize } from './global-utils'

export function GlobalAnalyticsPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useMyAnalytics(tenantId)

  if (query.isPending) return <Skeleton className="h-48" />
  if (query.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('globalViews.loadError')}</p>
        <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </Card>
    )
  }
  const rows = query.data
  const summary = summarize(rows)
  const tiles = [
    { label: t('globalViews.analytics.activeEditions'), value: String(summary.activeEditions) },
    { label: t('globalViews.analytics.students'), value: String(summary.students) },
    { label: t('globalViews.analytics.completed'), value: String(summary.completed) },
    { label: t('globalViews.analytics.attendance'), value: formatPercent(summary.attendancePct) },
  ]

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-bold">{t('globalViews.analytics.title')}</h1>
      <p className="text-text-muted">{t('globalViews.analytics.hint')}</p>
      {rows.length === 0 ? (
        <EmptyState title={t('globalViews.analytics.empty')} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((tile) => (
              <Card key={tile.label} className="grid gap-1">
                <dt className="text-sm text-text-muted">{tile.label}</dt>
                <dd className="text-2xl font-bold">{tile.value}</dd>
              </Card>
            ))}
          </dl>
          <ul className="grid gap-3">
            {rows.map((row) => (
              <li key={row.offering_id}>
                <Card className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={{ pathname: `/docente/ediciones/${row.offering_id}`, search }}
                      className="font-semibold text-brand underline">
                      {row.title}
                    </Link>
                    <span className="text-sm text-text-muted">· {row.client_name}</span>
                    <Badge>{t(`teacherOfferings.status.${row.status}`)}</Badge>
                  </div>
                  <p className="text-sm text-text-muted">
                    {t('globalViews.analytics.line', {
                      enrolled: row.enrolled, completed: row.completed, dropped: row.dropped,
                    })}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Progress value={row.avg_progress ?? 0}
                      label={t('globalViews.analytics.progress')} />
                    {row.attendance_pct === null ? (
                      <p className="self-end text-sm text-text-muted">
                        {t('globalViews.analytics.noAttendance')}
                      </p>
                    ) : (
                      <Progress value={row.attendance_pct}
                        label={t('globalViews.analytics.attendanceOf', { count: row.closed_sessions })} />
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
