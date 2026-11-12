import { PlanningTab } from '@/features/planning/PlanningTab'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Badge, Button, Card, EmptyState, Input, Progress, Skeleton, useToast,
} from '@/components/ui'
import { LessonContent } from '@/features/courses/LessonContent'
import { LessonResources } from '@/features/resources'
import { useSchedule } from '@/features/schedule/schedule-api'
import { formatSessionDate, formatTimeRange } from '@/features/global/global-utils'
import { useTenantAccess } from '@/features/tenants'
import { readableError } from '@/features/courses/schemas'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'
import {
  useEnrollableStudents, useEnrollStudents, useOffering, useOfferingAction,
  useOfferingRoster, useOutline,
} from './api'
import { InvitationPanel } from './InvitationPanel'
import { StudentEditForm } from './StudentEditForm'
import { GradingTab } from './grading/GradingTab'
import { CertificatesTab } from '@/features/certificates'
import { AttendanceTab } from '@/features/attendance'
import { ScheduleTab } from '@/features/schedule'
import { EnrollForm, ImportPanel } from '@/features/imports'
import { shownEmail } from '@/lib/placeholder-email'

type EnrollmentStatus = Database['public']['Enums']['enrollment_status']
type Tab = 'planning' | 'summary' | 'students' | 'content' | 'schedule' | 'attendance' | 'grading' | 'certificates'

const nextStatus: Record<
  Database['public']['Enums']['offering_status'],
  Database['public']['Enums']['offering_status'] | null
> = {
  draft: 'open',
  open: 'running',
  running: 'finished',
  finished: 'archived',
  archived: null,
}

const enrollmentTransitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending: ['active', 'dropped', 'suspended'],
  active: ['completed', 'dropped', 'suspended'],
  suspended: ['active', 'dropped'],
  completed: [],
  dropped: [],
}

type OutlineLesson = {
  id: string
  title: string
  locked: boolean
  unlock_at: string | null
  content?: Json
}

type OutlineModule = {
  id: string
  title: string
  locked: boolean
  unlock_at: string | null
  lessons: OutlineLesson[]
}

function outlineModules(value: Json | undefined): OutlineModule[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const modules = value.modules
  if (!Array.isArray(modules)) return []
  return modules.flatMap((module) => {
    if (!module || typeof module !== 'object' || Array.isArray(module) ||
      typeof module.id !== 'string' || typeof module.title !== 'string') return []
    const lessons = Array.isArray(module.lessons)
      ? module.lessons.flatMap((lesson) => {
        if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson) ||
          typeof lesson.id !== 'string' || typeof lesson.title !== 'string') return []
        return [{
          id: lesson.id,
          title: lesson.title,
          locked: lesson.locked === true,
          unlock_at: typeof lesson.unlock_at === 'string' ? lesson.unlock_at : null,
          content: lesson.content,
        }]
      })
      : []
    return [{
      id: module.id,
      title: module.title,
      locked: module.locked === true,
      unlock_at: typeof module.unlock_at === 'string' ? module.unlock_at : null,
      lessons,
    }]
  })
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
}

function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : ''
}

