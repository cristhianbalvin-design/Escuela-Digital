import { z } from 'zod'

/** Estado de un bloque durante la clase en vivo. Sin registro = pendiente. */
export const blockStateSchema = z.enum(['active', 'paused', 'done', 'skipped'])
export const blockActionSchema = z.enum(['start', 'pause', 'finish', 'skip', 'reset'])
export const blockStatesOutputSchema = z.object({
  server_now: z.iso.datetime({ offset: true }),
  blocks: z.array(z.object({
    item_id: z.uuid(), state: blockStateSchema, elapsed_seconds: z.number().int().min(0),
    running_since: z.iso.datetime({ offset: true }).nullable(),
  }).strict()).max(300),
}).strict()

export type BlockState = z.infer<typeof blockStateSchema>
export type BlockAction = z.infer<typeof blockActionSchema>
export type BlockStatesOutput = z.infer<typeof blockStatesOutputSchema>
export type BlockEntry = BlockStatesOutput['blocks'][number]

/**
 * Segundos transcurridos de un bloque en este instante. Se mide contra el reloj del servidor
 * (offsetMs = servidor − navegador al recibir los datos) para que un reloj desajustado no distorsione el cronómetro.
 */
export function elapsedSeconds(entry: BlockEntry | undefined, nowMs: number, offsetMs: number): number {
  if (!entry) return 0
  if (entry.state !== 'active' || !entry.running_since) return entry.elapsed_seconds
  return entry.elapsed_seconds + Math.max(0, Math.floor((nowMs + offsetMs - Date.parse(entry.running_since)) / 1000))
}

/** «mm:ss» (o «h:mm:ss» desde la hora). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Acciones válidas para el estado actual (pendiente = undefined). */
export function allowedActions(state: BlockState | undefined): BlockAction[] {
  switch (state) {
    case 'active': return ['pause', 'finish', 'skip']
    case 'paused': return ['start', 'finish', 'skip', 'reset']
    case 'done': case 'skipped': return ['start', 'reset']
    default: return ['start', 'skip']
  }
}

/** Paso en curso según el tiempo transcurrido y los minutos de cada paso (−1 si el bloque no empezó o los pasos no tienen minutos). */
export function currentStepIndex(steps: { minutes: number | null }[], seconds: number, started: boolean): number {
  if (!started || steps.length === 0 || steps.every((step) => step.minutes === null)) return -1
  let total = 0
  for (let i = 0; i < steps.length; i++) {
    total += (steps[i]!.minutes ?? 0) * 60
    if (seconds < total) return i
  }
  return steps.length - 1
}
