import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useCompletionRules } from '@/features/certificates/certificates-api'
import { useAttendanceSummary, useCreateSession } from './attendance-api'
import { SessionFormDialog } from './AttendanceDialogs'
import { SessionSheet } from './SessionSheet'
import {
  attendanceToCsv, downloadCsv, formatPct, formatSessionDate, STATUS_LETTER,
} from './attendance-utils'

export function AttendanceTab({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const summary = useAttendanceSummary(offeringId)
  const rules = useCompletionRules(offeringId)
  const create = useCreateSession(offeringId)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'sessions' | 'students'>('sessions')

  if (selected) {
    return <SessionSheet offeringId={offeringId} sessionId={selected}
      onBack={() => setSelected(null)} />
  }
  if (summary.isPending) return <Skeleton className="h-48" />
  if (summary.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{summary.error.message}</p>
        <Button variant="secondary" className="w-fit" onClick={() => void summary.refetch()}>
          {t('retry')}
        </Button>
      </Card>
    )
  }

  const { sessions, students } = summary.data
  const closed = sessions.filter((session) => session.status === 'closed')
  const minimum = rules.data?.min_attendance_pct ?? null

  async function createSession(values: { title: string; date: string }) {
    setError('')
    try {
      const id = await create.mutateAsync(values)
      setCreating(false)
      setSelected(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('attendance.actionError'))
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('attendance.title')}</h2>
        <div className="flex flex-wrap gap-2">
          {closed.length > 0 && (
            <Button variant="secondary"
              onClick={() => downloadCsv('asistencia.csv', attendanceToCsv(summary.data))}>
              {t('attendance.exportCsv')}
            </Button>
          )}
          <Button onClick={() => { setError(''); setCreating(true) }}>
            {t('attendance.newSession')}
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label={t('attendance.views')} className="flex flex-wrap gap-2">
        {(['sessions', 'students'] as const).map((item) => (
          <Button key={item} role="tab" aria-selected={view === item}
            variant={view === item ? 'primary' : 'secondary'}
            onClick={() => setView(item)}>
            {t(item === 'sessions' ? 'attendance.tabSessions' : 'attendance.tabStudents')}
          </Button>
        ))}
      </div>

      {view === 'sessions' && (sessions.length === 0 ? (
        <EmptyState title={t('attendance.empty')} description={t('attendance.emptyHint')} />
      ) : (
        <ul className="grid gap-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{session.title}</p>
                  <p className="text-sm text-text-muted">
                    {formatSessionDate(session.session_date)}
                    {' · '}
                    {session.status === 'closed'
                      ? t('attendance.sessionCounts', {
                        present: session.present, late: session.late,
                        absent: session.absent, excused: session.excused,
                      })
                      : t('attendance.markedOf', { marked: session.marked })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={session.status === 'open' ? 'warning' : 'success'}>
                    {t(session.status === 'open' ? 'attendance.statusOpen' : 'attendance.statusClosed')}
                  </Badge>
                  <Button variant="secondary" onClick={() => setSelected(session.id)}>
                    {t(session.status === 'open' ? 'attendance.takeAttendance' : 'attendance.view')}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ))}

      {view === 'students' && (students.length === 0 || closed.length === 0) && (
        <EmptyState title={t('attendance.summaryEmpty')} />
      )}

      {view === 'students' && students.length > 0 && closed.length > 0 && (
        <section className="grid gap-2" aria-labelledby="attendance-matrix-title">
          <h3 id="attendance-matrix-title" className="text-lg font-bold">
            {t('attendance.summaryTitle')}
          </h3>
          <p className="text-sm text-text-muted">
            {t('attendance.legend')}
            {minimum !== null ? ` ${t('attendance.minimum', { pct: minimum })}` : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <caption className="sr-only">{t('attendance.summaryTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="p-2">{t('attendance.student')}</th>
                  {closed.map((session) => (
                    <th scope="col" key={session.id} className="p-2 text-center"
                      title={`${session.title} · ${formatSessionDate(session.session_date)}`}>
                      {formatSessionDate(session.session_date).slice(0, 5)}
                    </th>
                  ))}
                  <th scope="col" className="p-2 text-center">{t('attendance.percent')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const below = minimum !== null && (student.pct ?? 0) < minimum
                  return (
                    <tr key={student.enrollment_id} className="border-t border-border">
                      <th scope="row" className="p-2 font-semibold">
                        {student.full_name ?? student.email}
                      </th>
                      {closed.map((session) => {
                        const status = student.by_session[session.id]
                        return (
                          <td key={session.id} className="p-2 text-center">
                            {status
                              ? <span aria-label={t(`attendance.status.${status}`)}>
                                {STATUS_LETTER[status]}
                              </span>
                              : '—'}
                          </td>
                        )
                      })}
                      <td className="p-2 text-center">
                        <Badge status={student.pct === null ? 'neutral' : below ? 'error' : 'success'}>
                          {formatPct(student.pct)}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {creating && (
        <SessionFormDialog initial={null} pending={create.isPending} error={error}
          onClose={() => setCreating(false)} onSubmit={(values) => void createSession(values)} />
      )}
    </div>
  )
}