export function OfferingDetailPage() {
  const { search } = useLocation()
  const { t } = useTranslation()
  const notify = useToast()
  const { offeringId } = useParams()
  const tenantId = useTenantAccess().active?.tenant_id
  const [tab, setTab] = useState<Tab>('summary')
  const [notice, setNotice] = useState('')
  const [sendingAccess, setSendingAccess] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const query = useOffering(tenantId, offeringId)
  const roster = useOfferingRoster(offeringId, tab === 'students')
  const candidates = useEnrollableStudents(offeringId, tab === 'students')
  const outline = useOutline(offeringId, tab === 'content')
  const schedule = useSchedule(tab === 'content' ? offeringId : undefined)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [studentsView, setStudentsView] = useState<'roster' | 'enroll'>('roster')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rosterFilter, setRosterFilter] = useState('')
  const rosterNeedle = rosterFilter.trim().toLowerCase()
  const filteredRoster = (roster.data ?? []).filter((student) => rosterNeedle === '' ||
    `${student.full_name ?? ''} ${shownEmail(student.email)}`.toLowerCase().includes(rosterNeedle))
  const sessionDates = new Map((schedule.data ?? []).map((row) => [row.lesson_id, row.session_date]))
  const sessionTimes = new Map((schedule.data ?? []).map((row) => [row.lesson_id, formatTimeRange(row.start_time, row.end_time)]))
  const mutation = useOfferingAction(tenantId, offeringId)
  const enrollment = useEnrollStudents(tenantId, offeringId)

  function enrollmentError(error: unknown): string {
    if (errorCode(error) === '42501') return t('teacherOfferings.enrollNoPermission')
    if (errorCode(error) === '23514') {
      const message = errorMessage(error).toLowerCase()
      if (message.includes('cupo')) return t('teacherOfferings.enrollNoSeats')
      if (message.includes('no admite matrículas')) {
        return t('teacherOfferings.enrollWrongStatus')
      }
      if (message.includes('cliente') || message.includes('estudiante')) {
        return t('teacherOfferings.enrollWrongClient')
      }
      return t('teacherOfferings.enrollInvalid')
    }
    return readableError(error)
  }

  // Envía el correo para crear contraseña; el alumno entra luego con su correo.
  async function sendAccess(emails: string[]) {
    const client = supabase
    const targets = [...new Set(emails.map((email) => shownEmail(email)).filter(Boolean))]
    if (!client || targets.length === 0 || sendingAccess) return
    if (targets.length > 1 && !window.confirm(t('teacherOfferings.sendAccessConfirm', { count: targets.length }))) return
    setSendingAccess(true); setNotice('')
    let sent = 0
    for (const email of targets) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nueva-clave${window.location.search}`,
      })
      if (!error) sent += 1
    }
    setSendingAccess(false)
    setNotice(sent === targets.length
      ? t('teacherOfferings.sendAccessDone', { count: sent })
      : t('teacherOfferings.sendAccessPartial', { sent, total: targets.length }))
  }

  async function run(action: Parameters<typeof mutation.mutateAsync>[0]) {
    setNotice('')
    try {
      await mutation.mutateAsync(action)
      setNotice(t('teacherCommon.saved'))
    } catch (error) {
      setNotice(readableError(error))
    }
  }

  async function enrollSelected() {
    if (selectedIds.length === 0) return
    try {
      const result = await enrollment.mutateAsync(selectedIds)
      setSelectedIds(result.failures.map((item) => item.userId))
      const reasons = [...new Set(result.failures.map((item) => enrollmentError(item.error)))]
      notify([
        t('teacherOfferings.enrollResult', {
          success: result.successes.length,
          failed: result.failures.length,
        }),
        ...reasons,
      ].join(' '))
    } catch (error) {
      notify(enrollmentError(error))
    }
  }

  function toggleSelected(userId: string) {
    setSelectedIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId])
  }

  if (!supabase || !tenantId) return <EmptyState title={t('teacherCommon.connect')} />
  if (query.isPending) return <Skeleton className="h-64" />
  if (query.isError || !query.data) {
    return (
      <Card>
        <p role="alert">{readableError(query.error)}</p>
        <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }

  const { offering, enrollments, clientName } = query.data
  const following = nextStatus[offering.status]
  const canEnroll = offering.status === 'open' || offering.status === 'running'

  return (
    <section className="grid gap-5">
      <Link to={{ pathname: '/docente/ediciones', search }} className="min-h-11 text-brand underline">
        {t('teacherCommon.back')}
      </Link>
      <h1 className="font-heading text-2xl font-bold">{offering.title}</h1>
      <div role="tablist" aria-label={t('teacherOfferings.detailTabs')}
        className="flex flex-wrap gap-2">
        {(['summary', 'students', 'content', 'planning', 'schedule', 'attendance', 'grading', 'certificates'] as const).map((item) => (
          <Button key={item} role="tab" aria-selected={tab === item}
            variant={tab === item ? 'primary' : 'secondary'}
            onClick={() => setTab(item)}>
            {item === 'planning' ? t('planning.tab') : t(`teacherOfferings.tabs.${item}`)}
          </Button>
        ))}
      </div>
      {notice && <p role="status">{notice}</p>}
      <div role="tabpanel">
        {tab === 'summary' && (
          <Card className="grid gap-3">
            <Badge>{t(`teacherOfferings.status.${offering.status}`)}</Badge>
            <p>{t('teacherOfferings.code')}: {offering.code}</p>
            <p>{t('client')}: {clientName}</p>
            <p>{t('teacherOfferings.startsAt')}: {offering.starts_at
              ? new Date(offering.starts_at).toLocaleString('es-PE') : '—'}</p>
            <p>{t('teacherOfferings.endsAt')}: {offering.ends_at
              ? new Date(offering.ends_at).toLocaleString('es-PE') : '—'}</p>
            <p>{t('teacherOfferings.seatsUsed', {
              used: enrollments.filter((item) => item.status !== 'dropped').length,
              total: offering.seats ?? '∞',
            })}</p>
            {following && (
              <Button disabled={mutation.isPending}
                onClick={() => void run({ kind: 'status', status: following })}>
                {t('teacherOfferings.changeStatus', {
                  status: t(`teacherOfferings.status.${following}`),
                })}
              </Button>
            )}
          </Card>
        )}
        {tab === 'students' && (
          <div className="grid gap-4">
            <div role="tablist" aria-label={t('teacherOfferings.studentsViews')} className="flex flex-wrap gap-2">
              <Button role="tab" aria-selected={studentsView === 'roster'}
                variant={studentsView === 'roster' ? 'primary' : 'secondary'}
                onClick={() => setStudentsView('roster')}>
                {roster.data
                  ? t('teacherOfferings.studentsViewRosterCount', { count: roster.data.length })
                  : t('teacherOfferings.studentsViewRoster')}
              </Button>
              <Button role="tab" aria-selected={studentsView === 'enroll'}
                variant={studentsView === 'enroll' ? 'primary' : 'secondary'}
                onClick={() => setStudentsView('enroll')}>
                {t('teacherOfferings.studentsViewEnroll')}
              </Button>
            </div>
            {studentsView === 'enroll' && (
              <div className="grid gap-4">
              {canEnroll && offeringId && <InvitationPanel offeringId={offeringId} />}
              {canEnroll && offeringId && <EnrollForm offeringId={offeringId} />}
              {canEnroll && offeringId && <ImportPanel offeringId={offeringId} />}
              <Card className="grid gap-4">
                <h2 className="text-lg font-bold">{t('teacherOfferings.enrollStudents')}</h2>
                {!canEnroll && <p>{t('teacherOfferings.enrollClosed')}</p>}
                {candidates.isPending ? <Skeleton className="h-24" /> :
                  candidates.isError ? (
                    <div>
                      <p role="alert">{readableError(candidates.error)}</p>
                      <Button onClick={() => void candidates.refetch()}>{t('retry')}</Button>
                    </div>
                  ) : candidates.data.length === 0 ? (
                    <EmptyState title={t('teacherOfferings.noCandidates')}
                      description={t('teacherOfferings.noCandidatesHint')} />
                  ) : (
                    <fieldset className="grid gap-2">
                      <legend className="mb-2 text-sm font-semibold">
                        {t('teacherOfferings.chooseStudents')}
                      </legend>
                      {candidates.data.map((student) => {
                        const name = student.full_name?.trim()
                        return (
                          <label key={student.user_id}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border p-3 focus-within:outline-3">
                            <input type="checkbox" className="size-5 accent-brand"
                              aria-label={name || student.email}
                              checked={selectedIds.includes(student.user_id)}
                              disabled={!canEnroll || enrollment.isPending}
                              onChange={() => toggleSelected(student.user_id)} />
                            <span className="grid">
                              <span className="font-semibold">{name || student.email}</span>
                              {name && (
                                <span className="text-sm text-text-muted">
                                  {shownEmail(student.email)}
                                </span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </fieldset>
                  )}
                <Button disabled={!canEnroll || enrollment.isPending ||
                  selectedIds.length === 0 || candidates.isPending || candidates.isError}
                  onClick={() => void enrollSelected()}>
                  {t('teacherOfferings.enrollSelected')}
                </Button>
              </Card>
              </div>
            )}
            {studentsView === 'roster' && (
              <div className="grid gap-4">
            <h2 className="text-lg font-bold">{t('teacherOfferings.roster')}</h2>
            <div className="max-w-md">
              <Input label={t('teacherOfferings.rosterSearch')} value={rosterFilter}
                onChange={(event) => setRosterFilter(event.target.value)} />
            </div>
            {canEnroll && roster.data && roster.data.some((student) => shownEmail(student.email)) && (
              <div className="grid gap-1">
                <Button variant="secondary" className="w-fit" disabled={sendingAccess}
                  onClick={() => void sendAccess(roster.data
                    .filter((student) => student.status === 'active' || student.status === 'pending')
                    .map((student) => student.email))}>
                  {sendingAccess ? t('teacherOfferings.sendingAccess') : t('teacherOfferings.sendAccessAll')}
                </Button>
                <p className="text-sm text-text-muted">{t('teacherOfferings.sendAccessHint')}</p>
              </div>
            )}
            {roster.isPending ? <Skeleton className="h-48" /> :
              roster.isError ? (
                <Card>
                  <p role="alert">{readableError(roster.error)}</p>
                  <Button onClick={() => void roster.refetch()}>{t('retry')}</Button>
                </Card>
              ) : roster.data.length === 0 ? (
                <EmptyState title={t('teacherOfferings.noStudents')}
                  description={t('teacherOfferings.noStudentsHint')} />
              ) : filteredRoster.length === 0 ? (
                <EmptyState title={t('teacherOfferings.rosterNoMatches')} />
              ) : filteredRoster.map((student) => (
                <Card key={student.enrollment_id} className="grid gap-3">
                  {editingId === student.enrollment_id && offeringId ? (
                    <StudentEditForm offeringId={offeringId} enrollmentId={student.enrollment_id}
                      initial={{
                        full_name: student.full_name?.trim() ?? '',
                        phone: student.phone ?? '',
                        job_title: student.job_title ?? '',
                        company: student.company ?? '',
                      }}
                      onDone={() => setEditingId(null)} />
                  ) : (
                    <>
                      <div className="grid gap-1">
                        <h3 className="font-semibold">
                          {student.full_name?.trim() || shownEmail(student.email)}
                        </h3>
                        {student.full_name?.trim() && shownEmail(student.email) && (
                          <p className="text-sm text-text-muted">{shownEmail(student.email)}</p>
                        )}
                        {(student.phone || student.job_title || student.company) && (
                          <p className="text-sm text-text-muted">
                            {[student.job_title, student.company, student.phone]
                              .filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <Badge status={student.status === 'active' || student.status === 'completed'
                        ? 'success' : student.status === 'dropped' ? 'neutral' : 'warning'}>
                        {t(`teacherOfferings.enrollmentStatus.${student.status}`)}
                      </Badge>
                      <Progress value={student.progress_pct}
                        label={t('teacherOfferings.studentProgress')} />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => setEditingId(student.enrollment_id)}>
                          {t('teacherOfferings.editStudent')}
                        </Button>
                        {canEnroll && shownEmail(student.email) && (
                          <Button variant="secondary" disabled={sendingAccess}
                            onClick={() => void sendAccess([student.email])}>
                            {t('teacherOfferings.sendAccess')}
                          </Button>
                        )}
                        {enrollmentTransitions[student.status].map((status) => (
                          <Button key={status} variant="secondary" disabled={mutation.isPending}
                            onClick={() => void run({
                              kind: 'enrollment', id: student.enrollment_id, status,
                            })}>
                            {t(`teacherOfferings.enrollmentStatus.${status}`)}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              ))}
              </div>
            )}
          </div>
        )}
        {tab === 'planning' && offeringId && <PlanningTab offeringId={offeringId} />}
        {tab === 'schedule' && offeringId && <ScheduleTab offeringId={offeringId} />}
        {tab === 'attendance' && offeringId && <AttendanceTab offeringId={offeringId} />}
        {tab === 'grading' && offeringId && <GradingTab offeringId={offeringId} />}
        {tab === 'certificates' && offeringId && <CertificatesTab offeringId={offeringId} />}
        {tab === 'content' && (
          outline.isPending ? <Skeleton className="h-48" /> :
          outline.isError ? (
            <Card>
              <p role="alert">{readableError(outline.error)}</p>
              <Button onClick={() => void outline.refetch()}>{t('retry')}</Button>
            </Card>
          ) : outlineModules(outline.data).length === 0 ? (
            <EmptyState title={t('teacherOfferings.noContent')} />
          ) : (
            <div className="grid gap-4">
              <label className="flex w-fit items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={pendingOnly}
                  onChange={(event) => setPendingOnly(event.target.checked)} />
                {t('resources.onlyPending')}
              </label>
              {outlineModules(outline.data).map((module) => (
                <Card key={module.id} className="grid gap-3">
                  <h2 className="font-bold">
                    {module.locked ? '🔒 ' : ''}{module.title}
                  </h2>
                  {module.locked && module.unlock_at && (
                    <p>{t('teacherOfferings.unlockAt', {
                      date: new Date(module.unlock_at).toLocaleString('es-PE'),
                    })}</p>
                  )}
                  <ul className="grid gap-3">
                    {module.lessons.map((lesson) => (
                      <li key={lesson.id} className="grid gap-2">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-semibold">
                            {lesson.locked ? '🔒 ' : ''}{lesson.title}
                          </span>
                          {sessionDates.get(lesson.id) ? (
                            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-sm font-medium text-text-muted">
                              {formatSessionDate(sessionDates.get(lesson.id) as string)}
                              {sessionTimes.get(lesson.id) ? ` · ${sessionTimes.get(lesson.id)}` : ''}
                            </span>
                          ) : schedule.isSuccess ? (
                            <span className="text-sm text-text-muted">{t('teacherOfferings.noSessionDate')}</span>
                          ) : null}
                        </span>
                        {lesson.locked && lesson.unlock_at && (
                          <span className="text-sm text-text-muted">
                            {t('teacherOfferings.unlockAt', {
                              date: new Date(lesson.unlock_at).toLocaleString('es-PE'),
                            })}
                          </span>
                        )}
                        {!lesson.locked && lesson.content !== undefined &&
                          <LessonContent content={lesson.content} />}
                        {!lesson.locked && (
                          <LessonResources lessonId={lesson.id} editable={false}
                            tracking={offeringId ? {
                              offeringId,
                              closed: offering.status === 'finished' || offering.status === 'archived',
                              pendingOnly,
                              sessionDate: sessionDates.get(lesson.id) ?? null,
                            } : undefined} />
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  )
}
