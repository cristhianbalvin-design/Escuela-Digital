import { describe, expect, it } from 'vitest'
import { offeringSchema } from './schemas'

const valid = {
  versionId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  title: 'Edición de prueba',
  code: 'ED-1',
  modality: 'live',
  startsAt: '2026-11-01T10:00',
  endsAt: '2026-11-02T10:00',
  seats: '20',
  enrollmentMode: 'invite',
  timezone: 'America/Lima',
}

describe('offeringSchema', () => {
  it('acepta fechas y cupos válidos', () => {
    expect(offeringSchema.safeParse(valid).success).toBe(true)
  })

  it('rechaza cierre anterior al inicio y cupo no positivo', () => {
    expect(offeringSchema.safeParse({
      ...valid, endsAt: '2026-10-01T10:00', seats: '0',
    }).success).toBe(false)
  })
})
