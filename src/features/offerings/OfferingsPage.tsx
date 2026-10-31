import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { readableError } from '@/features/courses/schemas'
import { useOfferings } from './api'

export function OfferingsPage() {
  const { search } = useLocation()
  const { t } = useTranslation()
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useOfferings(tenantId)

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{t('teacherOfferings.title')}</h1>
        {supabase && tenantId && (
          <Link to={{ pathname: 'nueva', search }} className="inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline-3">
            {t('teacherOfferings.create')}
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
      ) : query.data.length === 0 ? (
        <EmptyState title={t('teacherOfferings.empty')} description={t('teacherOfferings.emptyHint')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((offering) => (
            <Card key={offering.id} className="grid gap-2">
              <h2 className="text-lg font-bold">{offering.title}</h2>
              <p>{offering.code} · {offering.clientName}</p>
              <Badge>{t(`teacherOfferings.status.${offering.status}`)}</Badge>
              <p className="text-sm">
                {offering.starts_at
                  ? new Date(offering.starts_at).toLocaleDateString('es-PE')
                  : '—'} – {offering.ends_at
                  ? new Date(offering.ends_at).toLocaleDateString('es-PE')
                  : '—'}
              </p>
              <p className="text-sm">
                {t('teacherOfferings.seatsUsed', {
                  used: offering.usedSeats, total: offering.seats ?? '∞',
                })}
              </p>
              <Link to={{ pathname: offering.id, search }} className="inline-flex min-h-11 items-center font-semibold text-brand underline focus-visible:outline-3">
                {t('teacherOfferings.open')}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
