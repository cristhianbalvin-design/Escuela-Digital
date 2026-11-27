import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { allowedActions, elapsedSeconds, formatClock, type BlockAction } from './block-state'
import { useSessionBlocks, useSetBlockState } from './live-teacher-api'

/**
 * Estado y cronómetro persistente del bloque seleccionado (el tiempo vive en el servidor).
 * Con `next`, «Terminar» se convierte en «Terminar y pasar al siguiente»: cierra este bloque, inicia el siguiente y lo selecciona.
 */
export function BlockTimer({ sessionId, itemId, plannedMinutes, next, onAdvance, compact = false }: {
  sessionId: string; itemId: string; plannedMinutes: number | null
  next?: { id: string; title: string } | null; onAdvance?: (id: string) => void; compact?: boolean
}) {
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
  const percent = planned ? Math.min(100, Math.round(seconds * 100 / planned)) : 0
  async function run(action: BlockAction) {
    setError(false)
    try { await change.mutateAsync({ itemId, action }) } catch { setError(true) }
  }
  async function advance() {
    if (!next) return
    setError(false)
    try {
      if (entry?.state === 'active' || entry?.state === 'paused') await change.mutateAsync({ itemId, action: 'finish' })
      await change.mutateAsync({ itemId: next.id, action: 'start' })
      onAdvance?.(next.id)
    } catch { setError(true) }
  }
  const canAdvance = !!next && (entry?.state === 'active' || entry?.state === 'paused')
  const actions = allowedActions(entry?.state).filter((action) => !(canAdvance && action === 'finish'))
  const disabled = change.isPending || blocks.isPending
  const buttons = <>
    {actions.map((action) => <Button key={action} variant={!canAdvance && (action === 'start' || action === 'pause') ? 'primary' : 'secondary'} className="min-h-11"
      disabled={disabled} onClick={() => void run(action)}>{t(`blockState.action.${action}${action === 'start' && entry?.state === 'paused' ? 'Resume' : ''}`)}</Button>)}
    {canAdvance && <Button className="min-h-11 font-bold" disabled={disabled} onClick={() => void advance()}>{t('dictar.completeNext')}</Button>}
  </>
  if (compact) return <div className="flex flex-wrap items-center gap-3" role="group" aria-label={t('blockState.title')}>
    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide" role="status">{t(`blockState.state.${entry?.state ?? 'pending'}`)}</span>
    <span role="timer" aria-live="off" className={`text-3xl font-extrabold tabular-nums ${over ? 'text-error' : ''}`}>{formatClock(seconds)}</span>
    {planned !== null && <span className="text-sm text-text-muted tabular-nums">{over ? t('blockState.over', { time: formatClock(seconds - planned) }) : t('dictar.remaining', { time: formatClock(planned - seconds) })}</span>}
    <div className="ml-auto flex flex-wrap gap-2">{buttons}</div>
    {(error || blocks.isError) && <p role="alert" className="basis-full text-sm text-error">{t('blockState.error')}</p>}
  </div>
  return <div className="grid gap-3" role="group" aria-label={t('blockState.title')}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold uppercase tracking-wide" role="status">{t(`blockState.state.${entry?.state ?? 'pending'}`)}</span>
      <div className="text-right">
        <span role="timer" aria-live="off" className={`block text-5xl font-extrabold leading-none tabular-nums ${over ? 'text-error' : ''}`}>{formatClock(seconds)}</span>
        {planned !== null && <span className="text-sm text-text-muted tabular-nums">
          {t('blockState.planned', { minutes: plannedMinutes })} · {over ? t('blockState.over', { time: formatClock(seconds - planned) }) : t('dictar.remaining', { time: formatClock(planned - seconds) })}</span>}
      </div>
    </div>
    {planned !== null && <div className="h-2 rounded-full bg-border" aria-hidden="true"><div className={`h-2 rounded-full ${over ? 'bg-error' : 'bg-brand'}`} style={{ width: `${percent}%` }} /></div>}
    <div className="flex flex-wrap items-center gap-2">
      {buttons}
      <span className="min-w-0 flex-1 text-right text-sm text-text-muted">{next ? t('dictar.nextUp', { title: next.title }) : t('dictar.lastBlock')}</span>
    </div>
    {(error || blocks.isError) && <p role="alert" className="text-sm text-error">{t('blockState.error')}</p>}
  </div>
}
