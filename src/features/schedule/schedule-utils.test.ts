import { describe, expect, it } from 'vitest'
import {
  applyPlan, applySuggestedDates, draftsToItems, formatRange, groupByModule, inferPlan,
  invalidTimes, suggestDates,
} from './schedule-utils'

describe('suggestDates', () => {
  it('reparte las sesiones en los días elegidos', () => {
    // 2026-11-02 es lunes; lunes y miércoles
    expect(suggestDates(4, '2026-11-02', [1, 3])).toEqual([
      '2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11',
    ])
  })
  it('empieza el primer día válido a partir de la fecha de inicio', () => {
    expect(suggestDates(2, '2026-11-03', [1])).toEqual(['2026-11-09', '2026-11-16'])
  })
  it('devuelve vacío con datos incompletos', () => {
    expect(suggestDates(3, '', [1])).toEqual([])
    expect(suggestDates(3, '2026-11-02', [])).toEqual([])
    expect(suggestDates(0, '2026-11-02', [1])).toEqual([])
  })
})

describe('borradores', () => {
  const drafts = [
    { lesson_id: 'a', date: '', start: '', end: '' },
    { lesson_id: 'b', date: '', start: '', end: '' },
  ]
  it('aplica fechas sugeridas en orden', () => {
    const out = applySuggestedDates(drafts, '2026-11-02', [1, 3])
    expect(out.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-04'])
  })
  it('solo envía sesiones con fecha y normaliza horas vacías', () => {
    const items = draftsToItems([
      { lesson_id: 'a', date: '2026-11-02', start: '08:00', end: '' },
      { lesson_id: 'b', date: '', start: '', end: '' },
    ])
    expect(items).toEqual([
      { lesson_id: 'a', session_date: '2026-11-02', start_time: '08:00', end_time: null },
    ])
  })
  it('detecta horas invertidas solo en filas con fecha', () => {
    expect(invalidTimes([{ lesson_id: 'a', date: '2026-11-02', start: '10:00', end: '09:00' }])).toBe(true)
    expect(invalidTimes([{ lesson_id: 'a', date: '', start: '10:00', end: '09:00' }])).toBe(false)
  })
})

describe('formato', () => {
  it('formatea rangos y agrupa por módulo', () => {
    expect(formatRange('08:00:00', '09:30:00')).toBe('08:00 – 09:30')
    expect(formatRange('08:00:00', null)).toBe('08:00')
    const groups = groupByModule([
      { module_title: 'S1', n: 1 }, { module_title: 'S1', n: 2 }, { module_title: 'S2', n: 3 },
    ])
    expect(groups.map((g) => g.rows.length)).toEqual([2, 1])
  })
})

describe('plan de sesiones', () => {
  const drafts = [
    { lesson_id: 'a', date: '', start: '', end: '' },
    { lesson_id: 'b', date: '', start: '', end: '' },
    { lesson_id: 'c', date: '', start: '', end: '' },
  ]
  it('llena fechas y horario en todas las sesiones', () => {
    const out = applyPlan(drafts, {
      startIso: '2026-10-13', weekdays: [2, 4], start: '19:00', end: '21:00',
    })
    expect(out.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-15', '2026-10-20'])
    expect(out.every((d) => d.start === '19:00' && d.end === '21:00')).toBe(true)
  })
  it('no cambia nada si el plan está incompleto', () => {
    expect(applyPlan(drafts, { startIso: '', weekdays: [2], start: '', end: '' })).toBe(drafts)
    expect(applyPlan(drafts, { startIso: '2026-10-13', weekdays: [], start: '', end: '' })).toBe(drafts)
  })
  it('deduce el plan de un calendario guardado', () => {
    const plan = inferPlan([
      { lesson_id: 'a', date: '2026-10-15', start: '19:00', end: '21:00' },
      { lesson_id: 'b', date: '2026-10-13', start: '19:00', end: '21:00' },
      { lesson_id: 'c', date: '', start: '', end: '' },
    ])
    expect(plan).toEqual({ startIso: '2026-10-13', weekdays: [2, 4], start: '19:00', end: '21:00' })
    expect(inferPlan([]).startIso).toBe('')
  })
})
