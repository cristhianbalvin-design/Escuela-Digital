import { describe, expect, it } from 'vitest'
import { activityRanges, itemSchema, parseActivities, parsePlanRows, parsePlanTable, planMinutes, planProgress } from './planning-utils'

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

describe('importación de tablas de planificación', () => {
  it('lee una tabla de doce filas, ignora separador y total e infiere tipos', () => {
    const text = `| Horario | Duración | Actividad / bloque | Qué se trabajará | Recurso |
|---|---:|---|---|---|
| **7:00 – 7:10 p. m.** | 10 min | **Apertura y diagnóstico del grupo** | Encuesta sobre nivel de uso de IA | **Mentimeter** |
| 7:10 – 7:25 p. m. | 15 min | Demo de impacto: ¿Qué puede hacer hoy la IA? | Caso empresarial realista | ChatGPT / Claude / Gemini |
| 7:25 – 7:40 p. m. | 15 min | Fundamentos | Conceptos | — |
| 7:40 – 7:55 p. m. | 15 min | Taller | Práctica | - |
| 7:55 – 8:10 p. m. | 15 min | Encuesta | Preguntas | |
| 8:10 – 8:20 p. m. | 10 min | Evaluación | Revisión | |
| 8:20 – 8:30 p. m. | 10 min | Presentación | Ejemplos | |
| 8:30 – 8:40 p. m. | 10 min | Break | Pausa. | — |
| 8:40 – 9:00 p. m. | 20 min | Ejercicio | Trabajo | |
| 9:00 – 9:20 p. m. | 20 min | Riesgos | Debate | |
| 9:20 – 10:00 p. m. | 40 min | Cierre | Comentarios | |
| TOTAL | 180 min | | | |`
    const result = parsePlanTable(text)
    expect(result.rows).toHaveLength(11)
    expect(result.ignored).toEqual([1, 2, 14])
    expect(result.rows.reduce((n, row) => n + (row.item.minutes ?? 0), 0)).toBe(180)
    expect(result.rows[0]?.item).toMatchObject({ title: 'Apertura y diagnóstico del grupo', resource: 'Mentimeter', starts_at: '19:00', notes: 'Encuesta sobre nivel de uso de IA' })
    expect(result.rows[1]?.item.kind).toBe('explicacion')
    expect(result.rows[7]?.item).toMatchObject({ kind: 'descanso', resource: null })
  })
  it('detecta encabezados reordenados, TSV, CSV con comillas y duraciones', () => {
    const tsv = parsePlanTable('Recurso\tTítulo\tMinutos\tHora\tDescripción\nKahoot\tDinámica\t1h 30min\t23:30 — 01:00\tTexto')
    expect(tsv.rows[0]?.item).toMatchObject({ title: 'Dinámica', minutes: 90, starts_at: '23:30', kind: 'interactiva', resource: 'Kahoot' })
    const csv = parsePlanTable('Actividad,Duración,Contenido\n"Demo, ejemplo",10 min,"Hola, mundo"')
    expect(csv.rows[0]?.item).toMatchObject({ title: 'Demo, ejemplo', notes: 'Hola, mundo', minutes: 10 })
    expect(parsePlanTable('Hora\tActividad\n7:00 p. m.\tDemo').rows[0]?.item.starts_at).toBe('19:00')
    expect(parsePlanRows([['09:00 - 10:00', '', 'Práctica', '', '']]).rows[0]?.item.minutes).toBe(60)
    expect(parsePlanTable('Actividad').rows[0]?.item.title).toBe('Actividad')
    expect(parsePlanTable('Actividad antigua | 15\nOtra').rows.map((r) => [r.item.title, r.item.minutes])).toEqual([['Actividad antigua', 15], ['Otra', null]])
  })
  it('marca datos inválidos y calcula horarios acumulados o explícitos', () => {
    const result = parsePlanTable('Horario\tMinutos\tActividad\n25:00 - 26:00\tmal\tPrueba')
    expect(itemSchema.safeParse(result.rows[0]?.item).success).toBe(false)
    const items = parsePlanTable('Uno | 20\nDos | 10\nTres | 15').rows.map((r) => r.item)
    items[1]!.starts_at = '14:00'
    expect(activityRanges(items, '09:00')).toEqual(['09:00 – 09:20', '14:00 – 14:10', '09:30 – 09:45'])
    expect(activityRanges(items, null)).toEqual([null, '14:00 – 14:10', null])
  })
})
