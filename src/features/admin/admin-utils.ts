import { z } from 'zod'

export const instructorSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  full_name: z.string().nullable(),
  role: z.string(),
})
export const instructorsSchema = z.array(instructorSchema)
export type Instructor = z.infer<typeof instructorSchema>

export const assignmentSchema = z.object({
  offering_id: z.string(),
  user_id: z.string(),
  role: z.enum(['lead', 'assistant']),
  email: z.string(),
  full_name: z.string().nullable(),
})
export const assignmentsSchema = z.array(assignmentSchema)
export type Assignment = z.infer<typeof assignmentSchema>
export type InstructorRole = Assignment['role']

export const adminCertificateSchema = z.object({
  id: z.string(),
  code: z.string(),
  student_name: z.string(),
  course_title: z.string(),
  offering_id: z.string(),
  offering_title: z.string(),
  client_name: z.string(),
  status: z.string(),
  issued_at: z.string(),
  revoked_at: z.string().nullable(),
  pdf_path: z.string().nullable(),
})
export const adminCertificatesSchema = z.array(adminCertificateSchema)
export type AdminCertificate = z.infer<typeof adminCertificateSchema>

export function personName(person: { full_name: string | null; email: string }): string {
  return person.full_name?.trim() || person.email
}

export function assignmentsByOffering(list: Assignment[]): Map<string, Assignment[]> {
  const map = new Map<string, Assignment[]>()
  for (const item of list) {
    const current = map.get(item.offering_id) ?? []
    current.push(item)
    map.set(item.offering_id, current)
  }
  return map
}

export function availableInstructors(all: Instructor[], assigned: Assignment[]): Instructor[] {
  const taken = new Set(assigned.map((item) => item.user_id))
  return all.filter((item) => !taken.has(item.user_id))
}

export const NO_INSTRUCTOR = '__none'

type OfferingLike = { id: string; title: string; code: string; clientName: string; status: string }
export type OfferingFilters = { text: string; status: string; instructor: string }

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filterOfferings<T extends OfferingLike>(
  offerings: T[], filters: OfferingFilters, assignments: ReadonlyMap<string, Assignment[]>,
): T[] {
  const needle = normalize(filters.text.trim())
  return offerings.filter((offering) => {
    if (filters.status && offering.status !== filters.status) return false
    const assigned = assignments.get(offering.id) ?? []
    if (filters.instructor === NO_INSTRUCTOR && assigned.length > 0) return false
    if (filters.instructor && filters.instructor !== NO_INSTRUCTOR
      && !assigned.some((item) => item.user_id === filters.instructor)) return false
    if (needle === '') return true
    return normalize(`${offering.title} ${offering.code} ${offering.clientName}`).includes(needle)
  })
}

export function filterByText<T>(items: T[], text: string, pick: (item: T) => string): T[] {
  const needle = normalize(text.trim())
  return needle === '' ? items : items.filter((item) => normalize(pick(item)).includes(needle))
}

export function certificateStatusKey(status: string): 'issued' | 'revoked' | 'reissued' | 'generating' {
  if (status === 'revoked') return 'revoked'
  if (status === 'reissued') return 'reissued'
  if (status === 'pending_render') return 'generating'
  return 'issued'
}
