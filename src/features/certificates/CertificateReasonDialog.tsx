import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from '@/components/ui'

export function CertificateReasonDialog({
  title, confirmLabel, pending, onClose, onConfirm,
}: {
  title: string
  confirmLabel: string
  pending: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    if (reason.trim().length < 3) {
      setError(t('certificates.reasonRequired'))
      return
    }
    setError('')
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('certificates.actionError'))
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="certificate-reason-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-lg gap-4">
        <h2 id="certificate-reason-title" className="text-xl font-bold">{title}</h2>
        <Input id="certificate-reason" label={t('certificates.reason')}
          value={reason} onChange={(event) => setReason(event.target.value)}
          error={error || undefined} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => void submit()}>{confirmLabel}</Button>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t('certificates.cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
