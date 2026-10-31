import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'
import { useSignatureUrl, type Signer } from './signers-api'

export function SignerCard({
  signer, onEdit, onDelete, onUpload, onRemoveSignature,
}: {
  signer: Signer
  onEdit: () => void
  onDelete: () => void
  onUpload: (file: File) => Promise<void>
  onRemoveSignature: () => Promise<void>
}) {
  const { t } = useTranslation()
  const preview = useSignatureUrl(signer.signature_path)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'certificates.signers.actionError')
    }
  }

  return (
    <Card className="grid content-start gap-3">
      <div>
        <h2 className="text-lg font-bold">{signer.full_name}</h2>
        {signer.title && <p className="text-sm text-text-muted">{signer.title}</p>}
      </div>
      <div className="flex min-h-20 items-center justify-center rounded-control border border-border bg-white p-3">
        {preview.isPending && signer.signature_path
          ? <span role="status" className="text-sm text-slate-600">{t('certificates.signers.previewLoading')}</span>
          : preview.data
            ? <img src={preview.data} alt={t('certificates.signers.signatureAlt', {
              name: signer.full_name,
            })} className="max-h-16 max-w-full object-contain" />
            : <span className="text-sm text-slate-600">{t('certificates.signers.noSignature')}</span>}
      </div>
      {preview.isError && <p role="alert">{preview.error.message}</p>}
      {error && <p role="alert" className="text-error">{t(error)}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onEdit}>{t('certificates.signers.edit')}</Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border px-4 text-sm font-semibold focus-within:outline-3">
          {t(signer.signature_path
            ? 'certificates.signers.changeSignature'
            : 'certificates.signers.uploadSignature')}
          <input className="sr-only" type="file" accept="image/png,image/jpeg"
            aria-label={t(signer.signature_path
              ? 'certificates.signers.changeSignature'
              : 'certificates.signers.uploadSignature')}
            onChange={(event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              input.value = ''
              if (file) void run(() => onUpload(file))
            }} />
        </label>
        {signer.signature_path && (
          <Button variant="secondary" onClick={() => void run(onRemoveSignature)}>
            {t('certificates.signers.removeSignature')}
          </Button>
        )}
        <Button variant="destructive" onClick={onDelete}>{t('certificates.signers.delete')}</Button>
      </div>
    </Card>
  )
}
