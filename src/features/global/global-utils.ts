import { z } from 'zod'
import { shownEmail } from '@/lib/placeholder-email'

// ---- Agenda ----

export const agendaRowSchema = z.object({
  offering_id: z.string(),
  offering_title: z.string(),
  client_name: z.string(),
  offering_status: z.string(),
  lesson_title: z.string(),
  module_title: z.string(),
  session_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
})
export const agendaSchema = z.array(agendaRowSchema)
export type AgendaRow = z.infer<typeof agendaRowSchema>

export type Month = { year: number; month: number } // month: 0–11

export function monthOf(date: Date): Month {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}

export function addMonths(value: Month, delta: number): Month {
  const total = value.year * 12 + value.month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function monthRange(value: Month): { from: string; to: string } {
  const last = new Date(Date.UTC(value.year, value.month + 1, 0)).getUTCDate()
  const prefix = `${value.year}-${pad(value.month + 1)}`
  return { from: `${prefix}-01`, to: `${prefix}-${pad(last)}` }
}

/** Fecha de hoy (AAAA-MM-DD) en la zona de Lima. */
export function todayLima(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(now)
}

export function monthOfToday(now: Date = new Date()): Month {
  const [year, month] = todayLima(now).split('-').map(Number)
  return { year: year ?? now.getUTCFullYear(), month: (month ?? 1) - 1 }
}

export function formatMonth(value: Month): string {
  const text = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(value.year, value.month, 1)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatDayLong(date: string): string {
  const text = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const from = start.slice(0, 5)
  return end ? `${from} – ${end.slice(0, 5)}` : from
}

export type AgendaDay = { date: string; items: AgendaRow[] }

export function groupByDay(rows: AgendaRow[], offeringId: string | null = null): AgendaDay[] {
  const days = new Map<string, AgendaRow[]>()
  for (const row of rows) {
    if (offeringId && row.offering_id !== offeringId) continue
    const list = days.get(row.session_date) ?? []
    list.push(row)
    days.set(row.session_date, list)
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }))
}

export function agendaOfferings(rows: AgendaRow[]): { id: string; title: string }[] {
  const seen = new Map<string, string>()
  for (const row of rows) seen.set(row.offering_id, row.offering_title)
  return [...seen.entries()].map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

// ---- Estudiantes ----

export const studentEditionSchema = z.object({
  offering_id: z.string(),
  enrollment_id: z.string(),
  title: z.string(),
  client_name: z.string(),
  offering_status: z.string(),
  status: z.string(),
  progress_pct: z.number(),
})
export const studentSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  job_title: z.string().nullable(),
  company: z.string().nullable(),
  editions: z.array(studentEditionSchema),
})
export const studentsSchema = z.array(studentSchema)
export type GlobalStudent = z.infer<typeof studentSchema>

export function studentLabel(student: GlobalStudent): string {
  return student.full_name?.trim() || shownEmail(student.email) || '—'
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filterStudents(
  students: GlobalStudent[], query: string, clientName: string,
): GlobalStudent[] {
  const needle = normalize(query.trim())
  return students.filter((student) => {
    if (clientName && !student.editions.some((edition) => edition.client_name === clientName)) {
      return false
    }
    if (needle === '') return true
    const haystack = normalize([
      student.full_name ?? '', shownEmail(student.email), student.company ?? '',
      student.job_title ?? '', student.phone ?? '',
      ...student.editions.map((edition) => `${edition.title} ${edition.client_name}`),
    ].join(' '))
    return haystack.includes(needle)
  })
}

export function studentClients(students: GlobalStudent[]): string[] {
  const names = new Set<string>()
  for (const student of students) for (const edition of student.editions) names.add(edition.client_name)
  return [...names].sort((a, b) => a.localeCompare(b))
}

// ---- Analítica ----

export const analyticsRowSchema = z.object({
  offering_id: z.string(),
  title: z.string(),
  client_name: z.string(),
  status: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  enrolled: z.number(),
  completed: z.number(),
  dropped: z.number(),
  avg_progress: z.number().nullable(),
  closed_sessions: z.number(),
  attendance_pct: z.number().nullable(),
})
export const analyticsSchema = z.array(analyticsRowSchema)
export type AnalyticsRow = z.infer<typeof analyticsRowSchema>

export type AnalyticsSummary = {
  activeEditions: number
  students: number
  completed: number
  attendancePct: number | null
}

/** Asistencia global ponderada por alumnos matriculados; ignora ediciones sin llamadas cerradas. */
export function summarize(rows: AnalyticsRow[]): AnalyticsSummary {
  let weighted = 0
  let weight = 0
  for (const row of rows) {
    if (row.attendance_pct === null || row.enrolled === 0) continue
    weighted += row.attendance_pct * row.enrolled
    weight += row.enrolled
  }
  return {
    activeEditions: rows.filter((row) => row.status === 'open' || row.status === 'running').length,
    students: rows.reduce((total, row) => total + row.enrolled, 0),
    completed: rows.reduce((total, row) => total + row.completed, 0),
    attendancePct: weight === 0 ? null : Math.round((weighted / weight) * 10) / 10,
  }
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`
}
