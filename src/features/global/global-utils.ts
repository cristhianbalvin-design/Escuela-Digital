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

// ---- Semana ----

const DAY_MS = 86_400_000

/** Suma días a una fecha AAAA-MM-DD (aritmética en UTC, sin horario de verano). */
export function addDays(date: string, delta: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + delta * DAY_MS).toISOString().slice(0, 10)
}

/** Lunes de la semana que contiene la fecha. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6)
  const day = (date: string) => Number(date.slice(8, 10))
  const month = (date: string) => new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`)).replace('.', '')
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7)
  const tail = `${day(sunday)} ${month(sunday)} ${sunday.slice(0, 4)}`
  return sameMonth ? `${day(monday)} – ${tail}` : `${day(monday)} ${month(monday)} – ${tail}`
}

export function formatDayShort(date: string): { weekday: string; day: number } {
  const weekday = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`)).replace('.', '')
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), day: Number(date.slice(8, 10)) }
}

/** Minutos desde medianoche de un horario HH:MM[:SS], o null si no hay. */
export function minutesOf(time: string | null): number | null {
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

export type WeekBlock = {
  item: AgendaRow
  start: number
  end: number
  lane: number
  lanes: number
}

export type WeekDay = {
  date: string
  blocks: WeekBlock[]
  untimed: AgendaRow[]
}

export type WeekLayout = {
  days: WeekDay[]
  startHour: number
  endHour: number
  total: number
}

const MIN_BLOCK_MINUTES = 45
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 20

/**
 * Acomoda las sesiones de la semana en una cuadrícula horaria: las que se cruzan
 * se reparten en carriles y el rango de horas se ajusta a lo que hay.
 */
export function layoutWeek(rows: AgendaRow[], monday: string, offeringId: string | null = null): WeekLayout {
  const dates = weekDates(monday)
  const timed: WeekDay[] = dates.map((date) => ({ date, blocks: [], untimed: [] }))
  const byDate = new Map(timed.map((day) => [day.date, day]))
  let minStart = Infinity
  let maxEnd = -Infinity
  let total = 0
  for (const row of rows) {
    if (offeringId && row.offering_id !== offeringId) continue
    const day = byDate.get(row.session_date)
    if (!day) continue
    total += 1
    const start = minutesOf(row.start_time)
    if (start === null) {
      day.untimed.push(row)
      continue
    }
    const rawEnd = minutesOf(row.end_time)
    const end = Math.max(rawEnd ?? start + 60, start + MIN_BLOCK_MINUTES)
    day.blocks.push({ item: row, start, end, lane: 0, lanes: 1 })
    minStart = Math.min(minStart, start)
    maxEnd = Math.max(maxEnd, end)
  }
  for (const day of timed) assignLanes(day.blocks)
  const hasTimed = Number.isFinite(minStart)
  const startHour = hasTimed ? Math.max(0, Math.min(DEFAULT_START_HOUR, Math.floor(minStart / 60))) : DEFAULT_START_HOUR
  const endHour = hasTimed ? Math.min(24, Math.max(DEFAULT_END_HOUR, Math.ceil(maxEnd / 60))) : DEFAULT_END_HOUR
  return { days: timed, startHour, endHour, total }
}

function assignLanes(blocks: WeekBlock[]): void {
  blocks.sort((a, b) => a.start - b.start || a.end - b.end)
  let cluster: WeekBlock[] = []
  let clusterEnd = -1
  const closeCluster = () => {
    const laneEnds: number[] = []
    for (const block of cluster) {
      let lane = laneEnds.findIndex((end) => end <= block.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(block.end)
      } else {
        laneEnds[lane] = block.end
      }
      block.lane = lane
    }
    for (const block of cluster) block.lanes = laneEnds.length
    cluster = []
  }
  for (const block of blocks) {
    if (cluster.length > 0 && block.start >= clusterEnd) closeCluster()
    cluster.push(block)
    clusterEnd = cluster.length === 1 ? block.end : Math.max(clusterEnd, block.end)
  }
  if (cluster.length > 0) closeCluster()
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
