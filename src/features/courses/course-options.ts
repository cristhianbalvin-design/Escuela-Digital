export const CATEGORY_OPTIONS = [
  'Datos y analítica', 'Inteligencia artificial', 'Tecnología y programación',
  'Ofimática', 'Negocios y gestión', 'Finanzas y contabilidad', 'Marketing y ventas',
  'Logística y operaciones', 'Habilidades blandas', 'Educación y docencia', 'Salud',
  'Idiomas',
] as const

export const LEVEL_OPTIONS = ['Básico', 'Intermedio', 'Avanzado'] as const

export const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
  { value: 'fr', label: 'Francés' },
  { value: 'de', label: 'Alemán' },
  { value: 'it', label: 'Italiano' },
  { value: 'qu', label: 'Quechua' },
] as const

/** Las listas se guardan como texto separado por comas (columnas de texto existentes). */
export function joinValues(values: string[]): string | null {
  const clean = values.map((value) => value.trim().replace(/,/g, ' ')).filter(Boolean)
  return clean.length > 0 ? clean.join(', ') : null
}

export function splitValues(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

export function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.value === code)?.label ?? code
}
