import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from './Card'

export function EmptyState({
  title,
  description,
}: {
  title?: string
  description?: string
}) {
  const { t } = useTranslation()
  return (
    <Card className="grid justify-items-center gap-3 py-14 text-center">
      <Inbox aria-hidden="true" className="h-10 w-10 text-text-muted" />
      <h2 className="text-lg font-bold">{title ?? t('emptyTitle')}</h2>
      {description !== '' && (
        <p className="max-w-md text-sm text-text-muted">
          {description ?? t('emptyDescription')}
        </p>
      )}
    </Card>
  )
}
