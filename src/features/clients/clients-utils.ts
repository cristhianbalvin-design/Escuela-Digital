import { z } from 'zod'

const RESERVED = new Set([
  'www', 'app', 'verifica', 'api', 'admin', 'plataforma',
  'static', 'assets', 'mail', 'docs', 'status',
])

export const clientNameSchema = z.string().trim().min(1).max(120)

/** "Banco Andino S.A." → "banco-andino-s-a"; nunca vacío ni reservado. */
export function clientSlug(name: string): string {
  const base = name.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  if (base === '' || RESERVED.has(base)) return `cliente-${base || 'nuevo'}`
  return base
}

/** Variante para reintentar cuando el identificador ya existe: base, base-2, base-3… */
export function slugAttempt(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`
}

export type ClientStatus = 'active' | 'inactive'
