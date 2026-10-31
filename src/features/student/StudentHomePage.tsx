import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Progress, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import {
  studentErrorKey, useStudentCourses, useStudentOutline, useStudentProgress,
} from './api'
import { availableLessons, nextLesson } from './utils'

export function StudentHomePage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const user = useAuth().user
  const tenantId = useTenantAccess().active?.tenant_id
  const courses = useStudentCourses(tenantId, user?.id)
  const recent = courses.data
    ?.filter(({ enrollment }) => enrollment.status === 'active')
    .sort((a, b) => Date.parse(b.enrollment.last_activity_at ??
      b.enrollment.enrolled_at) - Date.parse(a.enrollment.last_activity_at ??
      a.enrollment.enrolled_at))[0]
  const outline = useStudentOutline(recent?.offering.id, !!recent)
  const progress = useStudentProgress(recent?.enrollment.id, !!recent)
  const completed = new Set(progress.data
    ?.filter((item) => item.status === 'completed')
    .map((item) => item.lesson_id) ?? [])
  const inProgress = availableLessons(outline.data ?? []).find((lesson) =>
    progress.data?.some((item) =>
      item.lesson_id === lesson.id && item.status === 'in_progress'))
  const continuation = inProgress ?? nextLesson(outline.data ?? [], completed)
  const greeting = user?.email?.split('@')[0] ?? t('student.learner')

  if (!supabase || !tenantId) {
    return <EmptyState title={t('teacherCommon.connect')}
      description={t('teacherCommon.connectHint')} />
  }

  return (
    <section className="grid gap-6">
      <h1 className="font-heading text-2xl font-bold">
        {t('student.greeting', { name: greeting })}
      </h1>
      {courses.isPending ? (
        <><Skeleton className="h-40" /><Skeleton className="h-48" /></>
      ) : courses.isError ? (
        <Card className="grid gap-3">
          <p role="alert">{t(studentErrorKey(courses.error))}</p>
          <Button onClick={() => void courses.refetch()}>{t('retry')}</Button>
        </Card>
      ) : (
        <>
          <Card className="grid gap-4">
            <h2 className="text-xl font-bold">{t('student.continueTitle')}</h2>
            {!recent ? (
              <p className="text-text-muted">{t('student.continueGuide')}</p>
            ) : outline.isPending || progress.isPending ? (
              <Skeleton className="h-20" />
            ) : outline.isError || progress.isError ? (
              <div className="grid gap-3">
                <p role="alert">{t(studentErrorKey(outline.error ?? progress.error))}</p>
                <Button onClick={() => {
                  void outline.refetch()
                  void progress.refetch()
                }}>{t('retry')}</Button>
              </div>
            ) : continuation ? (
              <>
                <p className="font-semibold">{recent.offering.title}</p>
                <p>{continuation.title}</p>
                <Link
                  to={{ pathname: `/estudiante/cursos/${recent.offering.id}/lecciones/${continuation.id}`, search }}
                  className="inline-flex min-h-11 w-fit items-center rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline-3"
                >
                  {t('student.continue')}
                </Link>
              </>
            ) : (
              <>
                <p className="text-text-muted">{t('student.noAvailableLesson')}</p>
                <Link
                  to={{ pathname: `/estudiante/cursos/${recent.offering.id}`, search }}
                  className="inline-flex min-h-11 w-fit items-center text-brand underline focus-visible:outline-3"
                >
                  {t('student.openCourse')}
                </Link>
              </>
            )}
          </Card>
          <div className="grid gap-4">
            <h2 className="text-xl font-bold">{t('student.myCourses')}</h2>
            {courses.data.length === 0 ? (
              <EmptyState title={t('student.noCourses')}
                description={t('student.noCoursesHint')} />
            ) : courses.data.map(({ enrollment, offering }) => (
              <Card key={enrollment.id} className="grid gap-3">
                <h3 className="font-semibold">{offering.title}</h3>
                <Progress value={enrollment.progress_pct}
                  label={t('student.courseProgress')} />
                <Link
                  to={{ pathname: `/estudiante/cursos/${offering.id}`, search }}
                  className="inline-flex min-h-11 w-fit items-center text-brand underline focus-visible:outline-3"
                >
                  {t('student.openCourse')}
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
