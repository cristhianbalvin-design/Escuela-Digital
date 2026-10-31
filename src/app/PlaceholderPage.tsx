import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui'
import type { Role } from './role'

export function PlaceholderPage({ role, name }: { role: Role; name: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-bold sm:text-2xl">
        {t(`nav.${role}.${name}`)}
      </h1>
      <EmptyState />
    </div>
  )
}
