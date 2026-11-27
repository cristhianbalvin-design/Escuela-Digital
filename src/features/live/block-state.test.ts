import { describe, expect, it } from 'vitest'
import { allowedActions, blockStatesOutputSchema, currentStepIndex, elapsedSeconds, formatClock } from './block-state'

const id = '11111111-1111-4111-8111-111111111111'
const base = Date.parse('2026-11-27T20:00:00+00:00')

describe('cronómetro de bloques', () => {
  it('un bloque pendiente o pausado no avanza', () => {
    expect(elapsedSeconds(undefined, base, 0)).toBe(0)
    expect(elapsedSeconds({ item_id: id, state: 'paused', elapsed_seconds: 90, running_since: null }, base + 60000, 0)).toBe(90)
  })
  it('un bloque activo suma desde running_since', () => {
    const entry = { item_id: id, state: 'active' as const, elapsed_seconds: 90, running_since: '2026-11-27T20:00:00+00:00' }
    expect(elapsedSeconds(entry, base + 45_000, 0)).toBe(135)
  })
  it('corrige un reloj local adelantado usando el desfase con el servidor', () => {
    const entry = { item_id: id, state: 'active' as const, elapsed_seconds: 0, running_since: '2026-11-27T20:00:00+00:00' }
    // el navegador va 10 min adelantado: ahora local = servidor + 10 min, offset = −10 min
    expect(elapsedSeconds(entry, base + 600_000 + 30_000, -600_000)).toBe(30)
  })
  it('nunca devuelve negativos', () => {
    const entry = { item_id: id, state: 'active' as const, elapsed_seconds: 5, running_since: '2026-11-27T20:00:10+00:00' }
    expect(elapsedSeconds(entry, base, 0)).toBe(5)
  })
  it('da formato mm:ss y h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00'); expect(formatClock(605)).toBe('10:05'); expect(formatClock(3725)).toBe('1:02:05'); expect(formatClock(-4)).toBe('00:00')
  })
  it('ofrece solo acciones coherentes con el estado', () => {
    expect(allowedActions(undefined)).toEqual(['start', 'skip'])
    expect(allowedActions('active')).toEqual(['pause', 'finish', 'skip'])
    expect(allowedActions('paused')).toContain('start')
    expect(allowedActions('done')).not.toContain('pause')
  })
  it('valida la respuesta del servidor y rechaza campos extra', () => {
    const ok = { server_now: '2026-11-27T20:00:00.123456+00:00', blocks: [{ item_id: id, state: 'active', elapsed_seconds: 3, running_since: '2026-11-27T20:00:00+00:00' }] }
    expect(blockStatesOutputSchema.safeParse(ok).success).toBe(true)
    expect(blockStatesOutputSchema.safeParse({ ...ok, blocks: [{ ...ok.blocks[0], state: 'otro' }] }).success).toBe(false)
    expect(blockStatesOutputSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false)
  })
})

describe('paso en curso del proyector', () => {
  const steps = [{ minutes: 3 }, { minutes: 4 }, { minutes: 7 }]
  it('sigue los minutos acumulados', () => {
    expect(currentStepIndex(steps, 0, true)).toBe(0)
    expect(currentStepIndex(steps, 3 * 60, true)).toBe(1)
    expect(currentStepIndex(steps, 7 * 60 + 5, true)).toBe(2)
    expect(currentStepIndex(steps, 99 * 60, true)).toBe(2)
  })
  it('no marca nada si el bloque no empezó o no hay minutos', () => {
    expect(currentStepIndex(steps, 0, false)).toBe(-1)
    expect(currentStepIndex([{ minutes: null }], 60, true)).toBe(-1)
    expect(currentStepIndex([], 60, true)).toBe(-1)
  })
})
