import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { shownEmail } from '@/lib/placeholder-email'
import { useMyStudents } from './global-api'
import { filterStudents, studentClients, studentLabel } from './global-utils'

const PAGE = 50

export function GlobalStudentsPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useMyStudents(tenantId)
  const [text, setText] = useState('')
  const [client, setClient] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const all = query.data ?? []
  const clients = studentClients(all)
  const list = filterStudents(all, text, client)

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-bold">{t('globalViews.students.title')}</h1>
      <p className="text-text-muted">{t('globalViews.students.hint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 max-w-md flex-1">
          <Input label={t('globalViews.students.search')} value={text}
            onChange={(event) => { setText(event.target.value); setLimit(PAGE) }} />
        </div>
        {clients.length > 1 && (
          <label className="grid gap-1.5 text-sm font-semibold">
            {t('globalViews.students.client')}
            <select value={client}
              onChange={(event) => { setClient(event.target.value); setLimit(PAGE) }}
              className="min-h-11 rounded-control border border-border bg-transparent px-2 font-normal">
              <option value="">{t('globalViews.students.allClients')}</option>
              {clients.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      {query.isPending ? <Skeleton className="h-48" /> :
        query.isError ? (
          <Card className="grid gap-3">
            <p role="alert">{t('globalViews.loadError')}</p>
            <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          </Card>
        ) : all.length === 0 ? (
          <EmptyState title={t('globalViews.students.empty')}
            description={t('globalViews.students.emptyHint')} />
        ) : list.length === 0 ? (
          <EmptyState title={t('globalViews.students.noMatches')} />
        ) : (
          <>
            <p className="text-sm text-text-muted" role="status">
              {t('globalViews.students.count', { count: list.length })}
            </p>
            <ul className="grid gap-3">
              {list.slice(0, limit).map((student) => {
                const contact = [shownEmail(student.email), student.phone,
                  student.job_title, student.company].filter(Boolean).join(' · ')
                return (
                  <li key={student.user_id}>
                    <Card className="grid gap-2">
                      <h2 className="font-semibold">{studentLabel(student)}</h2>
                      {contact && <p className="text-sm text-text-muted">{contact}</p>}
                      <ul className="grid gap-1 text-sm">
                        {student.editions.map((edition) => (
                          <li key={edition.enrollment_id} className="flex flex-wrap items-center gap-2">
                            <Link to={{ pathname: `/docente/ediciones/${edition.offering_id}`, search }}
                              className="text-brand underline">
                              {edition.title}
                            </Link>
                            <span className="text-text-muted">· {edition.client_name}</span>
                            <Badge status={edition.status === 'active' || edition.status === 'completed'
                              ? 'success' : edition.status === 'dropped' ? 'neutral' : 'warning'}>
                              {t(`teacherOfferings.enrollmentStatus.${edition.status}`)}
                            </Badge>
                            <span className="text-text-muted">
                              {t('globalViews.students.progress', { pct: Math.round(edition.progress_pct) })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </li>
                )
              })}
            </ul>
            {list.length > limit && (
              <Button variant="secondary" className="w-fit" onClick={() => setLimit(limit + PAGE)}>
                {t('globalViews.students.more')}
              </Button>
            )}
          </>
        )}
    </section>
  )
}
