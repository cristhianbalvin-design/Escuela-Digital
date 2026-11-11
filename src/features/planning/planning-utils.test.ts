import { describe, expect, it } from 'vitest'
import { parseActivities, planMinutes, planProgress } from './planning-utils'

describe('planificación', () => {
  it('importa líneas y señala errores sin aceptar minutos inválidos', () => {
    const result = parseActivities('Introducción | 15\nPráctica\nError | -1\nOtro | 2 | extra')
    expect(result.items.map((i) => [i.title, i.minutes])).toEqual([['Introducción', 15], ['Práctica', null]])
    expect(result.errors).toEqual([3, 4])
  })
  it('calcula avance y duración frente a la sesión', () => {
    const items = parseActivities('Uno | 20\nDos | 10').items
    expect(planProgress(items, new Set([items[0]!.id]))).toEqual({ done: 1, total: 2, percent: 50 })
    expect(planMinutes(items, '09:00', '10:00')).toEqual({ total: 30, session: 60 })
    expect(planMinutes([], null, null)).toEqual({ total: 0, session: null })
  })
})
