import { describe, expect, it } from 'vitest'
import { parseDimensions, parseWeight, rowsToPayload, toRows, totalWeight, validateRows } from './dimensions-utils'

const row = (name: string, weight: string, kind: 'manual' | 'attendance' = 'manual') =>
  ({ key: name, id: null, name, weight, kind, scored: 0 })

describe('dimensions-utils', () => {
  it('parsea pesos con coma y rechaza vacíos', () => {
    expect(parseWeight('12,5')).toBe(12.5)
    expect(parseWeight('')).toBeNull()
    expect(parseWeight('abc')).toBeNull()
  })
  it('suma porcentajes sin errores de coma flotante', () => {
    expect(totalWeight([row('a', '33.3'), row('b', '33.3'), row('c', '33.4')])).toBe(100)
  })
  it('valida nombre, peso y exceso', () => {
    expect(validateRows([row('', '10')])).toBe('name')
    expect(validateRows([row('A', '0')])).toBe('weight')
    expect(validateRows([row('A', '60'), row('B', '50')])).toBe('over')
    expect(validateRows([row('A', '60'), row('B', '40')])).toBeNull()
  })
  it('convierte filas a carga útil con id solo si existe', () => {
    const payload = rowsToPayload([{ ...row('A', '50'), id: 'x' }, row('B', '50', 'attendance')])
    expect(payload).toEqual([
      { id: 'x', name: 'A', weight_pct: 50, kind: 'manual' },
      { name: 'B', weight_pct: 50, kind: 'attendance' },
    ])
  })
  it('parsea la respuesta del servidor', () => {
    const data = parseDimensions({ dimensions: [{ id: 'd1', name: 'E', weight_pct: 40, kind: 'attendance', scored: 2 }], total: 40 })
    expect(data.total).toBe(40)
    expect(toRows(data)[0]).toMatchObject({ id: 'd1', weight: '40', kind: 'attendance', scored: 2 })
    expect(parseDimensions(null)).toEqual({ dimensions: [], total: 0 })
  })
})
