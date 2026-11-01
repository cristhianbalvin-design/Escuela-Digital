import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import {
  useBrand, useLogoUrl, useRemoveLogo, useSaveBrandColors, useUploadLogo,
} from './brand-api'
import { contrastOnWhite, normalizeHex } from './brand-utils'

type Draft = { primary: string; secondary: string }

function ColorField({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? value
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value}
          className="h-11 w-14 cursor-pointer rounded-control border border-border bg-transparent p-1"
          onChange={(event) => { setText(null); onChange(event.target.value.toUpperCase()) }} />
        <input id={id} value={shown} maxLength={7} spellCheck={false}
          className="min-h-11 w-32 rounded-control border border-border bg-surface px-3 font-mono text-sm"
          onChange={(event) => {
            setText(event.target.value)
            const hex = normalizeHex(event.target.value)
            if (hex) onChange(hex)
          }}
          onBlur={() => setText(null)} />
      </div>
    </div>
  )
}

export function BrandCard() {
  const { t } = useTranslation()
  const access = useTenantAccess().active
  const tenantId = access?.tenant_id
  const canEdit = access?.role === 'owner' || access?.role === 'admin'
  const brand = useBrand(tenantId)
  const saveColors = useSaveBrandColors(tenantId ?? '')
  const upload = useUploadLogo(tenantId ?? '')
  const removeLogo = useRemoveLogo(tenantId ?? '')
  const logoUrl = useLogoUrl(brand.data?.logoPath)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  if (!canEdit) return null
  if (brand.isPending) return <Skeleton className="h-64" />
  if (brand.isError) return <Card><p role="alert">{brand.error.message}</p></Card>

  const data = brand.data
  const savedPrimary = data.primary ?? data.schoolPrimary
  const savedSecondary = data.secondary ?? data.schoolSecondary
  const primary = draft?.primary ?? savedPrimary
  const secondary = draft?.secondary ?? savedSecondary
  const changed = primary !== savedPrimary || secondary !== savedSecondary
  const lowContrast = contrastOnWhite(primary) < 3

  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'certificates.brand.actionError')
    }
  }

  return (
    <Card className="grid gap-5">
      <div>
        <h2 className="text-lg font-bold">{t('certificates.brand.title')}</h2>
        <p className="text-sm text-text-muted">{t('certificates.brand.hint')}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <div className="grid gap-2">
            <span className="text-sm font-semibold">{t('certificates.brand.logo')}</span>
            <div className="flex min-h-24 items-center justify-center rounded-control border border-border bg-white p-3">
              {logoUrl.data
                ? <img src={logoUrl.data} alt={t('certificates.brand.logoAlt')}
                  className="max-h-20 max-w-full object-contain" />
                : <span className="text-sm text-slate-600">
                  {data.logoPath ? t('certificates.brand.loadingLogo') : t('certificates.brand.noLogo')}
                </span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border px-4 text-sm font-semibold focus-within:outline-3">
                {t(data.logoPath ? 'certificates.brand.changeLogo' : 'certificates.brand.uploadLogo')}
                <input className="sr-only" type="file" accept="image/png,image/jpeg"
                  aria-label={t(data.logoPath ? 'certificates.brand.changeLogo' : 'certificates.brand.uploadLogo')}
                  onChange={(event) => {
                    const input = event.currentTarget
                    const file = input.files?.[0]
                    input.value = ''
                    if (file) {
                      void run(() => upload.mutateAsync({ file, previousPath: data.logoPath }))
                    }
                  }} />
              </label>
              {data.logoPath && (
                <Button variant="secondary"
                  onClick={() => void run(() => removeLogo.mutateAsync(data.logoPath ?? ''))}>
                  {t('certificates.brand.removeLogo')}
                </Button>
              )}
            </div>
            <p className="text-xs text-text-muted">{t('certificates.brand.logoHint')}</p>
          </div>

          <div className="flex flex-wrap gap-4">
            <ColorField id="brand-primary" label={t('certificates.brand.primary')} value={primary}
              onChange={(value) => setDraft({ primary: value, secondary })} />
            <ColorField id="brand-secondary" label={t('certificates.brand.secondary')} value={secondary}
              onChange={(value) => setDraft({ primary, secondary: value })} />
          </div>
          {lowContrast && (
            <p role="status" className="text-sm text-error">{t('certificates.brand.lowContrast')}</p>
          )}
        </div>

        <div className="grid content-start gap-2" aria-hidden="true">
          <span className="text-sm font-semibold">{t('certificates.brand.preview')}</span>
          <div className="bg-white p-2">
            <div className="p-1" style={{ border: `3px solid ${primary}` }}>
              <div className="grid justify-items-center gap-2 px-4 py-5"
                style={{ border: `1px solid ${secondary}` }}>
                {logoUrl.data
                  ? <img src={logoUrl.data} alt="" className="max-h-8 object-contain" />
                  : <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: primary }}>
                    {t('certificates.brand.schoolName')}
                  </span>}
                <span className="font-serif text-xl font-bold" style={{ color: primary }}>
                  {t('certificates.brand.sampleTitle')}
                </span>
                <span className="h-0.5 w-16" style={{ backgroundColor: secondary }} />
                <span className="font-serif text-sm italic text-slate-900">{t('certificates.brand.sampleName')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-text-muted">{t('certificates.brand.issuedHint')}</p>
      <div aria-live="polite">
        {error && <p role="alert" className="text-error">{t(error)}</p>}
        {saveColors.isSuccess && !changed && !error && <p>{t('certificates.brand.saved')}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!changed || saveColors.isPending}
          onClick={() => void run(async () => {
            await saveColors.mutateAsync({ primary, secondary })
            setDraft(null)
          })}>
          {saveColors.isPending ? t('certificates.signers.saving') : t('certificates.brand.save')}
        </Button>
        {(data.primary || data.secondary || draft) && (
          <Button variant="secondary" disabled={saveColors.isPending}
            onClick={() => void run(async () => {
              await saveColors.mutateAsync({ primary: null, secondary: null })
              setDraft(null)
            })}>
            {t('certificates.brand.reset')}
          </Button>
        )}
      </div>
    </Card>
  )
}
