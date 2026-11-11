import { z } from 'zod'
import { parseCsv } from '@/features/imports/import-utils'

export const kinds = ['explicacion', 'practica', 'evaluacion', 'descanso', 'interactiva', 'otro'] as const
export const itemSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200), minutes: z.number().int().min(1).max(1440).nullable(), kind: z.enum(kinds), notes: z.string().max(5000), resource: z.string().trim().min(1).max(120).nullable().default(null), starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null) })
export const fileSchema = z.object({ id: z.string(), name: z.string(), storage_path: z.string(), size_bytes: z.number() })
export const planSchema = z.object({ items: z.array(itemSchema), files: z.array(fileSchema) })
export const progressSchema = z.object({ item_id: z.string(), done: z.boolean(), done_at: z.string().nullable(), done_by: z.string().nullable() })
export const sessionSchema = planSchema.extend({ can_mark: z.boolean(), progress: z.array(progressSchema) })
export const summariesSchema = z.array(z.object({ lesson_id: z.string(), lesson_title: z.string(), module_title: z.string(), session_date: z.string().nullable(), start_time: z.string().nullable(), end_time: z.string().nullable(), total: z.number(), done: z.number() }))
export type PlanItem = z.infer<typeof itemSchema>
export type PlanFile = z.infer<typeof fileSchema>
export type SessionPlan = z.infer<typeof sessionSchema>

export function parseActivities(text: string): { items: PlanItem[]; errors: number[] } {
  const items: PlanItem[] = []
  const errors: number[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const parts = line.split('|')
    const raw = parts[1]?.trim()
    const minutes = raw ? Number(raw) : null
    const result = itemSchema.safeParse({ id: crypto.randomUUID(), title: parts[0]?.trim(), minutes, kind: 'otro', notes: '' })
    if (parts.length > 2 || !result.success) errors.push(index + 1)
    else items.push(result.data)
  })
  return { items, errors }
}
export type PlanTableResult = { rows: { line: number; item: PlanItem }[]; ignored: number[]; hasSchedule: boolean }
const clean = (value: string) => value.replace(/\*\*/g, '').trim()
const normalized = (value: string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const emptyResource = (value: string) => /^(?:[-\u2013\u2014\u2026]|)$/.test(value.trim()) ? null : value.trim()

function kindFromTitle(title: string): PlanItem['kind'] {
  const value = normalized(title)
  if (/break|descanso|pausa/.test(value)) return 'descanso'
  if (/quiz|dinamica|votacion|encuesta|mentimeter|kahoot|interactiv/.test(value)) return 'interactiva'
  if (/evaluacion|evaluemos|examen/.test(value)) return 'evaluacion'
  if (/actividad|taller|practica|ejercicio|mapa/.test(value)) return 'practica'
  if (/demo|fundamentos|explic|presentacion|riesgos/.test(value)) return 'explicacion'
  return 'otro'
}
function duration(value: string): number | null {
  const v = normalized(value).trim()
  if (!v || /^[-\u2013\u2014\u2026]$/.test(v)) return null
  if (/^\d+$/.test(v)) return Number(v)
  const match = v.match(/^(?:(\d+)\s*h(?:oras?)?\s*)?(?:(\d+)\s*m(?:in(?:utos?)?)?\s*)?$/)
  return match && (match[1] || match[2]) ? Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) : NaN
}
function timePart(value: string, inherited?: string): { minutes: number; suffix?: string } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])?\s*\.?\s*m\.?\s*$|^(\d{1,2}):(\d{2})\s*$/i)
  if (!match) return null
  let hour = Number(match[1] ?? match[4]); const minute = Number(match[2] ?? match[5]); const suffix = match[3]?.toLowerCase() ?? inherited
  if (minute > 59 || (suffix ? hour < 1 || hour > 12 : hour > 23)) return null
  if (suffix) hour = hour % 12 + (suffix === 'p' ? 12 : 0)
  return { minutes: hour * 60 + minute, suffix }
}
const clock = (minutes: number) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
function timeRange(value: string) {
  const parts = clean(value).split(/\s*[-\u2013\u2014]\s*/)
  if (parts.length !== 2) return null
  const end = timePart(parts[1]!); const start = timePart(parts[0]!, end?.suffix)
  if (!start || !end) return null
  return { start: clock(start.minutes), minutes: (end.minutes - start.minutes + 1440) % 1440 }
}

