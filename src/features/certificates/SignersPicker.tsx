import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { useOfferingSigners, useSaveOfferingSigners, useSigners } from './signers-api'

export function SignersPicker({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const location = useLocation()
  const tenantId = useTenantAccess().active?.tenant_id
  const signers = useSigners(tenantId)
  const selectedQuery = useOfferingSigners(offeringId)
  const save = useSaveOfferingSigners(offeringId)
  const [draft, setDraft] = useState<string[] | null>(null)

  if (signers.isPending || selectedQuery.isPending) {
    return <Card role="status"><Skeleton className="h-40" /></Card>
  }
  if (signers.isError || selectedQuery.isError) {
    const message = signers.isError ? signers.error.message
      : selectedQuery.isError ? selectedQuery.error.message : ''
    return <Card><p role="alert">{message}</p></Card>
  }
  if (signers.data.length === 0) {
    return (
      <Card className="grid gap-2">
        <h2 className="text-lg font-bold">{t('certificates.signers.pickerTitle')}</h2>
        <p>{t('certificates.signers.noSigners')}</p>
        <Link to={{ pathname: '../certificados', search: location.search }}
          className="inline-flex min-h-11 items-center text-brand underline">
          {t('certificates.signers.manageSigners')}
        </Link>
      </Card>
    )
  }

  const saved = selectedQuery.data
  const selected = draft ?? saved
  const full = selected.length >= 2
  const changed = selected.length !== saved.length ||
    selected.some((id, index) => id !== saved[index])

  function toggle(id: string, checked: boolean) {
    if (checked) {
      if (selected.length < 2 && !selected.includes(id)) setDraft([...selected, id])
      return
    }
    setDraft(selected.filter((value) => value !== id))
  }

  function swap() {
    if (selected.length === 2) setDraft([selected[1]!, selected[0]!])
  }

  async function submit() {
    await save.mutateAsync(selected)
    setDraft(null)
  }

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="text-lg font-bold">{t('certificates.signers.pickerTitle')}</h2>
        <p className="text-sm text-text-muted">{t('certificates.signers.pickerHint')}</p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="sr-only">{t('certificates.signers.pickerTitle')}</legend>
        {signers.data.map((signer) => {
          const index = selected.indexOf(signer.id)
          const checked = index >= 0
          return (
            <div key={signer.id} className="flex flex-wrap items-center gap-3">
              <label className="flex min-h-11 flex-1 items-center gap-3">
                <input type="checkbox" className="size-5 accent-brand"
                  checked={checked} disabled={!checked && full}
                  onChange={(event) => toggle(signer.id, event.target.checked)} />
                <span>{signer.full_name}{signer.title ? ` · ${signer.title}` : ''}</span>
              </label>
              {checked && (
                <span className="text-sm font-semibold">
                  {t(index === 0 ? 'certificates.signers.firstOrder' : 'certificates.signers.secondOrder')}
                </span>
              )}
            </div>
          )
        })}
      </fieldset>
      {selected.length === 2 && (
        <Button variant="secondary" className="w-fit" onClick={swap}>
          {t('certificates.signers.swap')}
        </Button>
      )}
      <p className="text-sm text-text-muted">{t('certificates.signers.issuedHint')}</p>
      <div aria-live="polite">
        {save.isError && <p role="alert">{t('certificates.signers.saveError')}</p>}
        {save.isSuccess && !changed && <p>{t('certificates.signers.saved')}</p>}
      </div>
      <Button className="w-fit" disabled={!changed || save.isPending}
        onClick={() => void submit()}>
        {save.isPending ? t('certificates.signers.saving') : t('certificates.signers.save')}
      </Button>
    </Card>
  )
}
