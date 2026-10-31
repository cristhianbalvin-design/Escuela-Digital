import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Progress, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { studentErrorKey, useStudentCourses, type StudentCourse } from './api'

type Tab = 'current' | 'completed' | 'upcoming'

function tabFor(course: StudentCourse): Tab {
  if (course.enrollment.status === 'completed') return 'completed'
  if (course.enrollment.status === 'pending' ||
    (course.offering.starts_at !== null &&
      Date.parse(course.offering.starts_at) > Date.now())) return 'upcoming'
  return 'current'
}

export function StudentCoursesPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const userId = useAuth().user?.id
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useStudentCourses(tenantId, userId)
  const [tab, setTab] = useState<Tab>('current')

  if (!supabase || !tenantId) {
    return <EmptyState title={t('teacherCommon.connect')}
      description={t('teacherCommon.connectHint')} />
  }

  const visible = query.data?.filter((course) => tabFor(course) === tab) ?? []

  return (
    <section className="grid gap-5">
      <h1 className="font-heading text-2xl font-bold">{t('student.myCourses')}</h1>
      <div role="tablist" aria-label={t('student.courseTabs')} className="flex flex-wrap gap-2">
        {(['current', 'completed', 'upcoming'] as const).map((item) => (
          <Button key={item} role="tab" aria-selected={tab === item}
            variant={tab === item ? 'primary' : 'secondary'}
            onClick={() => setTab(item)}>
            {t(`student.tabs.${item}`)}
          </Button>
        ))}
      </div>
      <div role="tabpanel" className="grid gap-4">
        {query.isPending ? (
          <><Skeleton className="h-40" /><Skeleton className="h-40" /></>
        ) : query.isError ? (
          <Card className="grid gap-3">
            <p role="alert">{t(studentErrorKey(query.error))}</p>
            <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
          </Card>
        ) : visible.length === 0 ? (
          <EmptyState title={t('student.emptyTab')}
            description={t('student.emptyTabHint')} />
        ) : visible.map(({ enrollment, offering }) => {
          const hasAccess = enrollment.status === 'active' ||
            enrollment.status === 'completed'
          return (
            <Card key={enrollment.id} className="grid gap-4">
              <h2 className="text-lg font-bold">{offering.title}</h2>
              <p className="text-sm text-text-muted">{offering.code}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>{t(`teacherOfferings.status.${offering.status}`)}</Badge>
                <Badge status={hasAccess ? 'success' : 'warning'}>
                  {t(`teacherOfferings.enrollmentStatus.${enrollment.status}`)}
                </Badge>
              </div>
              <Progress value={enrollment.progress_pct}
                label={t('student.courseProgress')} />
              {!hasAccess && (
                <p className="text-sm text-text-muted">
                  {t('student.noContentAccess')}
                </p>
              )}
              <Link
                to={{ pathname: `/estudiante/cursos/${offering.id}`, search }}
                className="inline-flex min-h-11 w-fit items-center rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline-3"
              >
                {t('student.open')}
              </Link>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
