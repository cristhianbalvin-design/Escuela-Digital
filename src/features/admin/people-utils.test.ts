import { describe, expect, it } from 'vitest'
import {
  inviteLink, invitationsOf, isValidEmail, memberName, membersOf, peopleErrorKey,
  type SchoolPeople,
} from './people-utils'

const people: SchoolPeople = {
  members: [
    { user_id: 'a', email: 'a@x.com', full_name: 'Ana', role: 'instructor', status: 'active', created_at: '2026-01-01', clients: [] },
    { user_id: 'b', email: 'b@x.com', full_name: null, role: 'client_coordinator', status: 'active', created_at: '2026-01-01', clients: ['UDEP'] },
    { user_id: 'c', email: 'c@x.com', full_name: null, role: 'owner', status: 'active', created_at: '2026-01-01', clients: [] },
    { user_id: 'd', email: 'd@x.com', full_name: null, role: 'instructor_guest', status: 'suspended', created_at: '2026-01-01', clients: [] },
  ],
  invitations: [
    { id: '1', email: 'n@x.com', role: 'admin', client_name: null, expires_at: '2026-02-01', created_at: '2026-01-01', expired: false },
    { id: '2', email: 'm@x.com', role: 'instructor', client_name: null, expires_at: '2026-02-01', created_at: '2026-01-01', expired: true },
  ],
}

describe('people-utils', () => {
  it('agrupa miembros por pestaña', () => {
    expect(membersOf(people, 'instructors').map((m) => m.user_id)).toEqual(['a', 'd'])
    expect(membersOf(people, 'coordinators').map((m) => m.user_id)).toEqual(['b'])
    expect(membersOf(people, 'admins').map((m) => m.user_id)).toEqual(['c'])
  })

  it('agrupa invitaciones por pestaña', () => {
    expect(invitationsOf(people, 'admins').map((i) => i.id)).toEqual(['1'])
    expect(invitationsOf(people, 'instructors').map((i) => i.id)).toEqual(['2'])
  })

  it('valida correos', () => {
    expect(isValidEmail(' ana@escuela.pe ')).toBe(true)
    expect(isValidEmail('ana@escuela')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('arma el enlace con la escuela', () => {
    expect(inviteLink('https://senda.tideo.tech', 'tok', 'tideo')).toBe('https://senda.tideo.tech/invitacion/tok?tenant=tideo')
    expect(inviteLink('https://senda.tideo.tech', 'tok', null)).toBe('https://senda.tideo.tech/invitacion/tok')
  })

  it('usa el correo si no hay nombre', () => {
    expect(memberName({ full_name: ' ', email: 'a@x.com' })).toBe('a@x.com')
    expect(memberName({ full_name: 'Ana', email: 'a@x.com' })).toBe('Ana')
  })

  it('traduce errores de la base', () => {
    expect(peopleErrorKey({ code: '42501', message: '' })).toBe('peopleViews.errors.noPermission')
    expect(peopleErrorKey({ code: '23514', message: 'Esa persona ya pertenece a la escuela' })).toBe('peopleViews.errors.alreadyMember')
    expect(peopleErrorKey({ code: '23514', message: 'otro' })).toBe('peopleViews.errors.invalid')
    expect(peopleErrorKey(new Error('x'))).toBe('peopleViews.errors.generic')
  })
})
