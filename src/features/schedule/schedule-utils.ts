import { z } from 'zod'

export const scheduleRowSchema = z.object({
  lesson_id: z.string(),
  module_title: z.string(),
  lesson_title: z.string(),
  session_date: z.string().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  attendance_session_id: z.string().nullable(),
})
export const scheduleSchema = z.array(scheduleRowSchema)
export type ScheduleRow = z.infer<typeof scheduleRowSchema>

/** Edición local de una fila: fecha vacía significa "sin programar". */
export type ScheduleDraft = {
  lesson_id: string
  date: string
  start: string
  end: string
}

/** "08:30:00" → "08:30" (campo de hora). */
export function shortTime(value: string | null): string {
  return value ? value.slice(0, 5) : ''
}

export function rowsToDrafts(rows: ScheduleRow[]): ScheduleDraft[] {
  return rows.map((row) => ({
    lesson_id: row.lesson_id,
    date: row.session_date ?? '',
    start: shortTime(row.start_time),
    end: shortTime(row.end_time),
  }))
}

/** Solo las sesiones con fecha entran al calendario. */
export function draftsToItems(drafts: ScheduleDraft[]) {
  return drafts
    .filter((draft) => draft.date !== '')
    .map((draft) => ({
      lesson_id: draft.lesson_id,
      session_date: draft.date,
      start_time: draft.start || null,
      end_time: draft.end || null,
    }))
}

export function invalidTimes(drafts: ScheduleDraft[]): boolean {
  return drafts.some(
    (draft) => draft.date !== '' && draft.start !== '' && draft.end !== ''
      && draft.end <= draft.start,
  )
}

function parseIso(iso: string): Date {
  const parts = iso.split('-')
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Reparte `count` sesiones en orden desde `startIso`, usando solo los días de la
 * semana elegidos (0 = domingo … 6 = sábado).
 */
export function suggestDates(count: number, startIso: string, weekdays: number[]): string[] {
  if (count <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(startIso) || weekdays.length === 0) return []
  const allowed = new Set(weekdays)
  const cursor = parseIso(startIso)
  const dates: string[] = []
  for (let guard = 0; dates.length < count && guard < 366 * 5; guard += 1) {
    if (allowed.has(cursor.getUTCDay())) dates.push(toIso(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function applySuggestedDates(
  drafts: ScheduleDraft[], startIso: string, weekdays: number[],
): ScheduleDraft[] {
  const dates = suggestDates(drafts.length, startIso, weekdays)
  return drafts.map((draft, index) => ({ ...draft, date: dates[index] ?? draft.date }))
}

export type SchedulePlan = {
  startIso: string
  weekdays: number[]
  start: string
  end: string
}

/**
 * Aplica el plan (fecha de inicio, días de clase y horario) a todas las sesiones en orden.
 * Si el plan está incompleto no cambia nada. Luego cada sesión se puede ajustar a mano.
 */
export function applyPlan(drafts: ScheduleDraft[], plan: SchedulePlan): ScheduleDraft[] {
  const dates = suggestDates(drafts.length, plan.startIso, plan.weekdays)
  if (dates.length === 0) return drafts
  return drafts.map((draft, index) => {
    const date = dates[index]
    return date === undefined
      ? draft
      : { ...draft, date, start: plan.start, end: plan.end }
  })
}

function weekdayOf(iso: string): number {
  const parts = iso.split('-')
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))).getUTCDay()
}

/** Deduce el plan a partir de un calendario ya guardado (fecha más temprana, días y horario). */
export function inferPlan(drafts: ScheduleDraft[]): SchedulePlan {
  const dated = drafts.filter((draft) => draft.date !== '')
  if (dated.length === 0) return { startIso: '', weekdays: [], start: '', end: '' }
  const dates = dated.map((draft) => draft.date).sort()
  const weekdays = [...new Set(dates.map(weekdayOf))].sort((a, b) => a - b)
  return {
    startIso: dates[0] ?? '',
    weekdays,
    start: dated.find((draft) => draft.start !== '')?.start ?? '',
    end: dated.find((draft) => draft.end !== '')?.end ?? '',
  }
}

/** "2026-11-02" → "02/11/2026" sin pasar por zonas horarias. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}

export function formatRange(start: string | null, end: string | null): string {
  const a = shortTime(start)
  const b = shortTime(end)
  if (a && b) return `${a} – ${b}`
  return a || b
}

/** Agrupa filas consecutivas por módulo, conservando el orden recibido. */
export function groupByModule<T extends { module_title: string }>(
  rows: T[],
): { module: string; rows: T[] }[] {
  const groups: { module: string; rows: T[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.module === row.module_title) last.rows.push(row)
    else groups.push({ module: row.module_title, rows: [row] })
  }
  return groups
}
