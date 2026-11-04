import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useCourses } from '@/features/courses/api'
import { readableError } from '@/features/courses/schemas'
import { useOfferings } from '@/features/offerings/api'
import { useTenantAccess } from '@/features/tenants'
import {
  useOfferingAssignments, useRemoveInstructor, useSetInstructor, useTenantInstructors,
} from './admin-api'
import {
  assignmentsByOffering, availableInstructors, filterByText, filterOfferings, NO_INSTRUCTOR,
  personName, type Assignment, type InstructorRole,
} from './admin-utils'

const STATUSES = ['draft', 'open', 'running', 'finished', 'archived'] as const
const linkClass = 'inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline-3'
const selectClass = 'min-h-11 rounded-control border border-border bg-transparent px-2'

export function AdminCatalogPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const tenantId = useTenantAccess().active?.tenant_id
  const [tab, setTab] = useState<'offerings' | 'courses'>('offerings')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [instructor, setInstructor] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const offerings = useOfferings(tenantId)
  const courses = useCourses(tenantId)
  const instructors = useTenantInstructors(tenantId)
  const assignments = useOfferingAssignments(tenantId)
  const byOffering = assignmentsByOffering(assignments.data ?? [])
  const shownOfferings = filterOfferings(offerings.data ?? [], { text, status, instructor }, byOffering)
  const shownCourses = filterByText(courses.data ?? [], text,
    (course) => `${course.latest?.title ?? ''} ${course.slug}`)

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{t('adminViews.catalog.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link to={{ pathname: '/docente/cursos/nuevo', search }} className={linkClass}>
            {t('adminViews.catalog.newCourse')}
          </Link>
          <Link to={{ pathname: '/docente/ediciones/nueva', search }} className={linkClass}>
            {t('adminViews.catalog.newOffering')}
          </Link>
        </div>
      </div>
      <p className="text-text-muted">{t('adminViews.catalog.hint')}</p>

      <div role="tablist" aria-label={t('adminViews.catalog.title')} className="flex flex-wrap gap-2">
        {(['offerings', 'courses'] as const).map((item) => (
          <Button key={item} role="tab" aria-selected={tab === item}
            variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>
            {t(`adminViews.catalog.tab.${item}`)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 max-w-md flex-1">
          <Input label={t('adminViews.catalog.search')} value={text}
            onChange={(event) => setText(event.target.value)} />
        </div>
        {tab === 'offerings' && (
          <>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t('adminViews.catalog.status')}
              <select value={status} onChange={(event) => setStatus(event.target.value)}
                className={`${selectClass} font-normal`}>
                <option value="">{t('adminViews.catalog.all')}</option>
                {STATUSES.map((item) => (
                  <option key={item} value={item}>{t(`teacherOfferings.status.${item}`)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t('adminViews.catalog.instructor')}
              <select value={instructor} onChange={(event) => setInstructor(event.target.value)}
                className={`${selectClass} font-normal`}>
                <option value="">{t('adminViews.catalog.all')}</option>
                <option value={NO_INSTRUCTOR}>{t('adminViews.catalog.noInstructor')}</option>
                {(instructors.data ?? []).map((item) => (
                  <option key={item.user_id} value={item.user_id}>{personName(item)}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {tab === 'offerings' ? (
        offerings.isPending ? <Skeleton className="h-48" /> :
        offerings.isError ? (
          <Card className="grid gap-3">
            <p role="alert">{readableError(offerings.error)}</p>
            <Button variant="secondary" className="w-fit" onClick={() => void offerings.refetch()}>{t('retry')}</Button>
          </Card>
        ) : shownOfferings.length === 0 ? (
          <EmptyState title={t('adminViews.catalog.noOfferings')} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {shownOfferings.map((offering) => {
              const assigned = byOffering.get(offering.id) ?? []
              return (
                <Card key={offering.id} className="grid gap-3">
                  <div className="grid gap-1">
                    <h2 className="text-lg font-bold">{offering.title}</h2>
                    <p className="text-sm text-text-muted">{offering.code} · {offering.clientName}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{t(`teacherOfferings.status.${offering.status}`)}</Badge>
                    <span className="text-sm text-text-muted">
                      {t('teacherOfferings.seatsUsed', { used: offering.usedSeats, total: offering.seats ?? '∞' })}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">{t('adminViews.catalog.instructors')}: </span>
                    {assigned.length === 0
                      ? <span className="text-warning">{t('adminViews.catalog.noInstructor')}</span>
                      : assigned.map((item) => `${personName(item)} (${t(`adminViews.catalog.role.${item.role}`)})`).join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link to={{ pathname: `/docente/ediciones/${offering.id}`, search }}
                      className="inline-flex min-h-11 items-center font-semibold text-brand underline focus-visible:outline-3">
                      {t('teacherOfferings.open')}
                    </Link>
                    <Button variant="secondary"
                      onClick={() => setOpenId(openId === offering.id ? null : offering.id)}>
                      {openId === offering.id ? t('adminViews.catalog.closePanel') : t('adminViews.catalog.manageInstructors')}
                    </Button>
                  </div>
                  {openId === offering.id && (
                    <InstructorsPanel tenantId={tenantId} offeringId={offering.id} assigned={assigned}
                      loading={instructors.isPending}
                      available={availableInstructors(instructors.data ?? [], assigned)} />
                  )}
                </Card>
              )
            })}
          </div>
        )
      ) : courses.isPending ? <Skeleton className="h-48" /> :
        courses.isError ? (
          <Card className="grid gap-3">
            <p role="alert">{readableError(courses.error)}</p>
            <Button variant="secondary" className="w-fit" onClick={() => void courses.refetch()}>{t('retry')}</Button>
          </Card>
        ) : shownCourses.length === 0 ? (
          <EmptyState title={t('adminViews.catalog.noCourses')} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shownCourses.map((course) => (
              <Card key={course.id} className="grid gap-3">
                <h2 className="text-lg font-bold">{course.latest?.title ?? course.slug}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge status={course.latest?.status === 'draft' ? 'warning' : 'success'}>
                    {course.latest?.status === 'draft' ? t('teacherCommon.draft') : t('teacherCommon.published')}
                  </Badge>
                  <span className="text-sm text-text-muted">
                    {t('teacherCourses.version', { number: course.latest?.version_number ?? 1 })}
                  </span>
                </div>
                <Link to={{ pathname: `/docente/cursos/${course.id}`, search }}
                  className="inline-flex min-h-11 items-center font-semibold text-brand underline focus-visible:outline-3">
                  {t('teacherCourses.open')}
                </Link>
              </Card>
            ))}
          </div>
        )}
    </section>
  )
}

type PanelProps = {
  tenantId: string | undefined
  offeringId: string
  assigned: Assignment[]
  available: { user_id: string; email: string; full_name: string | null }[]
  loading: boolean
}

function InstructorsPanel({ tenantId, offeringId, assigned, available, loading }: PanelProps) {
  const { t } = useTranslation()
  const set = useSetInstructor(tenantId)
  const remove = useRemoveInstructor(tenantId)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<InstructorRole>('lead')
  const [message, setMessage] = useState('')
  const failure = (cause: unknown) =>
    setMessage(readableError(cause) || t('adminViews.catalog.actionError'))

  return (
    <div className="grid gap-3 rounded-control border border-border p-3">
      <h3 className="font-semibold">{t('adminViews.catalog.manageInstructors')}</h3>
      {assigned.length === 0 && <p className="text-sm text-text-muted">{t('adminViews.catalog.noInstructor')}</p>}
      <ul className="grid gap-2">
        {assigned.map((item) => (
          <li key={item.user_id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 basis-40 break-words">{personName(item)}</span>
            <select aria-label={t('adminViews.catalog.roleLabel')} value={item.role}
              disabled={set.isPending}
              onChange={(event) => {
                setMessage('')
                set.mutate({ offeringId, userId: item.user_id, role: event.target.value as InstructorRole },
                  { onError: failure })
              }}
              className={selectClass}>
              <option value="lead">{t('adminViews.catalog.role.lead')}</option>
              <option value="assistant">{t('adminViews.catalog.role.assistant')}</option>
            </select>
            <Button variant="secondary" disabled={remove.isPending}
              onClick={() => {
                setMessage('')
                remove.mutate({ offeringId, userId: item.user_id }, { onError: failure })
              }}>
              {t('adminViews.catalog.remove')}
            </Button>
          </li>
        ))}
      </ul>
      {loading ? <Skeleton className="h-11" /> : available.length === 0 ? (
        <p className="text-sm text-text-muted">{t('adminViews.catalog.noMoreInstructors')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('adminViews.catalog.addInstructor')} value={userId}
            onChange={(event) => setUserId(event.target.value)} className={selectClass}>
            <option value="">{t('adminViews.catalog.chooseInstructor')}</option>
            {available.map((item) => (
              <option key={item.user_id} value={item.user_id}>{personName(item)}</option>
            ))}
          </select>
          <select aria-label={t('adminViews.catalog.roleLabel')} value={role}
            onChange={(event) => setRole(event.target.value as InstructorRole)} className={selectClass}>
            <option value="lead">{t('adminViews.catalog.role.lead')}</option>
            <option value="assistant">{t('adminViews.catalog.role.assistant')}</option>
          </select>
          <Button disabled={!userId || set.isPending}
            onClick={() => {
              setMessage('')
              set.mutate({ offeringId, userId, role }, {
                onSuccess: () => setUserId(''), onError: failure,
              })
            }}>
            {t('adminViews.catalog.add')}
          </Button>
        </div>
      )}
      <span role="status" className="text-sm text-error">{message}</span>
    </div>
  )
}
