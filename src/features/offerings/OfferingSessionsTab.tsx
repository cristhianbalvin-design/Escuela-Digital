import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useSchedule } from '@/features/schedule/schedule-api'
import { formatSessionDate, formatTimeRange } from '@/features/global/global-utils'
import { useOfferingSessionsStatus } from '@/features/live/live-api'
import type { OfferingSessionStatus } from '@/features/live/live-contract'
import type { Json } from '@/lib/supabase/database.types'
import { useOutline } from './api'

type Session = { id: string; title: string; week: string; weekIndex: number; number: number; date: string | null; time: string; start: string | null; status: OfferingSessionStatus }
type Filter = 'all' | 'next' | 'past' | 'pending'

function outlineSessions(value: Json | undefined): { week: string; lessons: { id: string; title: string }[] }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const modules = Array.isArray(value.modules) ? value.modules : []
  return modules.flatMap((module) => {
    if (!module || typeof module !== 'object' || Array.isArray(module) || typeof module.title !== 'string') return []
    const lessons = Array.isArray(module.lessons) ? module.lessons.flatMap((lesson) =>
      lesson && typeof lesson === 'object' && !Array.isArray(lesson) && typeof lesson.id === 'string' && typeof lesson.title === 'string'
        ? [{ id: lesson.id, title: lesson.title }] : []) : []
    return [{ week: module.title, lessons }]
  })
}

const missing = (s: Session) => !s.status.materials || !s.status.slides || !s.status.blocks
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const warning = 'border-amber-600 text-amber-800 [html[data-theme=dark]_&]:border-amber-400 [html[data-theme=dark]_&]:text-amber-300'
const linkClass = 'inline-flex min-h-11 items-center justify-center rounded-control border border-border px-4 text-sm font-semibold hover:border-brand'
const primaryClass = 'inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-sm font-semibold text-brand-on'

