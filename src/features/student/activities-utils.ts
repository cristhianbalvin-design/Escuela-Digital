import type { Json, Database } from '@/lib/supabase/database.types'
import type { OutlineLesson } from './utils'

export type LessonActivity =
  | { type: 'quiz'; activityId: string }
  | { type: 'assignment'; activityId: string }

type ActivityLessonType = Extract<
  Database['public']['Enums']['lesson_type'],
  'quiz' | 'assignment'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function jsonRecord(value: Json | undefined): Record<string, Json | undefined> | null {
  return isRecord(value) ? value as Record<string, Json | undefined> : null
}

export function lessonActivity(lesson: OutlineLesson): LessonActivity | null {
  const type = lesson.type as ActivityLessonType
  const content = jsonRecord(lesson.content)
  if (!content) return null

  if (type === 'quiz' && typeof content.assessment_id === 'string') {
    return { type, activityId: content.assessment_id }
  }
  if (type === 'assignment' && typeof content.assignment_id === 'string') {
    return { type, activityId: content.assignment_id }
  }
  return null
}

export function formatActivityDate(
  value: string | null,
  timezone = 'America/Lima',
): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null
  try {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value))
  } catch {
    return null
  }
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null
  const wholeMinutes = Math.floor(minutes)
  const hours = Math.floor(wholeMinutes / 60)
  const remainingMinutes = wholeMinutes % 60

  if (hours === 0) return `${remainingMinutes} min`
  if (remainingMinutes === 0) return `${hours} h`
  return `${hours} h ${remainingMinutes} min`
}

const MAX_FILE_BYTES = 10 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'zip',
])

/** Quita el prefijo uuid que se añade al subir para evitar colisiones. */
export function displayFileName(name: string): string {
  const base = name.split('/').pop() ?? name
  return base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') || base
}

export function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[\\/]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 120)
  return sanitized || 'archivo'
}

export function validateFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
): 'file_too_large' | 'file_type_not_allowed' | null {
  if (file.size > MAX_FILE_BYTES) return 'file_too_large'
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_EXTENSIONS.has(extension) ? null : 'file_type_not_allowed'
}

export function remainingSeconds(
  deadlineIso: string,
  serverNowIso: string,
  clientNowAtFetchMs: number,
  nowMs: number,
): number {
  const deadlineMs = Date.parse(deadlineIso)
  const serverNowMs = Date.parse(serverNowIso)
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(serverNowMs)) return 0
  const estimate = serverNowMs + (nowMs - clientNowAtFetchMs)
  return Math.max(0, Math.ceil((deadlineMs - estimate) / 1000))
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = safe % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(rest).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

export function buildAnswer(type: string, value: unknown): Json | null {
  if (type === 'single') {
    return typeof value === 'string' && value.length > 0
      ? { option_id: value } : null
  }
  if (type === 'multiple') {
    return Array.isArray(value) && value.every((v) => typeof v === 'string')
      ? { option_ids: value as string[] } : null
  }
  if (type === 'true_false') {
    return typeof value === 'boolean' ? { value } : null
  }
  if (type === 'short' || type === 'essay') {
    return typeof value === 'string' && value.length > 0 ? { text: value } : null
  }
  return null
}

export function isAnswered(type: string, answer: Json | null | undefined): boolean {
  if (!isRecord(answer)) return false
  if (type === 'single') {
    return typeof answer.option_id === 'string' && answer.option_id.length > 0
  }
  if (type === 'multiple') {
    return Array.isArray(answer.option_ids) && answer.option_ids.length > 0
  }
  if (type === 'true_false') return typeof answer.value === 'boolean'
  if (type === 'short' || type === 'essay') {
    return typeof answer.text === 'string' && answer.text.trim().length > 0
  }
  return false
}

export function scoreLabel(score: number, max: number): string {
  return `${score} / ${max}`
}

export function gradeLabel(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 20
    ? n.toFixed(2) : '—'
}
