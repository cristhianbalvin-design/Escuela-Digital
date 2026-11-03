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
})
export const resourcesSchema = z.array(resourceSchema)
export type LessonResource = z.infer<typeof resourceSchema>

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
