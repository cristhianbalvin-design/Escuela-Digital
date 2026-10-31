import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui'
import { useTenant } from './TenantContext'
import { ThemeToggle } from './ThemeToggle'

export function PublicPage({ type }: { type: 'signIn' | 'verify' }) {
  const { t } = useTranslation()
  const brand = useTenant()
  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-6 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            role="img"
            aria-label={brand.logos.alt}
            className="flex h-11 w-11 items-center justify-center rounded-control bg-brand font-bold text-brand-on"
          >
            {brand.logos.mark}
          </span>
          <span className="font-heading font-bold">{brand.name}</span>
        </div>
        <ThemeToggle />
      </div>
      <Card>
        <h1 className="mb-3 text-xl font-bold">{t(type)}</h1>
        <p className="text-text-muted">{t(`${type}Description`)}</p>
      </Card>
    </main>
  )
}
