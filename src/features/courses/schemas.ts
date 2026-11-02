import { z } from 'zod'

const reserved = new Set([
  'www', 'app', 'verifica', 'api', 'admin', 'plataforma',
  'static', 'assets', 'mail', 'docs', 'status',
])

export const courseSchema = z.object({
  title: z.string().trim().min(1, 'Ingresa un título'),
  slug: z.string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usa letras minúsculas, números y guiones')
    .refine((value) => !reserved.has(value), 'Este identificador está reservado'),
  category: z.array(z.string()),
  level: z.array(z.string()),
  language: z.array(z.string()).min(1, 'Elige al menos un idioma'),
  structure: z.enum(['empty', 'weekly']),
  weeks: z.coerce.number<number>().int().min(1).max(52),
})

export type CourseValues = z.infer<typeof courseSchema>

export function slugify(title: string): string {
  return title.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function readableError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
  if (code === '42501') return 'No tienes permiso para realizar esta acción.'
  if (code === '23505') return 'Ya existe un registro con estos datos.'
  if (code === '23514') {
    const message = typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : ''
    if (message.includes('módulo con una lección')) {
      return 'Para publicar, agrega al menos un módulo con una lección.'
    }
    return 'La acción no cumple una regla del curso o la edición. Revisa los datos y vuelve a intentar.'
  }
  return 'No se pudo completar la acción. Inténtalo de nuevo.'
}
