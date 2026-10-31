import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from '@/components/ui'
import type { Signer } from './signers-api'

type Values = { full_name: string; title: string }

const schema = z.object({
  full_name: z.string().trim().min(2, 'certificates.signers.errors.name')
    .max(120, 'certificates.signers.errors.name'),
  title: z.string().trim().max(160, 'certificates.signers.errors.title'),
})

export function SignerFormDialog({
  signer, pending, error, onClose, onSubmit,
}: {
  signer: Signer | null
  pending: boolean
  error: string
  onClose: () => void
  onSubmit: (values: Values) => Promise<void>
}) {
  const { t } = useTranslation()
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: signer?.full_name ?? '', title: signer?.title ?? '' },
  })
  const nameError = formState.errors.full_name?.message
  const titleError = formState.errors.title?.message

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="signer-form-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-lg gap-4">
        <h2 id="signer-form-title" className="text-xl font-bold">
          {t(signer ? 'certificates.signers.editTitle' : 'certificates.signers.createTitle')}
        </h2>
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <Input id="signer-full-name" label={t('certificates.signers.name')}
            autoFocus maxLength={120} {...register('full_name')}
            error={nameError ? t(nameError) : undefined} />
          <Input id="signer-title" label={t('certificates.signers.title')}
            maxLength={160} {...register('title')}
            error={titleError ? t(titleError) : undefined} />
          {error && <p role="alert" className="text-error">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? t('certificates.signers.saving') : t('teacherCommon.save')}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              {t('certificates.cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
