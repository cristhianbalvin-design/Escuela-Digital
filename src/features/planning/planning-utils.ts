import { z } from 'zod'

export const kinds = ['explicacion', 'practica', 'evaluacion', 'descanso', 'interactiva', 'otro'] as const
export const itemSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200), minutes: z.number().int().min(1).max(1440).nullable(), kind: z.enum(kinds), notes: z.string().max(5000) })
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
