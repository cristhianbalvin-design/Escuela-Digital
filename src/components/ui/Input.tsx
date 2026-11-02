import { forwardRef, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, id, className, ...props },
  ref,
) {
  const { t } = useTranslation()
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          'min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-text placeholder:text-text-muted hover:border-brand focus:border-brand disabled:opacity-50',
          error && 'border-error',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-error">
          {error || t('inputError')}
        </p>
      )}
    </div>
  )
})
