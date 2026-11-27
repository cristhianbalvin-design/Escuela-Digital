import { z } from 'zod'

// Ficha de actividad por bloque del guion. Las mismas reglas se repiten en SQL (app.sheet_clean).
export const toolKinds = ['none', 'native', 'external'] as const
export const teacherKeys = ['intro', 'prep', 'expected', 'solution', 'rubric', 'errors', 'contingency', 'closing'] as const
export type TeacherKey = typeof teacherKeys[number]
export type ToolKind = typeof toolKinds[number]

const promptId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
export const sheetPromptSchema = z.object({
  id: promptId, title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(6000),
}).strict()
export const sheetStepSchema = z.object({
  text: z.string().trim().min(1).max(1000), minutes: z.number().int().min(1).max(240).nullable(), prompt_id: promptId.nullable(),
}).strict()
export const maxSheetFileBytes = 26_214_400
const uuidPart = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** Archivo adjunto a un recurso: ruta `<tenant>/<lección>/<bloque>/<uuid>-<nombre>` en el almacén privado. */
export const sheetFileSchema = z.object({
  path: z.string().regex(new RegExp(`^${uuidPart}/${uuidPart}/${uuidPart}/[A-Za-z0-9._-]{1,200}$`)),
  name: z.string().trim().min(1).max(150), size: z.number().int().min(1).max(maxSheetFileBytes),
}).strict()
export const sheetResourceSchema = z.object({
  name: z.string().trim().min(1).max(150), audience: z.enum(['students', 'teacher']), status: z.enum(['pending', 'ready']),
  file: sheetFileSchema.optional(),
}).strict()
/** Recurso visto por el alumno: sin la ruta del archivo; `idx` identifica el recurso al pedir la descarga. */
export const publicResourceSchema = z.object({
  idx: z.number().int().min(0).max(14), name: z.string().trim().min(1).max(150), audience: z.literal('students'), status: z.enum(['pending', 'ready']),
  file: z.object({ name: z.string().trim().min(1).max(150), size: z.number().int().min(1).max(maxSheetFileBytes) }).strict().optional(),
}).strict()
const teacherText = z.string().max(6000)
export const sheetTeacherSchema = z.object({
  intro: teacherText.optional(), prep: teacherText.optional(), expected: teacherText.optional(), solution: teacherText.optional(),
  rubric: teacherText.optional(), errors: teacherText.optional(), contingency: teacherText.optional(), closing: teacherText.optional(),
}).strict()
const httpsUrl = z.string().max(500).regex(/^https:\/\/[^\s<>"']+$/)

const sheetShape = {
  tool_kind: z.enum(toolKinds),
  tool_name: z.string().trim().min(1).max(80).nullable(),
  tool_url: httpsUrl.nullable(),
  tool_feature: z.string().trim().min(1).max(120).nullable(),
  objective: z.string().max(600),
  context_md: z.string().max(6000),
  steps: z.array(sheetStepSchema).max(20),
  prompts: z.array(sheetPromptSchema).max(10),
  resources: z.array(sheetResourceSchema).max(15),
  deliverable_md: z.string().max(3000),
}
const refsAreValid = (value: { prompts: { id: string }[]; steps: { prompt_id: string | null }[] }) => {
  const ids = new Set(value.prompts.map((prompt) => prompt.id))
  return ids.size === value.prompts.length && value.steps.every((step) => step.prompt_id === null || ids.has(step.prompt_id))
}
export const sheetInputSchema = z.object({ ...sheetShape, teacher: sheetTeacherSchema }).strict().refine(refsAreValid)
/** Lo que devuelve el servidor a quienes gestionan la clase. */
export const sheetOutputSchema = z.object({
  ...sheetShape, teacher: sheetTeacherSchema, item_id: z.uuid(), updated_at: z.iso.datetime({ offset: true }),
}).strict()
/** Lo único que recibe el alumno: sin parte privada. Si llegara `teacher`, la lectura falla. */
export const publicSheetOutputSchema = z.object({
  ...sheetShape,
  resources: z.array(publicResourceSchema).max(15),
  item_id: z.uuid(), title: z.string(), minutes: z.number().int().nullable(), published_at: z.iso.datetime({ offset: true }),
}).strict()
export const publicationOutputSchema = z.object({ item_id: z.uuid().nullable(), published_at: z.iso.datetime({ offset: true }).nullable() }).strict()

export type SheetInput = z.infer<typeof sheetInputSchema>
export type SheetOutput = z.infer<typeof sheetOutputSchema>
export type PublicSheet = z.infer<typeof publicSheetOutputSchema>
export type SheetPrompt = z.infer<typeof sheetPromptSchema>
export type SheetStep = z.infer<typeof sheetStepSchema>
export type SheetResource = z.infer<typeof sheetResourceSchema>
export type SheetFile = z.infer<typeof sheetFileSchema>
export type PublicResource = z.infer<typeof publicResourceSchema>

export type SheetSection = 'tool' | 'objective' | 'context' | 'steps' | 'prompts' | 'resources' | 'deliverable'
export const allSections: SheetSection[] = ['tool', 'objective', 'context', 'steps', 'prompts', 'resources', 'deliverable']
/** Defensa adicional: el servidor ya exige https, pero nunca se enlaza otra cosa. */
export const safeHttps = (value: string | null): string | null => {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null } catch { return null }
}

export function emptySheet(): SheetInput {
  return { tool_kind: 'none', tool_name: null, tool_url: null, tool_feature: null, objective: '', context_md: '', steps: [], prompts: [],
    resources: [], deliverable_md: '', teacher: {} }
}
export function newPromptId(): string { return `p${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}` }

/** Una ficha sin contenido no se guarda: se borra del bloque. */
export function isEmptySheet(sheet: SheetInput): boolean {
  return sheet.tool_kind === 'none' && !sheet.tool_name && !sheet.tool_url && !sheet.tool_feature && !sheet.objective.trim()
    && !sheet.context_md.trim() && sheet.steps.length === 0 && sheet.prompts.length === 0 && sheet.resources.length === 0
    && !sheet.deliverable_md.trim() && Object.values(sheet.teacher).every((value) => !value || !value.trim())
}

const nullIfBlank = (value: string | null | undefined) => { const trimmed = (value ?? '').trim(); return trimmed === '' ? null : trimmed }

/** Limpia el borrador del editor antes de validarlo y guardarlo. */
export function cleanSheet(draft: SheetInput): SheetInput {
  const prompts = draft.prompts
    .filter((prompt) => prompt.title.trim() || prompt.text.trim())
    .map((prompt, index) => ({ ...prompt, title: prompt.title.trim() || `Prompt ${index + 1}`, text: prompt.text.trim() }))
  const ids = new Set(prompts.map((prompt) => prompt.id))
  const steps = draft.steps.filter((step) => step.text.trim())
    .map((step) => ({ text: step.text.trim(), minutes: step.minutes, prompt_id: step.prompt_id && ids.has(step.prompt_id) ? step.prompt_id : null }))
  const teacher = Object.fromEntries(Object.entries(draft.teacher).filter(([, value]) => typeof value === 'string' && value.trim() !== ''))
  return {
    tool_kind: draft.tool_kind, tool_name: nullIfBlank(draft.tool_name), tool_url: nullIfBlank(draft.tool_url), tool_feature: nullIfBlank(draft.tool_feature),
    objective: draft.objective.trim(), context_md: draft.context_md, steps, prompts,
    resources: draft.resources.filter((resource) => resource.name.trim()).map((resource) => ({ ...resource, name: resource.name.trim() })),
    deliverable_md: draft.deliverable_md, teacher: sheetTeacherSchema.parse(teacher),
  }
}

export function sheetFromOutput(sheet: SheetOutput | undefined): SheetInput {
  if (!sheet) return emptySheet()
  const { item_id: _item, updated_at: _updated, ...rest } = sheet
  void _item; void _updated
  return rest
}

/** Copia el texto íntegro del prompt, sin etiquetas de interfaz. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'
      document.body.appendChild(area); area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch { return false }
  }
}

/** Tipos admitidos para los recursos, con el tipo MIME que acepta el almacén. */
export const sheetFileTypes: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  md: 'text/markdown', txt: 'text/plain',
}
export const sheetFileAccept = Object.keys(sheetFileTypes).map((extension) => `.${extension}`).join(',')
export function checkSheetFile(name: string, size: number): 'ok' | 'type' | 'size' | 'empty' {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (!Object.hasOwn(sheetFileTypes, extension)) return 'type'
  if (size <= 0) return 'empty'
  return size > maxSheetFileBytes ? 'size' : 'ok'
}
/** Nombre seguro para la ruta de almacenamiento: sin acentos, sin espacios ni símbolos, con la extensión intacta. */
export function safeFileName(name: string): string {
  const clean = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  return (clean.length > 120 ? clean.slice(-120) : clean) || 'archivo'
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
