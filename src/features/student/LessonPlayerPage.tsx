import { useEffect, useMemo, useRef } from 'react'
import { Check, Lock } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Progress, Skeleton, useToast } from '@/components/ui'
import { LessonContent } from '@/features/courses/LessonContent'
import { LessonResources } from '@/features/resources'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import {
  studentErrorKey, useMarkLessonProgress, useStudentCourses,
  useStudentOutline, useStudentProgress,
} from './api'
import { availableLessons, formatUnlockDate, nextLesson } from './utils'
import { lessonActivity } from './activities-utils'
import { AssessmentPanel } from './AssessmentPanel'
import { AssignmentPanel } from './AssignmentPanel'

export function LessonPlayerPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const notify = useToast()
  const { offeringId, lessonId } = useParams()
  const userId = useAuth().user?.id
  const tenantId = useTenantAccess().active?.tenant_id
  const courses = useStudentCourses(tenantId, userId)
  const course = courses.data?.find((item) => item.offering.id === offeringId)
  const hasAccess = course?.enrollment.status === 'active' ||
    course?.enrollment.status === 'completed'
  const outline = useStudentOutline(offeringId, !!course && hasAccess)
  const progress = useStudentProgress(course?.enrollment.id, !!course && hasAccess)
  const mark = useMarkLessonProgress(tenantId, userId, course?.enrollment.id)
  const markedOnOpen = useRef<string | null>(null)
  const modules = outline.data ?? []
  const module = modules.find((item) =>
    item.lessons.some((lesson) => lesson.id === lessonId))
  const lesson = module?.lessons.find((item) => item.id === lessonId)
  const completed = useMemo(() => new Set(progress.data?.filter(
    (item) => item.status === 'completed').map((item) => item.lesson_id) ?? []),
  [progress.data])
  const available = availableLessons(modules)
  const position = available.findIndex((item) => item.id === lessonId)
  const previous = position > 0 ? available[position - 1] : null
  const next = nextLesson(modules, completed, lessonId)
  const { mutate } = mark
  const activity = lesson ? lessonActivity(lesson) : null

  useEffect(() => {
    if (!course || !hasAccess || !outline.isSuccess || !progress.isSuccess ||
      !lesson || !module || module.locked || lesson.locked ||
      completed.has(lesson.id)) return
    const key = `${course.enrollment.id}:${lesson.id}`
    if (markedOnOpen.current === key) return
    markedOnOpen.current = key
    mutate({ lessonId: lesson.id, status: 'in_progress' })
  }, [
    course, hasAccess, outline.isSuccess, progress.isSuccess,
    lesson, module, completed, mutate,
  ])

  async function complete() {
    if (!lesson || !offeringId) return
    try {
      await mark.mutateAsync({ lessonId: lesson.id, status: 'completed' })
      if (next) {
        navigate({
          pathname: `/estudiante/cursos/${offeringId}/lecciones/${next.id}`,
          search,
        })
      } else {
        notify(t('student.congratulations'))
        navigate({ pathname: `/estudiante/cursos/${offeringId}`, search })
      }
    } catch {
      // El mensaje traducido se muestra junto a los controles.
    }
  }

  if (!supabase || !tenantId) {
    return <EmptyState title={t('teacherCommon.connect')}
      description={t('teacherCommon.connectHint')} />
  }
  if (courses.isPending) return <Skeleton className="h-64" />
  if (courses.isError) return <Card className="grid gap-3">
    <p role="alert">{t(studentErrorKey(courses.error))}</p>
    <Button onClick={() => void courses.refetch()}>{t('retry')}</Button>
  </Card>
  if (!course) return <EmptyState title={t('student.courseUnavailable')}
    description={t('student.courseUnavailableHint')} />
  if (!hasAccess) return <EmptyState title={t('student.noAccessTitle')}
    description={t('student.noContentAccess')} />
  if (outline.isPending || progress.isPending) {
    return <><Skeleton className="h-24" /><Skeleton className="mt-4 h-64" /></>
  }
  if (outline.isError || progress.isError) return <Card className="grid gap-3">
    <p role="alert">{t(studentErrorKey(outline.error ?? progress.error))}</p>
    <Button onClick={() => {
      void outline.refetch()
      void progress.refetch()
    }}>{t('retry')}</Button>
  </Card>
  if (!lesson || !module) return <EmptyState title={t('student.lessonUnavailable')}
    description={t('student.courseUnavailableHint')} />

  const date = formatUnlockDate(module.unlock_at, course.offering.timezone)
  const lockText = date
    ? t(module.locked_reason === 'not_started'
      ? 'student.notStarted' : 'student.scheduled', { date })
    : t('student.locked')

  return (
    <section className="grid gap-5">
      <Link to={{ pathname: `/estudiante/cursos/${offeringId}`, search }}
        className="inline-flex min-h-11 w-fit items-center text-brand underline focus-visible:outline-3">
        {t('teacherCommon.back')}
      </Link>
      <Progress value={course.enrollment.progress_pct}
        label={t('student.courseProgress')} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="grid gap-5">
            <h1 className="font-heading text-2xl font-bold">{lesson.title}</h1>
            {module.locked || lesson.locked ? (
              <p className="flex items-center gap-2 text-text-muted">
                <Lock aria-hidden="true" size={18} />{lockText}
              </p>
            ) : (
              <>
                {activity?.type === 'quiz' ? (
                  <AssessmentPanel enrollmentId={course.enrollment.id}
                    assessmentId={activity.activityId} />
                ) : activity?.type === 'assignment' ? (
                  <AssignmentPanel enrollmentId={course.enrollment.id}
                    assignmentId={activity.activityId}
                    timezone={course.offering.timezone} />
                ) : lesson.content !== undefined
                  ? <LessonContent content={lesson.content} />
                  : <p>{t('student.lessonUnavailable')}</p>}
                <LessonResources lessonId={lesson.id} editable={false} />
                {mark.isError && (
                  <p role="alert">{t(studentErrorKey(mark.error))}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {previous && (
                    <Link
                      to={{
                        pathname: `/estudiante/cursos/${offeringId}/lecciones/${previous.id}`,
                        search,
                      }}
                      className="inline-flex min-h-11 items-center rounded-control border border-border px-4 font-semibold focus-visible:outline-3"
                    >
                      {t('teacherCommon.previous')}
                    </Link>
                  )}
                  {activity ? (
                    next && (
                      <Link
                        to={{
                          pathname: `/estudiante/cursos/${offeringId}/lecciones/${next.id}`,
                          search,
                        }}
                        className="inline-flex min-h-11 items-center rounded-control border border-border px-4 font-semibold focus-visible:outline-3"
                      >
                        {t('teacherCommon.next')}
                      </Link>
                    )
                  ) : (
                    <Button disabled={mark.isPending} onClick={() => void complete()}>
                      {t('student.completeAndContinue')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
        <details className="h-fit rounded-card border border-border bg-surface p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline-3">
            {t('student.courseIndex')}
          </summary>
          <div className="mt-3 grid gap-3">
            {modules.map((item) => (
              <div key={item.id} className="grid gap-1">
                <h2 className="font-semibold">{item.title}</h2>
                {item.lessons.map((entry) => (
                  item.locked || entry.locked ? (
                    <span key={entry.id} className="flex min-h-11 items-center gap-2 text-sm text-text-muted">
                      <Lock aria-hidden="true" size={16} />{entry.title}
                    </span>
                  ) : (
                    <Link key={entry.id}
                      to={{
                        pathname: `/estudiante/cursos/${offeringId}/lecciones/${entry.id}`,
                        search,
                      }}
                      aria-current={entry.id === lessonId ? 'page' : undefined}
                      className="flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-brand focus-visible:outline-3"
                    >
                      {completed.has(entry.id) && <Check aria-hidden="true" size={16} />}
                      {entry.title}
                    </Link>
                  )
                ))}
              </div>
            ))}
          </div>
        </details>
      </div>
    </section>
  )
}
