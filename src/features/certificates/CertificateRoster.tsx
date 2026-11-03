import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, EmptyState } from '@/components/ui'
import type { Status } from '@/components/ui/Badge'
import {
  downloadCertificate, useIssueCertificate, useRenderCertificate,
  useReissueCertificate, useRevokeCertificate,
  type OfferingCertificate,
} from './certificates-api'
import { unmetMessageKeys } from './certificates-utils'
import { CertificateReasonDialog } from './CertificateReasonDialog'
import { shownEmail } from '@/lib/placeholder-email'

type Dialog = { kind: 'revoke' | 'reissue'; certificateId: string } | null

const BADGE: Record<string, Status> = {
  incomplete: 'warning', ready: 'info', generating: 'info',
  issued: 'success', revoked: 'error', reissued: 'neutral',
}

function statusKey(row: OfferingCertificate): string {
  const certificate = row.certificate
  if (!certificate) return row.completion.met ? 'ready' : 'incomplete'
  if (certificate.status === 'revoked') return 'revoked'
  if (certificate.status === 'reissued') return 'reissued'
  if (certificate.status === 'pending_render') return 'generating'
  return 'issued'
}

export function CertificateRoster({
  offeringId, rows,
}: { offeringId: string; rows: OfferingCertificate[] }) {
  const { t } = useTranslation()
  const issue = useIssueCertificate(offeringId)
  const render = useRenderCertificate(offeringId)
  const revoke = useRevokeCertificate(offeringId)
  const reissue = useReissueCertificate(offeringId)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [actionError, setActionError] = useState('')

  async function run(action: () => Promise<{ renderError: string | null }>) {
    setActionError('')
    try {
      const result = await action()
      if (result.renderError) setActionError(result.renderError)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('certificates.actionError'))
    }
  }

  async function confirmReason(reason: string) {
    if (!dialog) return
    if (dialog.kind === 'revoke') {
      await revoke.mutateAsync({ certificateId: dialog.certificateId, reason })
      return
    }
    const result = await reissue.mutateAsync({ certificateId: dialog.certificateId, reason })
    if (result.renderError) setActionError(result.renderError)
  }

  if (rows.length === 0) {
    return <EmptyState title={t('certificates.noStudents')} description="" />
  }

  return (
    <div className="grid gap-4">
      <div role="status" aria-live="polite">
        {actionError && <p role="alert" className="text-error">{actionError}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <caption className="sr-only">{t('certificates.rosterTitle')}</caption>
          <thead><tr>
            <th scope="col" className="py-2 pr-3">{t('certificates.student')}</th>
            <th scope="col" className="py-2 pr-3">{t('certificates.completion')}</th>
            <th scope="col" className="py-2 pr-3">{t('certificates.certificate')}</th>
            <th scope="col" className="py-2">{t('certificates.actions')}</th>
          </tr></thead>
          <tbody>{rows.map((row) => {
            const certificate = row.certificate
            const status = statusKey(row)
            const retryable = !!certificate && (certificate.status === 'pending_render' ||
              (certificate.status === 'issued' && !certificate.pdf_path))
            const unmet = row.completion.unmet
            return (
              <tr key={row.enrollment_id} className="border-t border-border align-top">
                <th scope="row" className="py-3 pr-3 font-semibold">
                  {row.full_name.trim() || row.email}
                  <span className="block text-sm font-normal text-text-muted">{shownEmail(row.email)}</span>
                </th>
                <td className="py-3 pr-3">
                  <Badge status={BADGE[status] ?? 'neutral'}>{t(`certificates.status.${status}`)}</Badge>
                  {!certificate && !row.completion.met && (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {unmetMessageKeys(unmet).map((key, index) => (
                        <li key={`${key}-${index}`}>{t(key, {
                          required: unmet[index]?.required,
                          actual: unmet[index]?.actual ?? '—',
                          title: unmet[index]?.title,
                        })}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-3 pr-3 text-sm">
                  {certificate?.code && (
                    <a className="text-brand underline" href={`/c/${encodeURIComponent(certificate.code)}`}>
                      {certificate.code}
                    </a>
                  )}
                  {certificate?.last_render_error && (
                    <p className="text-error">{certificate.last_render_error}</p>
                  )}
                  {certificate?.status === 'revoked' && certificate.revoked_reason && (
                    <p className="text-text-muted">{certificate.revoked_reason}</p>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {!certificate && row.completion.met && (
                      <Button disabled={issue.isPending}
                        onClick={() => void run(() => issue.mutateAsync(row.enrollment_id))}>
                        {t('certificates.issue')}
                      </Button>
                    )}
                    {certificate?.pdf_path && certificate.status === 'issued' && (
                      <Button variant="secondary"
                        onClick={() => void run(async () => {
                          await downloadCertificate(certificate.pdf_path!)
                          return { renderError: null }
                        })}>
                        {t('certificates.download')}
                      </Button>
                    )}
                    {certificate && retryable && (
                      <Button variant="secondary" disabled={render.isPending}
                        onClick={() => void run(() => render.mutateAsync(certificate.id))}>
                        {t('certificates.retryRender')}
                      </Button>
                    )}
                    {certificate && (certificate.status === 'issued' || certificate.status === 'pending_render') && (
                      <Button variant="destructive"
                        onClick={() => setDialog({ kind: 'revoke', certificateId: certificate.id })}>
                        {t('certificates.revoke')}
                      </Button>
                    )}
                    {certificate && (certificate.status === 'issued' || certificate.status === 'revoked') && (
                      <Button variant="secondary"
                        onClick={() => setDialog({ kind: 'reissue', certificateId: certificate.id })}>
                        {t('certificates.reissue')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {dialog && (
        <CertificateReasonDialog
          title={t(dialog.kind === 'revoke' ? 'certificates.revokeTitle' : 'certificates.reissueTitle')}
          confirmLabel={t(dialog.kind === 'revoke' ? 'certificates.revoke' : 'certificates.reissue')}
          pending={revoke.isPending || reissue.isPending}
          onClose={() => setDialog(null)} onConfirm={confirmReason} />
      )}
    </div>
  )
}
