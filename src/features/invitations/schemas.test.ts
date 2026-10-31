import { describe, expect, it } from 'vitest'
import { invitationSignupSchema } from './schemas'
import { offeringInvitationSchema } from '@/features/offerings/schemas'

describe('esquemas de invitación', () => {
  it('valida el correo para generar un enlace', () => {
    expect(offeringInvitationSchema.safeParse({ email: 'mal-correo' }).success).toBe(false)
    expect(offeringInvitationSchema.safeParse({
      email: ' alumno@example.com ',
    }).data).toEqual({ email: 'alumno@example.com' })
  })

  it('valida longitud de contraseña y confirmación', () => {
    const valid = {
      fullName: '',
      password: 'contraseña-segura',
      confirmPassword: 'contraseña-segura',
    }
    expect(invitationSignupSchema.safeParse(valid).success).toBe(true)
    expect(invitationSignupSchema.safeParse({
      ...valid, password: 'corta', confirmPassword: 'corta',
    }).success).toBe(false)
    expect(invitationSignupSchema.safeParse({
      ...valid, confirmPassword: 'diferente',
    }).success).toBe(false)
    expect(invitationSignupSchema.safeParse({
      ...valid,
      password: 'x'.repeat(73),
      confirmPassword: 'x'.repeat(73),
    }).success).toBe(false)
  })
})
