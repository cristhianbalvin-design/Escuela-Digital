import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { useMySchedule } from './global-api'
import {
  addMonths, agendaOfferings, formatDayLong, formatMonth, formatTimeRange, groupByDay,
  monthOfToday, monthRange, todayLima,
} from './global-utils'

export function GlobalCalendarPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const tenantId = useTenantAccess().active?.tenant_id
  const [month, setMonth] = useState(() => monthOfToday())
  const [offeringId, setOfferingId] = useState('')
  const range = monthRange(month)
  const query = useMySchedule(tenantId, range.from, range.to)
  const today = todayLima()
  const days = groupByDay(query.data ?? [], offeringId || null)
  const offerings = agendaOfferings(query.data ?? [])

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-bold">{t('globalViews.calendar.title')}</h1>
      <p className="text-text-muted">{t('globalViews.calendar.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label={t('globalViews.calendar.previous')}
          onClick={() => setMonth(addMonths(month, -1))}>‹</Button>
        <span className="min-w-40 text-center font-semibold" aria-live="polite">
          {formatMonth(month)}
        </span>
        <Button variant="secondary" aria-label={t('globalViews.calendar.next')}
          onClick={() => setMonth(addMonths(month, 1))}>›</Button>
        <Button variant="secondary" onClick={() => setMonth(monthOfToday())}>
          {t('globalViews.calendar.today')}
        </Button>
        {offerings.length > 1 && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-text-muted">{t('globalViews.calendar.edition')}</span>
            <select value={offeringId} onChange={(event) => setOfferingId(event.target.value)}
              className="min-h-11 rounded-control border border-border bg-transparent px-2">
              <option value="">{t('globalViews.calendar.allEditions')}</option>
              {offerings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        )}
      </div>

      {query.isPending ? <Skeleton className="h-48" /> :
        query.isError ? (
          <Card className="grid gap-3">
            <p role="alert">{t('globalViews.loadError')}</p>
            <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          </Card>
        ) : days.length === 0 ? (
          <EmptyState title={t('globalViews.calendar.empty')}
            description={t('globalViews.calendar.emptyHint')} />
        ) : (
          <ol className="grid gap-3">
            {days.map((day) => (
              <li key={day.date}>
                <Card className="grid gap-3">
                  <h2 className="flex flex-wrap items-center gap-2 font-bold">
                    {formatDayLong(day.date)}
                    {day.date === today && <Badge status="success">{t('globalViews.calendar.todayBadge')}</Badge>}
                  </h2>
                  <ul className="grid gap-2">
                    {day.items.map((item) => (
                      <li key={`${item.offering_id}-${item.module_title}-${item.lesson_title}`}
                        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-control border border-border px-3 py-2">
                        <span className="w-32 shrink-0 font-semibold">
                          {formatTimeRange(item.start_time, item.end_time) || t('globalViews.calendar.noTime')}
                        </span>
                        <span className="min-w-0 flex-1 basis-56">
                          <span className="block break-words">{item.module_title} · {item.lesson_title}</span>
                          <Link to={{ pathname: `/docente/ediciones/${item.offering_id}`, search }}
                            className="text-sm text-brand underline">
                            {item.offering_title}
                          </Link>
                          <span className="text-sm text-text-muted"> · {item.client_name}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ol>
        )}
    </section>
  )
}
