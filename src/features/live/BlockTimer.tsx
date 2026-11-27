import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { allowedActions, elapsedSeconds, formatClock, type BlockAction } from './block-state'
import { useSessionBlocks, useSetBlockState } from './live-teacher-api'

/** Estado y cronómetro persistente del bloque seleccionado. El tiempo se guarda en el servidor. */
export function BlockTimer({ sessionId, itemId, plannedMinutes }: { sessionId: string; itemId: string; plannedMinutes: number | null }) {
  const { t } = useTranslation()
  const blocks = useSessionBlocks(sessionId)
  const change = useSetBlockState(sessionId)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState(false)
  const entry = blocks.data?.blocks.find((item) => item.item_id === itemId)
  const running = entry?.state === 'active'
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  const offset = blocks.data ? Date.parse(blocks.data.server_now) - blocks.data.receivedAt : 0
  const seconds = elapsedSeconds(entry, running ? Math.max(now, blocks.data?.receivedAt ?? now) : now, offset)
  const planned = plannedMinutes && plannedMinutes > 0 ? plannedMinutes * 60 : null
  const over = planned !== null && seconds > planned
  async function run(action: BlockAction) {
    setError(false)
    try { await change.mutateAsync({ itemId, action }) } catch { setError(true) }
  }
  const actions = allowedActions(entry?.state)
  return <div className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-2" role="group" aria-label={t('blockState.title')}>
    <span className="rounded-full border border-border px-2 py-1 text-xs font-semibold" role="status">{t(`blockState.state.${entry?.state ?? 'pending'}`)}</span>
    <span role="timer" aria-live="off" className={`text-2xl font-bold tabular-nums ${over ? 'text-error' : ''}`}>{formatClock(seconds)}</span>
    {planned !== null && <span className="text-sm text-text-muted tabular-nums">
      {t('blockState.planned', { minutes: plannedMinutes })}{over ? ` · ${t('blockState.over', { time: formatClock(seconds - planned) })}` : ''}</span>}
    <div className="ml-auto flex flex-wrap gap-2">{actions.map((action) => <Button key={action} variant={action === 'start' || action === 'pause' ? 'primary' : 'secondary'} className="min-h-11"
      disabled={change.isPending || blocks.isPending} onClick={() => void run(action)}>{t(`blockState.action.${action}${action === 'start' && entry?.state === 'paused' ? 'Resume' : ''}`)}</Button>)}</div>
    {(error || blocks.isError) && <p role="alert" className="basis-full text-sm text-error">{t('blockState.error')}</p>}
  </div>
}
