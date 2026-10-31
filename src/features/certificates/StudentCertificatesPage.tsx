import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { supabase } from '@/lib/supabase'
import { downloadCertificate, useMyCertificates } from './certificates-api'
import { unmetMessageKeys } from './certificates-utils'

export function StudentCertificatesPage() {
  const { t } = useTranslation()
  const userId = useAuth().user?.id
  const query = useMyCertificates(userId)
  const [error, setError] = useState('')

  async function download(path: string) {
    setError('')
    try {
      await downloadCertificate(path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('certificates.actionError'))
    }
  }

  if (!supabase) return <EmptyState title={t('teacherCommon.connect')} description="" />
  return (
    <section className="grid gap-5">
      <h1 className="font-heading text-2xl font-bold">{t('certificates.myTitle')}</h1>
      {error && <p role="alert" className="text-error">{error}</p>}
      {query.isPending ? <Skeleton className="h-48" /> :
        query.isError ? (
          <Card className="grid gap-3">
            <p role="alert">{query.error.message}</p>
            <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          </Card>
        ) : query.data.length === 0 ? (
          <EmptyState title={t('certificates.myEmpty')} description="" />
        ) : query.data.map((item) => {
          const certificate = item.certificate
          const active = certificate && (certificate.status === 'issued' || certificate.status === 'pending_render')
          return (
            <Card key={item.enrollment_id} className="grid gap-3">
              <h2 className="text-lg font-bold">{item.course_title}</h2>
              {certificate ? (
                <>
                  <div>
                    <Badge status={certificate.status === 'issued' ? 'success'
                      : certificate.status === 'pending_render' ? 'info' : 'error'}>
                      {t(`certificates.status.${certificate.status === 'pending_render'
                        ? 'generating' : certificate.status}`)}
                    </Badge>
                  </div>
                  {active && certificate.status === 'pending_render' &&
                    <p className="text-sm text-text-muted">{t('certificates.generatingHint')}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    {certificate.pdf_path && certificate.status === 'issued' && (
                      <Button variant="secondary"
                        onClick={() => void download(certificate.pdf_path!)}>
                        {t('certificates.download')}
                      </Button>
                    )}
                    <Link className="inline-flex min-h-11 items-center text-brand underline"
                      to={`/c/${encodeURIComponent(certificate.code)}${location.search}`}>
                      {t('certificates.verifyLink')}
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold">{t('certificates.whatMissing')}</h3>
                  {item.completion.unmet.length === 0
                    ? <p>{t('certificates.notIssuedYet')}</p>
                    : (
                      <ul className="list-disc pl-5">
                        {unmetMessageKeys(item.completion.unmet).map((key, index) => (
                          <li key={`${key}-${index}`}>{t(key, {
                            required: item.completion.unmet[index]?.required,
                            actual: item.completion.unmet[index]?.actual ?? '—',
                            title: item.completion.unmet[index]?.title,
                          })}</li>
                        ))}
                      </ul>
                    )}
                </>
              )}
            </Card>
          )
        })}
    </section>
  )
}
