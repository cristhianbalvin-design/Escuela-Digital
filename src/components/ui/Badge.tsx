import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral'
const styles: Record<Status, string> = {
  success: 'bg-success-soft text-green-900',
  warning: 'bg-warning-soft text-amber-900',
  error: 'bg-error-soft text-red-900',
  info: 'bg-info-soft text-sky-900',
  neutral: 'bg-brand-soft text-text',
}
export function Badge({
  status = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status?: Status }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center rounded-chip px-3 text-xs font-semibold',
        styles[status],
        className,
      )}
      {...props}
    />
  )
}
export const StatusChip = Badge
