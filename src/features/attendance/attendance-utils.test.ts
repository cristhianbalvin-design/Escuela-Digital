import { describe, expect, it } from 'vitest'
import {
  attendanceToCsv, countMarks, formatPct, formatSessionDate, summarySchema, todayIso,
} from './attendance-utils'

describe('fechas y porcentajes', () => {
  it('formatea sin cambiar de día por zona horaria', () => {
    expect(formatSessionDate('2026-11-02')).toBe('02/11/2026')
    expect(formatSessionDate('texto')).toBe('texto')
    expect(todayIso(new Date(2026, 10, 2))).toBe('2026-11-02')
  })

  it('muestra el porcentaje o un guion', () => {
    expect(formatPct(null)).toBe('—')
    expect(formatPct(100)).toBe('100%')
    expect(formatPct(66.67)).toBe('66.7%')
  })
})

describe('conteo de marcas', () => {
  it('cuenta cada estado y los alumnos sin marcar', () => {
    expect(countMarks([
      { status: 'present' }, { status: 'late' }, { status: null }, { status: null },
    ])).toEqual({ present: 1, late: 1, absent: 0, excused: 0, unmarked: 2 })
  })
})

describe('resumen y CSV', () => {
  const summary = summarySchema.parse({
    sessions: [
      { id: 's1', title: 'Clase "1"', session_date: '2026-11-02', status: 'closed',
        present: 1, late: 0, excused: 0, absent: 1, marked: 2 },
      { id: 's2', title: 'Clase 2', session_date: '2026-11-03', status: 'open',
        present: 0, late: 0, excused: 0, absent: 0, marked: 0 },
    ],
    students: [
      { enrollment_id: 'e1', email: 'a@x.com', full_name: 'Ana, Pérez', pct: 50,
        attended: 1, total: 2, by_session: { s1: 'present', s2: 'absent' } },
    ],
  })

  it('solo exporta las llamadas cerradas y escapa los textos', () => {
    const csv = attendanceToCsv(summary)
    expect(csv.split('\n')[0]).toContain('"Clase ""1"" (02/11/2026)"')
    expect(csv).not.toContain('Clase 2')
    expect(csv.split('\n')[1]).toBe('"Ana, Pérez",a@x.com,P,1,2,50')
  })
})
