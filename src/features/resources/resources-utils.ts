import { z } from 'zod'

export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024
export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'zip', 'mp4',
] as const

export const resourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  size_bytes: z.number().nullable(),
  storage_path: z.string(),
  audience: z.enum(['students', 'teachers']).default('students'),
})
export const resourcesSchema = z.array(resourceSchema)
export type LessonResource = z.infer<typeof resourceSchema>
export type Audience = LessonResource['audience']
export const MAX_NAME_LENGTH = 120

/** Nombre nuevo para un archivo: recorta, limita el largo y conserva la extensión si se omite. */
export function renamedFile(oldName: string, typed: string): string | null {
  const clean = typed.replace(/\s+/g, ' ').trim()
  if (clean === '') return null
  const ext = extensionOf(oldName)
  const withExt = ext && extensionOf(clean) !== ext ? `${clean}.${ext}` : clean
  return withExt.slice(0, MAX_NAME_LENGTH)
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Nombre apto para una ruta de almacenamiento: sin acentos ni caracteres raros. */
export function safeFileName(name: string): string {
  const ext = extensionOf(name)
  const base = ext ? name.slice(0, name.length - ext.length - 1) : name
  const clean = base.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${clean || 'archivo'}${ext ? `.${ext}` : ''}`
}

export function resourcePath(
  tenantId: string, lessonId: string, fileName: string, uid: string,
): string {
  return `${tenantId}/${lessonId}/${uid}-${safeFileName(fileName)}`
}

export function kindOf(name: string): string {
  const ext = extensionOf(name)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'ppt' || ext === 'pptx') return 'presentation'
  if (ext === 'doc' || ext === 'docx' || ext === 'txt') return 'document'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'spreadsheet'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image'
  if (ext === 'mp4') return 'video'
  if (ext === 'zip') return 'archive'
  return 'file'
}

export type FileProblem = 'type' | 'size' | 'empty'

export function fileProblem(file: { name: string; size: number }): FileProblem | null {
  if (file.size === 0) return 'empty'
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) return 'type'
  if (file.size > MAX_RESOURCE_BYTES) return 'size'
  return null
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---- Marcas por edición: "enviado" y "usado en clase" ----

export const markSchema = z.object({
  resource_id: z.string(),
  shared_at: z.string().nullable(),
  used_at: z.string().nullable(),
})
export const marksSchema = z.array(markSchema)
export type ResourceMark = z.infer<typeof markSchema>
export type MarkState = { shared: boolean; used: boolean }

export function stateOf(mark: ResourceMark | undefined): MarkState {
  return { shared: !!mark?.shared_at, used: !!mark?.used_at }
}

/** Usado implica enviado; quitar "enviado" quita también "usado". */
export function toggleMark(
  current: MarkState, field: 'shared' | 'used', checked: boolean,
): MarkState {
  if (field === 'used') return checked ? { shared: true, used: true } : { ...current, used: false }
  return checked ? { ...current, shared: true } : { shared: false, used: false }
}

export type MarkProgress = { total: number; shared: number; used: number; done: boolean }

export function markProgress(
  resourceIds: string[], marks: ReadonlyMap<string, ResourceMark>,
): MarkProgress {
  let shared = 0
  let used = 0
  for (const id of resourceIds) {
    const state = stateOf(marks.get(id))
    if (state.shared) shared += 1
    if (state.used) used += 1
  }
  return { total: resourceIds.length, shared, used, done: resourceIds.length > 0 && used === resourceIds.length }
}

/** Fecha (AAAA-MM-DD) anterior al día de hoy en la zona de Lima. */
export function isPastDate(date: string | null | undefined, now: Date = new Date()): boolean {
  if (!date) return false
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(now)
  return date < today
}

export function formatMarkDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}`
}