export function OfferingSessionsTab({ offeringId, courseId, onAttendance }: { offeringId: string; courseId: string | null; onAttendance: () => void }) {
  const { t, i18n } = useTranslation()
  const { search } = useLocation()
  const [filter, setFilter] = useState<Filter>('all')
  const outline = useOutline(offeringId, true)
  const schedule = useSchedule(offeringId)
  const status = useOfferingSessionsStatus(offeringId)
  if (outline.isPending || schedule.isPending || status.isPending) return <Skeleton className="h-64" />
  if (outline.isError || schedule.isError || status.isError || !status.data) return <Card><p role="alert">{t('offeringSessions.error')}</p><Button onClick={() => { void outline.refetch(); void schedule.refetch(); void status.refetch() }}>{t('retry')}</Button></Card>
  const statusData = status.data
  const dates = new Map((schedule.data ?? []).map((row) => [row.lesson_id, row]))
  const statuses = new Map(statusData.sessions.map((row) => [row.lesson_id, row]))
  let number = 0
  const all = outlineSessions(outline.data).flatMap((module, weekIndex) => module.lessons.flatMap((lesson): Session[] => {
    number += 1
    const row = dates.get(lesson.id)
    const lessonStatus = statuses.get(lesson.id)
    if (!lessonStatus) return []
    return [{ id: lesson.id, title: lesson.title, week: module.week, weekIndex, number, date: row?.session_date ?? null, time: row ? formatTimeRange(row.start_time, row.end_time) : '', start: row?.start_time ?? null, status: lessonStatus }]
  }))
  if (!all.length) return <EmptyState title={t('offeringSessions.empty')} />
  const now = new Date()
  const today = localDate(now)
  const isPast = (s: Session) => !!s.date && s.date < today
  const pending = (s: Session) => isPast(s) ? !s.status.attendance_taken : missing(s)
  const past = all.filter(isPast)
  const upcoming = all.filter((s) => !isPast(s))
  const next = [...upcoming].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.start ?? '').localeCompare(b.start ?? '') || a.number - b.number)[0]
  const visible = all.filter((s) => filter === 'all' || (filter === 'next' && !isPast(s)) || (filter === 'past' && isPast(s)) || (filter === 'pending' && pending(s)))
  const teach = (id: string) => `/clase-control/${offeringId}/${id}${search}`
  const results = (id: string) => `/sesion-resultados/${offeringId}/${id}${search}`
  const courseLink = (s: Session, section: string) => {
    const params = new URLSearchParams(search)
    params.delete('tab'); params.delete('section')
    if (section === 'script') params.set('tab', 'guion'); else { params.set('section', section); if (section === 'material') params.set('tab', 'contenido') }
    return { pathname: `/docente/cursos/${courseId}/sesiones/${s.id}`, search: `?${params.toString()}` }
  }
  const firstMissing = (s: Session) => !s.status.materials ? 'material' : !s.status.slides ? 'presentation' : 'guide'
  const prepLink = (s: Session) => courseLink(s, missing(s) ? firstMissing(s) : 'material')
  const chips = (s: Session) => <div className="flex flex-wrap gap-2">
    {([['materials', 'material'], ['slides', 'presentation'], ['blocks', 'guide'], ['activities', 'activities']] as const).map(([key, label]) => {
      const ready = s.status[key] > 0
      const optional = key === 'activities'
      return <span key={key} className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${ready ? 'border-brand bg-brand-soft text-brand' : optional ? 'border-border text-text-muted' : `border-dashed ${warning}`}`}>
        {ready ? '✓ ' : ''}{t(`offeringSessions.${ready ? label : `no_${label}`}`, { count: s.status[key] })}
      </span>
    })}
  </div>
  const relative = (s: Session) => {
    if (!s.date) return t('offeringSessions.noDate')
    if (s.date === today && s.start) {
      const starts = new Date(`${s.date}T${s.start}`)
      const hours = Math.ceil((starts.getTime() - now.getTime()) / 3600000)
      if (hours > 0) return t('offeringSessions.inHours', { count: hours })
      return t('offeringSessions.today')
    }
    const days = Math.round((new Date(`${s.date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
    return days > 0 ? t('offeringSessions.inDays', { count: days }) : t('offeringSessions.today')
  }
  const counters: [Filter, number][] = [['all', all.length], ['next', upcoming.length], ['past', past.length], ['pending', all.filter(pending).length]]
  const metric = (label: string, value: number, total: number, subtitle: string, progress = false) => <Card className="grid content-start gap-2">
    <p className="text-sm font-semibold text-text-muted">{label}</p><p className="font-heading text-2xl font-bold">{value} <span className="text-sm font-normal text-text-muted">{t('offeringSessions.of', { total })}</span></p>
    {progress ? <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}><div className="h-full rounded-full bg-brand" style={{ width: `${total ? value / total * 100 : 0}%` }} /></div> : <p className="text-xs text-text-muted">{subtitle}</p>}
  </Card>
  return <div className="grid gap-5">
    {next && <Card className="flex flex-wrap items-center gap-5 border-2 border-brand bg-brand-soft">
      <div className="grid min-w-0 flex-[1_1_24rem] gap-3">
        <div className="flex flex-wrap items-center gap-2"><Badge>{next.date === today ? t('offeringSessions.today') : t('offeringSessions.nextBadge')} · {next.date === today ? next.time || t('offeringSessions.noTime') : next.date ? formatSessionDate(next.date) : t('offeringSessions.noDate')}</Badge><span className="text-sm text-text-muted">{next.week} · {t('offeringSessions.sessionOf', { number: next.number, total: all.length })} · {relative(next)}</span></div>
        <h2 className="font-heading text-xl font-bold">{next.title}</h2>{chips(next)}
        {missing(next) && <p className="text-sm text-amber-800 [html[data-theme=dark]_&]:text-amber-300">{t('offeringSessions.prepWarning')}</p>}
      </div>
      <div className="grid flex-[1_1_13rem] gap-2">
        {missing(next) && courseId ? <><Link className={primaryClass} to={prepLink(next)}>{t('offeringSessions.prepareSession', { number: next.number })}</Link><a className={linkClass} href={teach(next.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.teachAnyway')}</a></> : <><a className={primaryClass} href={teach(next.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.teach')}</a>{courseId && <Link className={linkClass} to={courseLink(next, 'script')}>{t('offeringSessions.script')}</Link>}</>}
      </div>
    </Card>}
    <section aria-label={t('offeringSessions.summary')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metric(t('offeringSessions.calendarProgress'), past.length, all.length, '', true)}
      {metric(t('offeringSessions.taughtSenda'), past.filter((s) => s.status.live_classes > 0).length, past.length, t('offeringSessions.launched', { count: past.reduce((n, s) => n + s.status.live_runs, 0) }))}
      {metric(t('offeringSessions.attendanceRecorded'), past.filter((s) => s.status.attendance_taken).length, past.length, t('offeringSessions.enrolled', { count: statusData.enrolled }))}
      {metric(t('offeringSessions.unprepared'), upcoming.filter(missing).length, upcoming.length, t('offeringSessions.upcoming'))}
    </section>
    <div role="group" aria-label={t('offeringSessions.filter')} className="flex w-fit max-w-full flex-wrap gap-1 rounded-control border border-border bg-surface p-1">
      {counters.map(([name, count]) => <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)} className={`min-h-11 rounded-control px-3 text-sm font-semibold ${filter === name ? 'bg-brand text-brand-on' : 'text-text-muted hover:bg-brand-soft'}`}>{t(`offeringSessions.filter_${name}`)} · {count}</button>)}
    </div>
    {visible.length === 0 && <EmptyState title={t('offeringSessions.noMatches')} />}
    {Array.from(new Set(visible.map((s) => s.weekIndex))).map((weekIndex) => <section key={weekIndex} className="grid gap-2"><h3 className="px-1 text-sm font-bold text-brand">{visible.find((s) => s.weekIndex === weekIndex)?.week}</h3><ul className="grid gap-2">{visible.filter((s) => s.weekIndex === weekIndex).map((s) => {
      const pastSession = isPast(s); const isToday = s.date === today
      const date = s.date ? new Date(`${s.date}T12:00:00`) : null
      return <li key={s.id}><Card className={`flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center ${isToday ? 'border-brand bg-brand-soft' : ''}`}>
        <div className="flex min-h-16 min-w-16 flex-col items-center justify-center rounded-control bg-surface-elevated px-2 text-center text-xs text-text-muted">{date ? <><span className="uppercase">{date.toLocaleDateString(i18n.resolvedLanguage, { weekday: 'short' })}</span><strong className="text-xl text-text">{date.getDate()}</strong><span>{date.toLocaleDateString(i18n.resolvedLanguage, { month: 'short' })}</span></> : t('offeringSessions.noDate')}</div>
        <div className="min-w-0 flex-[1_1_12rem]"><p className="font-semibold">{s.title}</p><p className="text-sm text-text-muted">{t(isToday ? 'offeringSessions.today' : pastSession ? 'offeringSessions.past' : 'offeringSessions.nextBadge')} · {s.time || t(s.date ? 'offeringSessions.noTime' : 'offeringSessions.noDate')}</p></div>
        <div className="min-w-0 flex-[2_1_20rem]">{pastSession ? <div className="flex flex-wrap gap-2"><span className="rounded-full border border-border px-2.5 py-1 text-xs">{s.status.live_classes ? t('offeringSessions.liveDetail', { classes: s.status.live_classes, runs: s.status.live_runs, responses: s.status.live_responses }) : t('offeringSessions.notTaught')}</span><span className={`rounded-full border px-2.5 py-1 text-xs ${s.status.attendance_taken ? 'border-brand bg-brand-soft text-brand' : `border-dashed ${warning}`}`}>{s.status.attendance_taken ? t('offeringSessions.attendanceCount', { attended: s.status.attended, total: statusData.enrolled }) : t('offeringSessions.attendanceMissing')}</span></div> : chips(s)}</div>
        <div className="flex gap-2">{pastSession ? s.status.live_classes > 0 ? <a className={linkClass} href={results(s.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.results')}</a> : <Button variant="secondary" onClick={onAttendance}>{t('offeringSessions.attendance')}</Button> : isToday ? <a className={primaryClass} href={teach(s.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.teach')}</a> : courseId ? <Link className={linkClass} to={prepLink(s)}>{t('offeringSessions.prepare')}</Link> : <a className={linkClass} href={teach(s.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.teach')}</a>}
          <details className="relative"><summary aria-label={t('offeringSessions.more', { number: s.number })} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-control border border-border text-xl">⋯</summary><div className="absolute right-0 z-10 grid min-w-40 rounded-control border border-border bg-surface p-1 shadow-lg">{courseId && <Link className="rounded-control px-3 py-2 hover:bg-brand-soft" to={courseLink(s, 'script')}>{t('offeringSessions.script')}</Link>}<a className="rounded-control px-3 py-2 hover:bg-brand-soft" href={teach(s.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.teach')}</a><a className="rounded-control px-3 py-2 hover:bg-brand-soft" href={results(s.id)} target="_blank" rel="noopener noreferrer">{t('offeringSessions.results')}</a><button className="rounded-control px-3 py-2 text-left hover:bg-brand-soft" type="button" onClick={onAttendance}>{t('offeringSessions.attendance')}</button></div></details>
        </div>
      </Card></li>
    })}</ul></section>)}
  </div>
}
