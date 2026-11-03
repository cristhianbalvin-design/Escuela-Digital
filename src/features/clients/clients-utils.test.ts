import { describe, expect, it } from 'vitest'
import { clientNameSchema, clientSlug, slugAttempt } from './clients-utils'

describe('clientSlug', () => {
  it('normaliza acentos, espacios y signos', () => {
    expect(clientSlug('Banco Andino S.A.')).toBe('banco-andino-s-a')
    expect(clientSlug('Compañía Ñandú')).toBe('compania-nandu')
  })
  it('evita identificadores vacíos o reservados', () => {
    expect(clientSlug('???')).toBe('cliente-nuevo')
    expect(clientSlug('Admin')).toBe('cliente-admin')
  })
})

describe('slugAttempt y nombre', () => {
  it('agrega sufijo desde el segundo intento', () => {
    expect(slugAttempt('acme', 1)).toBe('acme')
    expect(slugAttempt('acme', 3)).toBe('acme-3')
  })
  it('exige un nombre no vacío', () => {
    expect(clientNameSchema.safeParse('  ').success).toBe(false)
    expect(clientNameSchema.safeParse(' Acme ').data).toBe('Acme')
  })
})
