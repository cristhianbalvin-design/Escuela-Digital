import { describe, expect, it } from 'vitest'
import {
  assignmentsByOffering, availableInstructors, certificateStatusKey, filterByText,
  filterOfferings, NO_INSTRUCTOR, personName, type Assignment, type Instructor,
} from './admin-utils'

const assignment = (offering: string, user: string, role: 'lead' | 'assistant' = 'lead'): Assignment => ({
  offering_id: offering, user_id: user, role, email: `${user}@x.com`, full_name: null,
})
const instructor = (user: string): Instructor => ({
  user_id: user, email: `${user}@x.com`, full_name: user.toUpperCase(), role: 'instructor',
})
const offering = (id: string, title: string, status = 'open') => ({
  id, title, code: `C-${id}`, clientName: 'Cliente Ñ', status,
})

describe('personName', () => {
  it('usa el nombre y, si falta, el correo', () => {
    expect(personName({ full_name: ' Ana ', email: 'a@x.com' })).toBe('Ana')
    expect(personName({ full_name: null, email: 'a@x.com' })).toBe('a@x.com')
  })
})

describe('asignaciones', () => {
  it('agrupa por edición', () => {
    const map = assignmentsByOffering([assignment('o1', 'u1'), assignment('o1', 'u2'), assignment('o2', 'u1')])
    expect(map.get('o1')).toHaveLength(2)
    expect(map.get('o2')).toHaveLength(1)
  })
  it('ofrece solo los docentes aún no asignados', () => {
    const free = availableInstructors([instructor('u1'), instructor('u2')], [assignment('o1', 'u1')])
    expect(free.map((item) => item.user_id)).toEqual(['u2'])
  })
})

describe('filtros de ediciones', () => {
  const list = [offering('1', 'Automatización'), offering('2', 'Power BI', 'finished'), offering('3', 'Excel')]
  const map = assignmentsByOffering([assignment('1', 'u1'), assignment('2', 'u2')])
  it('filtra por texto sin acentos, por estado y por cliente', () => {
    expect(filterOfferings(list, { text: 'automatizacion', status: '', instructor: '' }, map)).toHaveLength(1)
    expect(filterOfferings(list, { text: 'cliente n', status: '', instructor: '' }, map)).toHaveLength(3)
    expect(filterOfferings(list, { text: '', status: 'finished', instructor: '' }, map).map((o) => o.id)).toEqual(['2'])
  })
  it('filtra por docente y por ediciones sin docente', () => {
    expect(filterOfferings(list, { text: '', status: '', instructor: 'u1' }, map).map((o) => o.id)).toEqual(['1'])
    expect(filterOfferings(list, { text: '', status: '', instructor: NO_INSTRUCTOR }, map).map((o) => o.id)).toEqual(['3'])
  })
})

describe('utilidades', () => {
  it('filtra listas por texto', () => {
    expect(filterByText(['Árbol', 'Mesa'], 'arbol', (x) => x)).toEqual(['Árbol'])
    expect(filterByText(['Árbol', 'Mesa'], '  ', (x) => x)).toHaveLength(2)
  })
  it('traduce el estado del certificado', () => {
    expect(certificateStatusKey('pending_render')).toBe('generating')
    expect(certificateStatusKey('revoked')).toBe('revoked')
    expect(certificateStatusKey('reissued')).toBe('reissued')
    expect(certificateStatusKey('issued')).toBe('issued')
  })
})
