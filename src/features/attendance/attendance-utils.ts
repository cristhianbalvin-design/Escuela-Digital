import { z } from 'zod'

export const STATUSES = ['present', 'late', 'absent', 'excused'] as const
export type AttendanceStatus = (typeof STATUSES)[number]

const statusSchema = z.enum(STATUSES)

const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  session_date: z.string(),
  status: z.enum(['open', 'closed']),
  present: z.number(),
  late: z.number(),
  excused: z.number(),
  absent: z.number(),
  marked: z.number(),
})

const summaryStudentSchema = z.object({
  enrollment_id: z.string(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
  pct: z.number().nullable(),
  attended: z.number(),
  total: z.number(),
  by_session: z.record(z.string(), statusSchema),
})

export const summarySchema = z.object({
  sessions: z.array(sessionSchema),
  students: z.array(summaryStudentSchema),
})

export const sheetSchema = z.object({
  session: z.object({
    id: z.string(),
    offering_id: z.string(),
    title: z.string(),
    session_date: z.string(),
    status: z.enum(['open', 'closed']),
    closed_at: z.string().nullable(),
  }),
  students: z.array(z.object({
    enrollment_id: z.string(),
    email: z.string().nullable(),
    full_name: z.string().nullable(),
    status: statusSchema.nullable(),
    note: z.string().nullable(),
  })),
  events: z.array(z.object({
    type: z.enum(['closed', 'reopened']),
    reason: z.string().nullable(),
    created_at: z.string(),
    actor: z.string().nullable(),
  })),
})

export type AttendanceSummary = z.infer<typeof summarySchema>
export type AttendanceSheet = z.infer<typeof sheetSchema>
export type SummarySession = AttendanceSummary['sessions'][number]
export type SummaryStudent = AttendanceSummary['students'][number]

export const STATUS_LETTER: Record<AttendanceStatus, string> = {
  present: 'P', late: 'T', absent: 'F', excused: 'J',
}

/** Fecha local de hoy como YYYY-MM-DD (para el campo de fecha). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** "2026-11-02" → "02/11/2026" sin pasar por zonas horarias. */
export function formatSessionDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}

export function formatPct(pct: number | null): string {
  return pct === null ? '—' : `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
}

export function countMarks(
  students: { status: AttendanceStatus | null }[],
): Record<AttendanceStatus | 'unmarked', number> {
  const counts = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 }
  for (const student of students) {
    counts[student.status ?? 'unmarked'] += 1
  }
  return counts
}

function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function attendanceToCsv(summary: AttendanceSummary): string {
  const closed = summary.sessions.filter((session) => session.status === 'closed')
  const header = [
    'Alumno', 'Correo',
    ...closed.map((session) => `${session.title} (${formatSessionDate(session.session_date)})`),
    'Asistió', 'Total', 'Asistencia %',
  ]
  const rows = summary.students.map((student) => [
    student.full_name ?? '',
    student.email ?? '',
    ...closed.map((session) => {
      const status = student.by_session[session.id]
      return status ? STATUS_LETTER[status] : ''
    }),
    String(student.attended),
    String(student.total),
    student.pct === null ? '' : String(student.pct),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