export function parsePlanRows(rows: string[][]): PlanTableResult {
  const result: PlanTableResult = { rows: [], ignored: [], hasSchedule: false }
  let columns: number[] | null = null
  let first = true
  rows.forEach((raw, index) => {
    const cells = raw.map((cell) => clean(String(cell ?? '')))
    if (cells.length > 1 && cells[0] === '' && cells[cells.length - 1] === '') { cells.shift(); cells.pop() }
    if (cells.every((c) => !c) || cells.every((c) => /^:?-{3,}:?$/.test(c))) { result.ignored.push(index + 1); return }
    if (first) {
      first = false
      const labels = cells.map((cell) => normalized(cell).replace(/[¿?]/g, '').trim())
      const names = [/^(horario|hora)$/, /^(duracion|minutos|min)$/, /^(actividad|bloque|titulo)(\s*\/\s*(actividad|bloque|titulo))*$/, /^(que se trabajara|contenido|descripcion|notas)$/, /^(recurso|herramienta)$/]
      const detected = names.map((pattern) => labels.findIndex((label) => pattern.test(label)))
      if (rows.length > 1 && (detected[2]! >= 0 || detected.filter((i) => i >= 0).length >= 2)) { columns = detected; result.ignored.push(index + 1); return }
    }
    if (cells.some((c) => /^total(?:\s+\d+\s*(?:min(?:utos?)?)?)?$/i.test(normalized(c)))) { result.ignored.push(index + 1); return }
    const map = columns ?? (cells.length <= 2 ? [-1, 1, 0, -1, -1] : [0, 1, 2, 3, 4])
    const get = (i: number) => map[i]! < 0 ? '' : (cells[map[i]!] ?? '')
    const range = timeRange(get(0)); const singleTime = timePart(get(0)); const rawDuration = get(1); const parsedDuration = duration(rawDuration)
    const item: PlanItem = { id: crypto.randomUUID(), title: get(2), minutes: parsedDuration ?? range?.minutes ?? null, kind: kindFromTitle(get(2)), notes: get(3), resource: emptyResource(get(4)), starts_at: range?.start ?? (singleTime ? clock(singleTime.minutes) : null) ?? (get(0) && !/^[-\u2013\u2014\u2026]$/.test(get(0)) ? get(0) : null) }
    if (get(0) && !/^[-\u2013\u2014\u2026]$/.test(get(0))) result.hasSchedule = true
    result.rows.push({ line: index + 1, item })
  })
  return result
}
export function parsePlanTable(text: string): PlanTableResult {
  const source = text.replace(/^\uFEFF/, '')
  const first = source.split(/\r?\n/).find((line) => line.trim()) ?? ''
  let rows: string[][]
  if (first.includes('\t')) rows = source.split(/\r?\n/).map((line) => line.split('\t'))
  else if (first.includes('|')) rows = source.split(/\r?\n/).map((line) => line.split('|'))
  else if (first.includes(',') || first.includes(';')) rows = parseCsv(source)
  else rows = source.split(/\r?\n/).map((line) => [line])
  return parsePlanRows(rows)
}
export function activityRanges(items: PlanItem[], sessionStart: string | null): (string | null)[] {
  let offset = 0
  const base = sessionStart && /^([01]\d|2[0-3]):[0-5]\d/.test(sessionStart) ? Number(sessionStart.slice(0, 2)) * 60 + Number(sessionStart.slice(3, 5)) : null
  return items.map((item) => {
    const own = item.starts_at ? Number(item.starts_at.slice(0, 2)) * 60 + Number(item.starts_at.slice(3, 5)) : null
    const start = own ?? (base === null ? null : base + offset)
    offset += item.minutes ?? 0
    return start === null ? null : item.minutes === null ? clock(start) : `${clock(start)} \u2013 ${clock(start + item.minutes)}`
  })
}
export function planProgress(items: PlanItem[], doneIds: Set<string>) {
  const done = items.filter((item) => doneIds.has(item.id)).length
  return { done, total: items.length, percent: items.length ? Math.round(done * 100 / items.length) : 0 }
}
export function planMinutes(items: PlanItem[], start: string | null, end: string | null) {
  const total = items.reduce((sum, item) => sum + (item.minutes ?? 0), 0)
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const session = start && end ? toMinutes(end) - toMinutes(start) : null
  return { total, session: session !== null && session > 0 ? session : null }
}
