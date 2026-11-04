import { useTranslation } from 'react-i18next'
import { Button, Card, Skeleton } from '@/components/ui'
import { useOutline } from '@/features/offerings/api'
import { useCanIssueCertificates, useOfferingCertificates } from './certificates-api'
import { CertificateRuleForm } from './CertificateRuleForm'
import { CertificateRoster } from './CertificateRoster'
import { SignersPicker } from './SignersPicker'

export function CertificatesTab({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const outline = useOutline(offeringId, true)
  const certificates = useOfferingCertificates(offeringId)
  const canIssue = useCanIssueCertificates(offeringId)

  if (certificates.isPending) return <Skeleton className="h-48" />
  if (certificates.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{certificates.error.message}</p>
        <Button variant="secondary" className="w-fit" onClick={() => void certificates.refetch()}>
          {t('retry')}
        </Button>
      </Card>
    )
  }

  return (
    <div className="grid gap-6">
      <SignersPicker offeringId={offeringId} />
      {outline.isError && <p role="alert">{outline.error.message}</p>}
      {outline.isPending
        ? <Skeleton className="h-40" />
        : <CertificateRuleForm offeringId={offeringId} outline={outline.data} />}
      <section className="grid gap-3" aria-labelledby="certificate-roster-title">
        <h2 id="certificate-roster-title" className="text-xl font-bold">
          {t('certificates.rosterTitle')}
        </h2>
        {canIssue.data === false && (
          <p className="text-text-muted">{t('certificates.issueByCoordinator')}</p>
        )}
        <CertificateRoster offeringId={offeringId} rows={certificates.data}
          canIssue={canIssue.data === true} />
      </section>
    </div>
  )
}
