import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Input, Skeleton } from '@/components/ui'
import { useTenant } from '@/app/TenantContext'
import { useVerifyCertificate } from './certificates-api'
import { normalizeCertificateCode } from './certificates-utils'

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('es-PE', { timeZone: 'UTC', dateStyle: 'long' })
}

function VerificationResult({ code }: { code: string }) {
  const { t } = useTranslation()
  const query = useVerifyCertificate(code)
  if (query.isPending) return <Skeleton className="h-48" />
  if (query.isError) return <Card><p role="alert">{query.error.message}</p></Card>
  if (!query.data) {
    return <Card><p role="status">{t('certificates.verify.notFound')}</p></Card>
  }

  const certificate = query.data
  const valid = certificate.status === 'issued'
  return (
    <Card className="grid gap-3" aria-live="polite">
      <h2 className="text-xl font-bold">
        {t(`certificates.verify.status.${certificate.status}`)}
      </h2>
      {certificate.status === 'revoked' &&
        <p role="alert">{t('certificates.verify.revokedNotice')}</p>}
      {certificate.status === 'reissued' &&
        <p role="alert">{t('certificates.verify.reissuedNotice')}</p>}
      {valid && (
        <dl className="grid gap-2">
          <div><dt className="text-sm text-text-muted">{t('certificates.verify.holder')}</dt>
            <dd className="font-semibold">{certificate.holder_name}</dd></div>
          <div><dt className="text-sm text-text-muted">{t('certificates.verify.course')}</dt>
            <dd className="font-semibold">{certificate.course_title}</dd></div>
          {certificate.hours !== null && (
            <div><dt className="text-sm text-text-muted">{t('certificates.verify.hours')}</dt>
              <dd>{certificate.hours}</dd></div>
          )}
          {certificate.instructor_name && (
            <div><dt className="text-sm text-text-muted">{t('certificates.verify.instructor')}</dt>
              <dd>{certificate.instructor_name}</dd></div>
          )}
          <div><dt className="text-sm text-text-muted">{t('certificates.verify.issuedAt')}</dt>
            <dd>{formatDate(certificate.issued_at)}</dd></div>
          <div><dt className="text-sm text-text-muted">{t('certificates.verify.issuers')}</dt>
            <dd>{certificate.issuers.map((issuer) => issuer.name).join(' · ')}</dd></div>
        </dl>
      )}
    </Card>
  )
}

export function VerifyCertificatePage() {
  const { t } = useTranslation()
  const brand = useTenant()
  const navigate = useNavigate()
  const { code: routeCode } = useParams()
  const [input, setInput] = useState('')
  const code = routeCode ? normalizeCertificateCode(routeCode) : ''

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeCertificateCode(input)
    if (normalized) {
      void navigate(`/c/${encodeURIComponent(normalized)}${location.search}`)
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-6 p-5">
      <div className="flex items-center gap-3">
        <span role="img" aria-label={brand.logos.alt}
          className="flex h-11 w-11 items-center justify-center rounded-control bg-brand font-bold text-brand-on">
          {brand.logos.mark}
        </span>
        <span className="font-heading font-bold">{brand.name}</span>
      </div>
      <h1 className="font-heading text-2xl font-bold">{t('certificates.verify.title')}</h1>
      <form className="grid gap-3" onSubmit={submit}>
        <Input id="certificate-code" label={t('certificates.verify.code')}
          value={input} onChange={(event) => setInput(event.target.value)}
          autoComplete="off" autoCapitalize="characters" />
        <Button type="submit" disabled={!normalizeCertificateCode(input)}>
          {t('certificates.verify.submit')}
        </Button>
      </form>
      {code && <VerificationResult code={code} />}
      <Link to={`/${location.search}`} className="text-brand underline">
        {t('certificates.verify.home')}
      </Link>
    </main>
  )
}
