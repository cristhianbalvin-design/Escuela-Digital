import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useSchedule } from '@/features/schedule/schedule-api'
import { formatSessionDate, formatTimeRange } from '@/features/global/global-utils'
import type { Json } from '@/lib/supabase/database.types'
import { useOutline } from './api'

type Session = { id: string; title: string; week: string; number: number; date: string | null; time: string }

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

/** Calendario de la edición: cada sesión con su fecha y los tres momentos (Guion, Dictar, Resultados). */
export function OfferingSessionsTab({ offeringId, courseId }: { offeringId: string; courseId: string | null }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const outline = useOutline(offeringId, true)
  const schedule = useSchedule(offeringId)
  if (outline.isPending || schedule.isPending) return <Skeleton className="h-64" />
  if (outline.isError) return <Card><p role="alert">{t('offeringSessions.error')}</p><Button onClick={() => void outline.refetch()}>{t('retry')}</Button></Card>
  const rows = new Map((schedule.data ?? []).map((row) => [row.lesson_id, row]))
  let number = 0
  const weeks = outlineSessions(outline.data).map((module) => ({ week: module.week, sessions: module.lessons.map((lesson): Session => {
    number += 1
    const row = rows.get(lesson.id)
    return { id: lesson.id, title: lesson.title, week: module.week, number, date: row?.session_date ?? null, time: row ? formatTimeRange(row.start_time, row.end_time) : '' }
  }) }))
  const all = weeks.flatMap((week) => week.sessions)
  if (all.length === 0) return <EmptyState title={t('offeringSessions.empty')} />
  const today = new Date().toISOString().slice(0, 10)
  const next = all.filter((session) => session.date && session.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0] ?? all.find((session) => !session.date)
  const teach = (id: string) => `/clase-control/${offeringId}/${id}${search}`
  const results = (id: string) => `/sesion-resultados/${offeringId}/${id}${search}`
  const script = (id: string) => courseId ? { pathname: `/docente/cursos/${courseId}/sesiones/${id}`, search: `${search ? `${search}&` : '?'}tab=guion` } : null
  const actions = (session: Session, primary = false) => <div className="flex flex-wrap gap-2">
    {script(session.id) && <Link to={script(session.id)!} className="inline-flex min-h-11 items-center rounded-control border border-border px-3 text-sm hover:border-brand">{t('offeringSessions.script')}</Link>}
    <a href={teach(session.id)} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold ${primary ? 'bg-brand text-white' : 'border border-border hover:border-brand'}`}>{t(primary ? 'offeringSessions.teachNow' : 'offeringSessions.teach')}</a>
    <a href={results(session.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-control border border-border px-3 text-sm hover:border-brand">{t('offeringSessions.results')}</a>
  </div>
  const when = (session: Session) => session.date ? `${formatSessionDate(session.date)}${session.time ? ` · ${session.time}` : ''}` : t('offeringSessions.noDate')
  return <div className="grid gap-5">
    {next && <Card className="grid gap-3 border-brand">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{t(next.date === today ? 'offeringSessions.today' : 'offeringSessions.next')}</p>
      <div><p className="text-sm text-text-muted">{next.week} · {t('offeringSessions.session', { number: next.number })} · {when(next)}</p>
        <h2 className="font-heading text-xl font-bold">{next.title}</h2></div>
      {actions(next, true)}
    </Card>}
    {weeks.map((week) => <section key={week.week} className="overflow-hidden rounded-card border border-border bg-surface">
      <h3 className="border-b border-border px-4 py-3 font-heading font-semibold">{week.week}</h3>
      <ul>{week.sessions.map((session) => {
        const past = !!session.date && session.date < today
        return <li key={session.id} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
          <span className="w-24 shrink-0 text-sm font-semibold text-text-muted">{t('offeringSessions.session', { number: session.number })}</span>
          <span className="min-w-0 flex-[1_1_16rem]"><span className="block font-semibold">{session.title}</span>
            <span className="block text-sm text-text-muted">{when(session)}</span></span>
          {session.id === next?.id ? <Badge>{t('offeringSessions.nextBadge')}</Badge> : past ? <span className="text-xs text-text-muted">{t('offeringSessions.past')}</span> : null}
          {actions(session)}
        </li>
      })}</ul>
    </section>)}
  </div>
}
