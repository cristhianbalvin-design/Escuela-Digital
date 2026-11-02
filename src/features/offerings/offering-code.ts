const STOP_WORDS = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'PARA', 'CON', 'Y', 'E', 'EN', 'A', 'AL', 'UN', 'UNA', 'POR',
])

/** Código legible de una edición: palabras clave del título + año y mes (p. ej. POWER-BI-IA-2026-11). */
export function generateOfferingCode(title: string, date: Date = new Date()): string {
  const words = title.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  const meaningful = words.filter((word) => !STOP_WORDS.has(word))
  const picked: string[] = []
  for (const word of (meaningful.length > 0 ? meaningful : words).slice(0, 3)) {
    if ([...picked, word].join('-').length > 16 && picked.length > 0) break
    picked.push(word)
  }
  const base = picked.join('-').slice(0, 16).replace(/-$/, '') || 'EDICION'
  const valid = Number.isNaN(date.getTime()) ? new Date() : date
  return `${base}-${valid.getFullYear()}-${String(valid.getMonth() + 1).padStart(2, '0')}`
}

export const MAX_CODE_ATTEMPTS = 9

/** Variante para resolver choques de código: base, base-2, base-3… */
export function codeAttempt(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`
}
