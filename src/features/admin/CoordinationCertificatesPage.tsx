import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { AdminCertificatesPage } from './AdminCertificatesPage'

/** Vista de coordinación: quien puede emitir revisa y emite los certificados de toda la escuela. */
export function CoordinationCertificatesPage() {
  const { t } = useTranslation()
  const access = useTenantAccess()
  if (!access.views.admin && !access.views.teacher) {
    return <EmptyState title={t('adminViews.coordination.soon')} description={t('adminViews.coordination.soonHint')} />
  }
  return <AdminCertificatesPage showSigners={false} />
}
