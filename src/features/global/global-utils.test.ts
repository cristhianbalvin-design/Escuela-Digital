import { describe, expect, it } from 'vitest'
import {
  addMonths, filterStudents, formatTimeRange, groupByDay, monthRange, studentClients,
  summarize, todayLima, type AgendaRow, type AnalyticsRow, type GlobalStudent,
} from './global-utils'

describe('meses', () => {
  it('calcula el rango del mes, también en febrero bisiesto', () => {
    expect(monthRange({ year: 2026, month: 10 })).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange({ year: 2028, month: 1 })).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('cambia de mes cruzando años', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
  })
  it('toma el día de hoy en hora de Lima', () => {
    expect(todayLima(new Date('2026-11-04T03:00:00Z'))).toBe('2026-11-03')
  })
})

describe('agenda', () => {
  const row = (date: string, offering: string, start: string | null): AgendaRow => ({
    offering_id: offering, offering_title: offering, client_name: 'C', offering_status: 'open',
    lesson_title: 'L', module_title: 'M', session_date: date, start_time: start, end_time: null,
  })
  it('agrupa por día en orden y filtra por edición', () => {
    const rows = [row('2026-11-05', 'a', '10:00'), row('2026-11-03', 'b', null), row('2026-11-05', 'b', '09:00')]
    expect(groupByDay(rows).map((day) => [day.date, day.items.length])).toEqual([
      ['2026-11-03', 1], ['2026-11-05', 2],
    ])
    expect(groupByDay(rows, 'b').map((day) => day.date)).toEqual(['2026-11-03', '2026-11-05'])
    expect(groupByDay(rows, 'a')).toHaveLength(1)
  })
  it('formatea el horario', () => {
    expect(formatTimeRange('18:30:00', '20:00:00')).toBe('18:30 – 20:00')
    expect(formatTimeRange('18:30:00', null)).toBe('18:30')
    expect(formatTimeRange(null, null)).toBe('')
  })
})

describe('estudiantes', () => {
  const student = (name: string, client: string, email = 'a@x.com'): GlobalStudent => ({
    user_id: name, email, full_name: name, phone: null, job_title: null, company: null,
    editions: [{
      offering_id: 'o', enrollment_id: name, title: 'Automatización', client_name: client,
      offering_status: 'open', status: 'active', progress_pct: 0,
    }],
  })
  const list = [student('Ñandú Pérez', 'UDEP'), student('Luis Soto', 'TIDEO')]
  it('busca sin distinguir acentos ni mayúsculas', () => {
    expect(filterStudents(list, 'nandu', '').map((s) => s.user_id)).toEqual(['Ñandú Pérez'])
    expect(filterStudents(list, 'automatizacion', '')).toHaveLength(2)
  })
  it('filtra por cliente y lista los clientes', () => {
    expect(filterStudents(list, '', 'TIDEO')).toHaveLength(1)
    expect(studentClients(list)).toEqual(['TIDEO', 'UDEP'])
  })
  it('no busca dentro del correo interno de quienes no tienen correo', () => {
    const hidden = student('Ana', 'UDEP', 'sin-correo-abc@sin-correo.invalid')
    expect(filterStudents([hidden], 'sin-correo', '')).toHaveLength(0)
  })
})

describe('analítica', () => {
  const row = (over: Partial<AnalyticsRow>): AnalyticsRow => ({
    offering_id: 'o', title: 't', client_name: 'c', status: 'open', starts_at: null, ends_at: null,
    enrolled: 10, completed: 2, dropped: 0, avg_progress: 50, closed_sessions: 3,
    attendance_pct: 80, ...over,
  })
  it('pondera la asistencia por matriculados e ignora ediciones sin llamadas', () => {
    const result = summarize([
      row({ enrolled: 30, attendance_pct: 90 }),
      row({ enrolled: 10, attendance_pct: 50 }),
      row({ enrolled: 99, attendance_pct: null, status: 'finished' }),
    ])
    expect(result.attendancePct).toBe(80)
    expect(result.students).toBe(139)
    expect(result.activeEditions).toBe(2)
  })
  it('devuelve asistencia nula si ninguna edición tiene llamadas', () => {
    expect(summarize([row({ attendance_pct: null })]).attendancePct).toBeNull()
    expect(summarize([]).students).toBe(0)
  })
})
