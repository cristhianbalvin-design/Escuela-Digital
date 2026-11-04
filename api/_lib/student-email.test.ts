import { describe, expect, it } from 'vitest'
import { parseStudentEmailBody } from './student-email.js'

const T = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'

describe('parseStudentEmailBody', () => {
  it('acepta un cuerpo válido y normaliza el correo', () => {
    expect(parseStudentEmailBody({ tenant_id: T, user_id: U, email: ' Ana@Escuela.PE ' }))
      .toEqual({ tenantId: T, userId: U, email: 'ana@escuela.pe' })
  })
  it('rechaza ids o correos inválidos', () => {
    expect(parseStudentEmailBody(null)).toBeNull()
    expect(parseStudentEmailBody({ tenant_id: 'x', user_id: U, email: 'a@b.co' })).toBeNull()
    expect(parseStudentEmailBody({ tenant_id: T, user_id: U, email: 'sin-arroba' })).toBeNull()
  })
})
