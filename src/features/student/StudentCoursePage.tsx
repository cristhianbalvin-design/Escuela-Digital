import { Check, Lock } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Progress, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import {
  studentErrorKey, useStudentCourses, useStudentOutline, useStudentProgress,
} from './api'
import { formatUnlockDate, nextLesson, type OutlineModule } from './utils'
import { MyGradesPanel } from './MyGradesPanel'

export function lockedReason(
  module: OutlineModule,
  timezone: string,
  t: (key: string, options?: { date: string }) => string,
): string {
  const date = formatUnlockDate(module.unlock_at, timezone)
  if (!date) return t('student.locked')
  return t(module.locked_reason === 'not_started'
    ? 'student.notStarted' : 'student.scheduled', { date })
}

export function StudentCoursePage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { offeringId } = useParams()
  const userId = useAuth().user?.id
  const tenantId = useTenantAccess().active?.tenant_id
  const courses = useStudentCourses(tenantId, userId)
  const course = courses.data?.find((item) => item.offering.id === offeringId)
  const hasAccess = course?.enrollment.status === 'active' ||
    course?.enrollment.status === 'completed'
  const outline = useStudentOutline(offeringId, !!course && hasAccess)
  const progress = useStudentProgress(course?.enrollment.id, !!course && hasAccess)
  const completed = new Set(progress.data?.filter((item) => item.status === 'completed')
    .map((item) => item.lesson_id) ?? [])
  const continuation = nextLesson(outline.data ?? [], completed)

  if (!supabase || !tenantId) {
    return <EmptyState title={t('teacherCommon.connect')}
      description={t('teacherCommon.connectHint')} />
  }
  if (courses.isPending) return <Skeleton className="h-64" />
  if (courses.isError) {
    return <Card className="grid gap-3">
      <p role="alert">{t(studentErrorKey(courses.error))}</p>
      <Button onClick={() => void courses.refetch()}>{t('retry')}</Button>
    </Card>
  }
  if (!course) return <EmptyState title={t('student.courseUnavailable')}
    description={t('student.courseUnavailableHint')} />

  return (
    <section className="grid gap-5">
      <Link to={{ pathname: '/estudiante/cursos', search }}
        className="inline-flex min-h-11 w-fit items-center text-brand underline focus-visible:outline-3">
        {t('teacherCommon.back')}
      </Link>
      <Card className="grid gap-4">
        <h1 className="font-heading text-2xl font-bold">{course.offering.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>{t(`teacherOfferings.status.${course.offering.status}`)}</Badge>
          <Badge status={hasAccess ? 'success' : 'warning'}>
            {t(`teacherOfferings.enrollmentStatus.${course.enrollment.status}`)}
          </Badge>
        </div>
        <Progress value={course.enrollment.progress_pct}
          label={t('student.courseProgress')} />
        {continuation && (
          <Link
            to={{ pathname: `/estudiante/cursos/${offeringId}/lecciones/${continuation.id}`, search }}
            className="inline-flex min-h-11 w-fit items-center rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline-3"
          >
            {t('student.continue')}
          </Link>
        )}
      </Card>
      {!hasAccess ? (
        <EmptyState title={t('student.noAccessTitle')}
          description={t('student.noContentAccess')} />
      ) : outline.isPending || progress.isPending ? (
        <><Skeleton className="h-36" /><Skeleton className="h-36" /></>
      ) : outline.isError || progress.isError ? (
        <Card className="grid gap-3">
          <p role="alert">{t(studentErrorKey(outline.error ?? progress.error))}</p>
          <Button onClick={() => {
            void outline.refetch()
            void progress.refetch()
          }}>{t('retry')}</Button>
        </Card>
      ) : outline.data.length === 0 ? (
        <EmptyState title={t('student.noLessons')}
          description={t('student.noLessonsHint')} />
      ) : (
        <div className="grid gap-3">
          <MyGradesPanel enrollmentId={course.enrollment.id} />
          <h2 className="text-xl font-bold">{t('student.content')}</h2>
          {outline.data.map((module) => (
            <details key={module.id} className="rounded-card border border-border bg-surface p-4">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold focus-visible:outline-3">
                {module.locked && <Lock aria-hidden="true" size={18} />}
                {module.title}
              </summary>
              {module.locked && (
                <p className="mt-2 text-sm text-text-muted">
                  {lockedReason(module, course.offering.timezone, t)}
                </p>
              )}
              <ul className="mt-3 grid gap-2">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id} className="rounded-control border border-border p-2">
                    {module.locked || lesson.locked ? (
                      <span className="flex min-h-11 items-center gap-2 text-text-muted">
                        <Lock aria-hidden="true" size={18} />
                        {lesson.title}
                      </span>
                    ) : (
                      <Link
                        to={{
                          pathname: `/estudiante/cursos/${offeringId}/lecciones/${lesson.id}`,
                          search,
                        }}
                        className="flex min-h-11 items-center gap-2 text-brand focus-visible:outline-3"
                      >
                        {completed.has(lesson.id) && <Check aria-hidden="true" size={18} />}
                        {lesson.title}
                        {completed.has(lesson.id) &&
                          <span className="sr-only">{t('student.completedLesson')}</span>}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
