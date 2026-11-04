import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Card } from '@/components/ui'
import {
  formatDayLong, formatDayShort, formatTimeRange, type AgendaRow, type WeekLayout,
} from './global-utils'

const HOUR_PX = 56
const TONES = [
  'bg-info-soft text-sky-900',
  'bg-success-soft text-green-900',
  'bg-warning-soft text-amber-900',
  'bg-brand-soft text-text',
]

function minutesLabel(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

type Props = {
  layout: WeekLayout
  today: string
  /** Orden estable de las ediciones para asignar un color a cada una. */
  offeringIds: string[]
}

export function WeekCalendar({ layout, today, offeringIds }: Props) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const hours = Array.from({ length: layout.endHour - layout.startHour }, (_, index) => layout.startHour + index)
  const height = hours.length * HOUR_PX
  const toneOf = (id: string) => TONES[Math.max(0, offeringIds.indexOf(id)) % TONES.length]!
  const link = (row: AgendaRow) => ({ pathname: `/docente/ediciones/${row.offering_id}`, search })
  const busyDays = layout.days.filter((day) => day.blocks.length + day.untimed.length > 0)

  return (
    <>
      {/* Cuadrícula semanal (pantallas medianas y grandes) */}
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[44rem]" role="grid" aria-label={t('globalViews.calendar.weekGrid')}>
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border" role="row">
            <div role="columnheader" aria-label={t('globalViews.calendar.hour')} />
            {layout.days.map((day) => {
              const short = formatDayShort(day.date)
              const isToday = day.date === today
              return (
                <div key={day.date} role="columnheader"
                  className={`px-2 py-2 text-center ${isToday ? 'font-bold text-brand' : ''}`}>
                  <span className="block text-xs uppercase text-text-muted">{short.weekday}</span>
                  <span className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-chip text-base ${
                    isToday ? 'bg-brand text-brand-on' : ''}`}>
                    {short.day}
                  </span>
                </div>
              )
            })}
          </div>

          {layout.days.some((day) => day.untimed.length > 0) && (
            <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border" role="row">
              <div className="px-1 py-1 text-right text-xs text-text-muted">{t('globalViews.calendar.noTime')}</div>
              {layout.days.map((day) => (
                <div key={day.date} role="gridcell" className="grid gap-1 border-l border-border p-1">
                  {day.untimed.map((row) => (
                    <Link key={`${row.offering_id}-${row.lesson_title}`} to={link(row)}
                      className={`rounded-control px-2 py-1 text-xs underline ${toneOf(row.offering_id)}`}>
                      {row.lesson_title}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" role="row">
            <div className="relative" style={{ height }}>
              {hours.map((hour, index) => (
                <span key={hour} className="absolute right-2 -translate-y-1/2 text-xs text-text-muted"
                  style={{ top: index * HOUR_PX }}>
                  {index === 0 ? '' : minutesLabel(hour * 60)}
                </span>
              ))}
            </div>
            {layout.days.map((day) => (
              <div key={day.date} role="gridcell"
                className={`relative border-l border-border ${day.date === today ? 'bg-brand-soft/30' : ''}`}
                style={{
                  height,
                  backgroundImage: 'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}>
                {day.blocks.map((block) => {
                  const top = ((block.start - layout.startHour * 60) / 60) * HOUR_PX
                  const blockHeight = Math.max(((block.end - block.start) / 60) * HOUR_PX, 28)
                  const width = 100 / block.lanes
                  return (
                    <div key={`${block.item.offering_id}-${block.item.module_title}-${block.item.lesson_title}`}
                      className={`absolute overflow-hidden rounded-control border border-border px-2 py-1 text-xs leading-tight shadow-sm ${toneOf(block.item.offering_id)}`}
                      style={{
                        top, height: blockHeight - 2,
                        left: `calc(${block.lane * width}% + 2px)`, width: `calc(${width}% - 4px)`,
                      }}
                      title={`${block.item.module_title} · ${block.item.lesson_title} — ${block.item.offering_title}`}>
                      <span className="block font-bold">
                        {formatTimeRange(block.item.start_time, block.item.end_time)}
                      </span>
                      <span className="block break-words">{block.item.lesson_title}</span>
                      <Link to={link(block.item)} className="block break-words underline">
                        {block.item.offering_title}
                      </Link>
                      <span className="block opacity-80">{block.item.client_name}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lista por día (pantallas pequeñas) */}
      <ol className="grid gap-3 md:hidden">
        {busyDays.map((day) => (
          <li key={day.date}>
            <Card className="grid gap-3">
              <h2 className="flex flex-wrap items-center gap-2 font-bold">
                {formatDayLong(day.date)}
                {day.date === today && <Badge status="success">{t('globalViews.calendar.todayBadge')}</Badge>}
              </h2>
              <ul className="grid gap-2">
                {[...day.blocks.map((block) => block.item), ...day.untimed].map((item) => (
                  <li key={`${item.offering_id}-${item.module_title}-${item.lesson_title}`}
                    className={`grid gap-0.5 rounded-control px-3 py-2 ${toneOf(item.offering_id)}`}>
                    <span className="font-semibold">
                      {formatTimeRange(item.start_time, item.end_time) || t('globalViews.calendar.noTime')}
                    </span>
                    <span className="break-words">{item.module_title} · {item.lesson_title}</span>
                    <Link to={link(item)} className="underline">{item.offering_title}</Link>
                    <span className="text-sm opacity-80">{item.client_name}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ol>
    </>
  )
}
