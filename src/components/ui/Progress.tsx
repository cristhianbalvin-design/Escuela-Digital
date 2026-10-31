import { useTranslation } from 'react-i18next'

export function Progress({ value, label }: { value: number; label?: string }) {
  const { t } = useTranslation()
  const current = Math.min(100, Math.max(0, value))
  return (
    <div className="grid gap-2">
      <div className="flex justify-between text-sm">
        <span>{label ?? t('progress')}</span>
        <span>{current}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label ?? t('progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={current}
        className="h-2 overflow-hidden rounded-chip bg-border"
      >
        <div
          className="h-full rounded-chip bg-brand"
          style={{ width: `${current}%` }}
        />
      </div>
    </div>
  )
}
