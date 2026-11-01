import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import {
  useCreateSigner, useDeleteSigner, useRemoveSignature, useSigners,
  useUpdateSigner, useUploadSignature, type Signer,
} from './signers-api'
import { BrandCard } from './BrandCard'
import { SignerCard } from './SignerCard'
import { SignerDeleteDialog } from './SignerDeleteDialog'
import { SignerFormDialog } from './SignerFormDialog'

export function SignersPage() {
  const { t } = useTranslation()
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useSigners(tenantId)
  const create = useCreateSigner(tenantId ?? '')
  const update = useUpdateSigner(tenantId ?? '')
  const remove = useDeleteSigner(tenantId ?? '')
  const upload = useUploadSignature(tenantId ?? '')
  const removeSignature = useRemoveSignature(tenantId ?? '')
  const [editing, setEditing] = useState<Signer | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Signer | null>(null)
  const [dialogError, setDialogError] = useState('')

  const failure = (cause: unknown) =>
    cause instanceof Error ? cause.message : t('certificates.signers.actionError')

  async function save(values: { full_name: string; title: string }) {
    setDialogError('')
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...values })
      else await create.mutateAsync(values)
      setEditing(undefined)
    } catch (cause) {
      setDialogError(failure(cause))
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDialogError('')
    try {
      await remove.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (cause) {
      setDialogError(failure(cause))
    }
  }

  if (!supabase || !tenantId) {
    return <EmptyState title={t('teacherCommon.connect')} description={t('teacherCommon.connectHint')} />
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{t('certificates.signers.pageTitle')}</h1>
        <Button onClick={() => { setDialogError(''); setEditing(null) }}>
          {t('certificates.signers.add')}
        </Button>
      </div>
      <p className="text-sm text-text-muted">{t('certificates.signers.uploadHint')}</p>
      {query.isPending ? (
        <div role="status" aria-label={t('certificates.loading')} className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" /><Skeleton className="h-48" />
        </div>
      ) : query.isError ? (
        <Card className="grid gap-3">
          <p role="alert">{query.error.message}</p>
          <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        </Card>
      ) : query.data.length === 0 ? (
        <EmptyState title={t('certificates.signers.empty')} description="" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((signer) => (
            <SignerCard key={signer.id} signer={signer}
              onEdit={() => { setDialogError(''); setEditing(signer) }}
              onDelete={() => { setDialogError(''); setDeleting(signer) }}
              onUpload={(file) => upload.mutateAsync({ signerId: signer.id, file }).then(() => undefined)}
              onRemoveSignature={() => removeSignature.mutateAsync({
                id: signer.id, path: signer.signature_path ?? '',
              })} />
          ))}
        </div>
      )}
      <p className="text-sm text-text-muted">{t('certificates.signers.editionHint')}</p>
      <BrandCard />
      {editing !== undefined && (
        <SignerFormDialog signer={editing} pending={create.isPending || update.isPending}
          error={dialogError} onClose={() => setEditing(undefined)} onSubmit={save} />
      )}
      {deleting && (
        <SignerDeleteDialog name={deleting.full_name} pending={remove.isPending}
          error={dialogError} onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()} />
      )}
    </section>
  )
}
