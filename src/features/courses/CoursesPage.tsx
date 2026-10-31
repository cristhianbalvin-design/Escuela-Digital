import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { useCourses } from './api'
import { readableError } from './schemas'

export function CoursesPage() {
  const { search: tenantSearch } = useLocation()
  const { t } = useTranslation()
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useCourses(tenantId)
  const [search, setSearch] = useState('')
  const courses = (query.data ?? []).filter((course) =>
    `${course.latest?.title ?? ''} ${course.slug}`.toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  )

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{t('teacherCourses.title')}</h1>
        {supabase && tenantId && (
          <Link to={{ pathname: 'nuevo', search: tenantSearch }} className="inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline-3">
            {t('teacherCourses.create')}
          </Link>
        )}
      </div>
      {!supabase || !tenantId ? (
        <EmptyState title={t('teacherCommon.connect')} description={t('teacherCommon.connectHint')} />
      ) : query.isPending ? (
        <div role="status" aria-label={t('teacherCommon.loading')} className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      ) : query.isError ? (
        <Card>
          <p role="alert">{readableError(query.error)}</p>
          <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
        </Card>
      ) : (
        <>
          <Input label={t('teacherCourses.search')} value={search}
            onChange={(event) => setSearch(event.target.value)} />
          {courses.length === 0 ? (
            <EmptyState title={t('teacherCourses.empty')} description={t('teacherCourses.emptyHint')} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <Card key={course.id} className="grid gap-3">
                  <h2 className="text-lg font-bold">{course.latest?.title ?? course.slug}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status={course.latest?.status === 'draft' ? 'warning' : 'success'}>
                      {course.latest?.status === 'draft'
                        ? t('teacherCommon.draft')
                        : t('teacherCommon.published')}
                    </Badge>
                    <span className="text-sm text-text-muted">
                      {t('teacherCourses.version', { number: course.latest?.version_number ?? 1 })}
                    </span>
                  </div>
                  <Link to={{ pathname: course.id, search: tenantSearch }} className="inline-flex min-h-11 items-center font-semibold text-brand underline focus-visible:outline-3">
                    {t('teacherCourses.open')}
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
