import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-5 animate-pulse rounded-control bg-border', className)}
    />
  )
}
