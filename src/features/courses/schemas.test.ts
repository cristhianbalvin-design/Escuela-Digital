import { describe, expect, it } from 'vitest'
import { courseSchema, readableError, slugify } from './schemas'

describe('courseSchema', () => {
  it('valida identificadores y cantidad de semanas', () => {
    const base = {
      title: 'Curso', slug: 'curso', category: [], level: [],
      language: ['es'], structure: 'weekly', weeks: 4,
    }
    expect(courseSchema.safeParse(base).success).toBe(true)
    expect(courseSchema.safeParse({ ...base, slug: 'admin' }).success).toBe(false)
    expect(courseSchema.safeParse({ ...base, weeks: 0 }).success).toBe(false)
  })

  it('genera un identificador legible', () => {
    expect(slugify('Gestión Ágil 101')).toBe('gestion-agil-101')
  })
})

describe('readableError', () => {
  it('traduce los códigos de permisos, reglas y duplicados', () => {
    expect(readableError({ code: '42501' })).toContain('permiso')
    expect(readableError({ code: '23505' })).toContain('existe')
    expect(readableError({
      code: '23514', message: 'La versión necesita al menos un módulo con una lección',
    })).toContain('módulo')
  })
})
