import { z } from 'zod'

export const memberSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  full_name: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  created_at: z.string(),
  clients: z.array(z.string()),
})
export type SchoolMember = z.infer<typeof memberSchema>

export const pendingInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  client_name: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
  expired: z.boolean(),
})
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>

export const peopleSchema = z.object({
  members: z.array(memberSchema),
  invitations: z.array(pendingInvitationSchema),
})
export type SchoolPeople = z.infer<typeof peopleSchema>

export const placeholderStudentSchema = z.object({
  user_id: z.string(),
  full_name: z.string().nullable(),
  clients: z.array(z.string()),
})
export const placeholderStudentsSchema = z.array(placeholderStudentSchema)
export type PlaceholderStudent = z.infer<typeof placeholderStudentSchema>

export const inviteResultSchema = z.object({
  id: z.string(),
  token: z.string(),
  expires_at: z.string(),
})

export type PeopleTab = 'instructors' | 'coordinators' | 'admins' | 'noEmail'

export const TAB_ROLES: Record<Exclude<PeopleTab, 'noEmail'>, string[]> = {
  instructors: ['instructor', 'instructor_guest'],
  coordinators: ['client_coordinator'],
  admins: ['owner', 'admin'],
}

export const INVITE_ROLES: Record<Exclude<PeopleTab, 'noEmail'>, string[]> = {
  instructors: ['instructor', 'instructor_guest'],
  coordinators: ['client_coordinator'],
  admins: ['admin'],
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  const email = value.trim()
  return email.length <= 254 && EMAIL.test(email)
}

export function membersOf(people: SchoolPeople, tab: Exclude<PeopleTab, 'noEmail'>): SchoolMember[] {
  return people.members.filter((member) => TAB_ROLES[tab].includes(member.role))
}

export function invitationsOf(people: SchoolPeople, tab: Exclude<PeopleTab, 'noEmail'>): PendingInvitation[] {
  return people.invitations.filter((item) => TAB_ROLES[tab].includes(item.role))
}

export function inviteLink(origin: string, token: string, tenantSlug: string | null): string {
  const search = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ''
  return `${origin}/invitacion/${token}${search}`
}

export function memberName(member: { full_name: string | null; email: string }): string {
  return member.full_name?.trim() || member.email
}

export function peopleErrorKey(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code) : ''
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message) : ''
  if (code === '42501') return 'peopleViews.errors.noPermission'
  if (message.includes('ya pertenece')) return 'peopleViews.errors.alreadyMember'
  if (code === '23514') return 'peopleViews.errors.invalid'
  return 'peopleViews.errors.generic'
}
