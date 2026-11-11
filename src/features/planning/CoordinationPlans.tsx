import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTenantAccess } from '@/features/tenants'
import { useOfferings } from '@/features/offerings/api'
import { PlanningTab } from './PlanningTab'

export function CoordinationPlans() {
  const { t } = useTranslation(); const { search } = useLocation(); const tenantId = useTenantAccess().active?.tenant_id; const query = useOfferings(tenantId)
  return <section className="grid gap-4"><h1 className="text-2xl font-bold">{t('planning.tab')}</h1>{query.isPending ? <p>{t('planning.loading')}</p> : query.isError ? <p role="alert">{t('planning.error')}</p> : query.data.length === 0 ? <p>{t('planning.noOfferings')}</p> : <ul className="grid gap-2">{query.data.map((offering) => <li key={offering.id} className="rounded-control border border-border p-4"><Link className="font-semibold underline" to={{ pathname: offering.id, search }}>{offering.title}</Link></li>)}</ul>}</section>
}
export function CoordinationPlanDetail() {
  const { offeringId } = useParams(); const { t } = useTranslation(); const { search } = useLocation()
  return <section className="grid gap-4"><Link className="underline" to={{ pathname: '/coordinador/guias', search }}>{t('planning.back')}</Link><h1 className="text-2xl font-bold">{t('planning.tab')}</h1>{offeringId && <PlanningTab offeringId={offeringId} />}</section>
}
