import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'

export function SignerDeleteDialog({
  name, pending, error, onClose, onConfirm,
}: {
  name: string
  pending: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="signer-delete-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-lg gap-4">
        <h2 id="signer-delete-title" className="text-xl font-bold">
          {t('certificates.signers.deleteTitle')}
        </h2>
        <p>{t('certificates.signers.confirmDelete', { name })}</p>
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? t('certificates.signers.deleting') : t('certificates.signers.delete')}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t('certificates.cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
