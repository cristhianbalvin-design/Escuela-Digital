import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import type { Status } from '@/components/ui/Badge'
import { downloadCertificate } from '@/features/certificates/certificates-api'
import { SignersPage } from '@/features/certificates'
import { useTenantAccess } from '@/features/tenants'
import { useTenantCertificates } from './admin-api'
import { certificateStatusKey, filterByText } from './admin-utils'
import { IssuePanel } from './IssuePanel'

const BADGE: Record<string, Status> = {
  issued: 'success', revoked: 'error', reissued: 'neutral', generating: 'info',
}

export function AdminCertificatesPage({ showSigners = true }: { showSigners?: boolean }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const tenantId = useTenantAccess().active?.tenant_id
  const [tab, setTab] = useState<'pending' | 'issued' | 'signers'>('pending')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const query = useTenantCertificates(tab === 'issued' ? tenantId : undefined)
  const rows = filterByText(query.data ?? [], text,
    (row) => `${row.student_name} ${row.code} ${row.course_title} ${row.offering_title} ${row.client_name}`)

  async function download(path: string) {
    setError('')
    try {
      await downloadCertificate(path)
    } catch {
      setError(t('adminViews.certificates.downloadError'))
    }
  }

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-bold">{t('adminViews.certificates.title')}</h1>
      <div role="tablist" aria-label={t('adminViews.certificates.title')} className="flex flex-wrap gap-2">
        {(showSigners ? (['pending', 'issued', 'signers'] as const) : (['pending', 'issued'] as const)).map((item) => (
          <Button key={item} role="tab" aria-selected={tab === item}
            variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>
            {t(`adminViews.certificates.tab.${item}`)}
          </Button>
        ))}
      </div>

      {tab === 'signers' ? <SignersPage /> : tab === 'pending' ? <IssuePanel tenantId={tenantId} /> : (
        <>
          <p className="text-text-muted">{t('adminViews.certificates.hint')}</p>
          <div className="max-w-md">
            <Input label={t('adminViews.certificates.search')} value={text}
              onChange={(event) => setText(event.target.value)} />
          </div>
          <span role="status" className="text-sm text-error">{error}</span>
          {query.isPending ? <Skeleton className="h-48" /> :
            query.isError ? (
              <Card className="grid gap-3">
                <p role="alert">{t('adminViews.loadError')}</p>
                <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>{t('retry')}</Button>
              </Card>
            ) : query.data.length === 0 ? (
              <EmptyState title={t('adminViews.certificates.empty')}
                description={t('adminViews.certificates.emptyHint')} />
            ) : rows.length === 0 ? (
              <EmptyState title={t('adminViews.certificates.noMatches')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <caption className="sr-only">{t('adminViews.certificates.title')}</caption>
                  <thead><tr>
                    <th scope="col" className="py-2 pr-3">{t('adminViews.certificates.holder')}</th>
                    <th scope="col" className="py-2 pr-3">{t('adminViews.certificates.course')}</th>
                    <th scope="col" className="py-2 pr-3">{t('adminViews.certificates.code')}</th>
                    <th scope="col" className="py-2 pr-3">{t('adminViews.certificates.issuedAt')}</th>
                    <th scope="col" className="py-2 pr-3">{t('adminViews.certificates.status')}</th>
                    <th scope="col" className="py-2">{t('adminViews.certificates.actions')}</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((row) => {
                      const key = certificateStatusKey(row.status)
                      return (
                        <tr key={row.id} className="border-t border-border align-top">
                          <th scope="row" className="py-2 pr-3 font-semibold">{row.student_name}</th>
                          <td className="py-2 pr-3">
                            <Link to={{ pathname: `/docente/ediciones/${row.offering_id}`, search }}
                              className="text-brand underline">{row.offering_title}</Link>
                            <span className="block text-text-muted">{row.client_name}</span>
                          </td>
                          <td className="py-2 pr-3">
                            <Link to={{ pathname: `/c/${row.code}`, search }} className="text-brand underline">
                              {row.code}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{new Date(row.issued_at).toLocaleDateString('es-PE')}</td>
                          <td className="py-2 pr-3">
                            <Badge status={BADGE[key]}>{t(`adminViews.certificates.statusLabel.${key}`)}</Badge>
                          </td>
                          <td className="py-2">
                            {row.pdf_path && key !== 'revoked' && (
                              <Button variant="secondary" onClick={() => void download(row.pdf_path!)}>
                                {t('adminViews.certificates.download')}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </>
      )}
    </section>
  )
}
