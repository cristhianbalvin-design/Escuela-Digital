import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import {
  useAttendanceSheet, useCloseSession, useDeleteSession, useReopenSession,
  useSaveMarks, useUpdateSession, type Mark,
} from './attendance-api'
import { ConfirmDialog, ReasonDialog, SessionFormDialog } from './AttendanceDialogs'
import {
  countMarks, formatSessionDate, STATUSES, type AttendanceStatus,
} from './attendance-utils'

type Dialog = 'edit' | 'close' | 'reopen' | 'delete' | null

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function SessionSheet({
  offeringId, sessionId, onBack,
}: { offeringId: string; sessionId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const sheet = useAttendanceSheet(sessionId)
  const saveMarks = useSaveMarks(offeringId)
  const close = useCloseSession(offeringId)
  const reopen = useReopenSession(offeringId)
  const update = useUpdateSession(offeringId)
  const remove = useDeleteSession(offeringId)
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState('')

  if (sheet.isPending) return <Skeleton className="h-64" />
  if (sheet.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{sheet.error.message}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void sheet.refetch()}>{t('retry')}</Button>
          <Button variant="secondary" onClick={onBack}>{t('attendance.back')}</Button>
        </div>
      </Card>
    )
  }

  const { session, students, events } = sheet.data
  const isOpen = session.status === 'open'
  const effective = students.map((student) => ({
    ...student, status: draft[student.enrollment_id] ?? student.status,
  }))
  const counts = countMarks(effective)
  const dirty = Object.keys(draft).length > 0
  const busy = saveMarks.isPending || close.isPending || reopen.isPending
    || update.isPending || remove.isPending

  function pending(): Mark[] {
    return Object.entries(draft).map(([enrollment_id, status]) => ({ enrollment_id, status }))
  }

  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
      return true
    } catch (cause) {
      setError(message(cause, t('attendance.actionError')))
      return false
    }
  }

  async function save() {
    if (await run(() => saveMarks.mutateAsync({ sessionId, marks: pending() }))) setDraft({})
  }

  async function closeSession() {
    const ok = await run(async () => {
      await saveMarks.mutateAsync({ sessionId, marks: pending() })
      await close.mutateAsync(sessionId)
    })
    if (ok) { setDraft({}); setDialog(null) }
  }

  return (
    <section className="grid gap-4" aria-labelledby="session-sheet-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="secondary" onClick={onBack}>{t('attendance.back')}</Button>
        </div>
        <Badge status={isOpen ? 'warning' : 'success'}>
          {t(isOpen ? 'attendance.statusOpen' : 'attendance.statusClosed')}
        </Badge>
      </div>
      <div>
        <h2 id="session-sheet-title" className="text-xl font-bold">{session.title}</h2>
        <p className="text-sm text-text-muted">{formatSessionDate(session.session_date)}</p>
      </div>

      <p role="status" className="text-sm">
        {t('attendance.counts', {
          present: counts.present, late: counts.late, absent: counts.absent,
          excused: counts.excused, unmarked: counts.unmarked,
        })}
      </p>

      {students.length === 0 ? (
        <Card><p>{t('attendance.noStudents')}</p></Card>
      ) : (
        <ul className="grid gap-2">
          {effective.map((student) => {
            const name = student.full_name ?? student.email ?? ''
            return (
              <li key={student.enrollment_id}>
                <Card className="grid gap-2 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{name}</p>
                    {student.full_name && student.email &&
                      <p className="truncate text-sm text-text-muted">{student.email}</p>}
                  </div>
                  {isOpen ? (
                    <div role="group" aria-label={t('attendance.markFor', { name })}
                      className="flex flex-wrap gap-2">
                      {STATUSES.map((status) => (
                        <Button key={status} aria-pressed={student.status === status}
                          variant={student.status === status ? 'primary' : 'secondary'}
                          disabled={busy}
                          onClick={() => setDraft((current) => ({
                            ...current, [student.enrollment_id]: status,
                          }))}>
                          {t(`attendance.status.${status}`)}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Badge status={student.status === 'absent' ? 'error'
                      : student.status === 'late' ? 'warning' : 'success'}>
                      {student.status ? t(`attendance.status.${student.status}`) : '—'}
                    </Badge>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {error && dialog === null && <p role="alert" className="text-error">{error}</p>}

      {isOpen ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy || students.length === 0}
            onClick={() => setDraft(Object.fromEntries(
              students.map((student) => [student.enrollment_id, 'present' as const]),
            ))}>
            {t('attendance.markAllPresent')}
          </Button>
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {saveMarks.isPending ? t('attendance.saving') : t('attendance.saveMarks')}
          </Button>
          <Button disabled={busy || students.length === 0}
            onClick={() => { setError(''); setDialog('close') }}>
            {t('attendance.closeSession')}
          </Button>
          <Button variant="secondary" disabled={busy}
            onClick={() => { setError(''); setDialog('edit') }}>
            {t('attendance.edit')}
          </Button>
          <Button variant="destructive" disabled={busy}
            onClick={() => { setError(''); setDialog('delete') }}>
            {t('attendance.delete')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy}
            onClick={() => { setError(''); setDialog('reopen') }}>
            {t('attendance.reopen')}
          </Button>
        </div>
      )}

      {events.length > 0 && (
        <Card className="grid gap-2">
          <h3 className="font-bold">{t('attendance.history')}</h3>
          <ul className="grid gap-1 text-sm">
            {events.map((event) => (
              <li key={`${event.type}-${event.created_at}`}>
                {t(event.type === 'closed' ? 'attendance.eventClosed' : 'attendance.eventReopened', {
                  actor: event.actor ?? '—',
                  date: new Date(event.created_at).toLocaleString('es-PE'),
                })}
                {event.reason ? ` — ${event.reason}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dialog === 'edit' && (
        <SessionFormDialog
          initial={{ title: session.title, date: session.session_date }}
          pending={update.isPending} error={error} onClose={() => setDialog(null)}
          onSubmit={(values) => void run(async () => {
            await update.mutateAsync({ sessionId, ...values })
            setDialog(null)
          })} />
      )}
      {dialog === 'close' && (
        <ConfirmDialog title={t('attendance.closeTitle')}
          description={t('attendance.closeDescription', { count: counts.unmarked })}
          confirmLabel={t('attendance.closeSession')} pending={busy} error={error}
          onClose={() => setDialog(null)} onConfirm={() => void closeSession()} />
      )}
      {dialog === 'reopen' && (
        <ReasonDialog title={t('attendance.reopenTitle')}
          description={t('attendance.reopenDescription')} pending={reopen.isPending}
          error={error} onClose={() => setDialog(null)}
          onSubmit={(reason) => void run(async () => {
            await reopen.mutateAsync({ sessionId, reason })
            setDialog(null)
          })} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog destructive title={t('attendance.deleteTitle')}
          description={t('attendance.deleteDescription', { name: session.title })}
          confirmLabel={t('attendance.delete')} pending={remove.isPending} error={error}
          onClose={() => setDialog(null)}
          onConfirm={() => void run(async () => {
            await remove.mutateAsync(sessionId)
            onBack()
          })} />
      )}
    </section>
  )
}
