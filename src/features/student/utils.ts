import type { Json, Database } from '@/lib/supabase/database.types'

export type OutlineLesson = {
  id: string
  title: string
  position: number
  type: Database['public']['Enums']['lesson_type']
  locked: boolean
  locked_reason: 'not_started' | 'scheduled' | null
  unlock_at: string | null
  content?: Json
}

export type OutlineModule = {
  id: string
  title: string
  position: number
  locked: boolean
  locked_reason: 'not_started' | 'scheduled' | null
  unlock_at: string | null
  lessons: OutlineLesson[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function reason(value: unknown): OutlineModule['locked_reason'] {
  return value === 'not_started' || value === 'scheduled' ? value : null
}

function lessonType(
  value: unknown,
): Database['public']['Enums']['lesson_type'] | null {
  switch (value) {
    case 'video':
    case 'reading':
    case 'document':
    case 'live':
    case 'quiz':
    case 'assignment':
    case 'link':
      return value
    default:
      return null
  }
}

export function parseOutline(value: Json | null): OutlineModule[] {
  if (!record(value) || !Array.isArray(value.modules)) return []

  return value.modules.flatMap((rawModule) => {
    if (!record(rawModule) || typeof rawModule.id !== 'string' ||
      typeof rawModule.title !== 'string') return []

    const lessons: OutlineLesson[] = Array.isArray(rawModule.lessons)
      ? rawModule.lessons.flatMap((rawLesson) => {
        if (!record(rawLesson) || typeof rawLesson.id !== 'string' ||
          typeof rawLesson.title !== 'string') return []
        const type = lessonType(rawLesson.type)
        if (!type) return []

        return [{
          id: rawLesson.id,
          title: rawLesson.title,
          position: typeof rawLesson.position === 'number' ? rawLesson.position : 0,
          type,
          locked: rawLesson.locked === true,
          locked_reason: reason(rawLesson.locked_reason),
          unlock_at: typeof rawLesson.unlock_at === 'string'
            ? rawLesson.unlock_at : null,
          ...(rawLesson.content !== undefined
            ? { content: rawLesson.content as Json }
            : {}),
        }]
      })
      : []

    return [{
      id: rawModule.id,
      title: rawModule.title,
      position: typeof rawModule.position === 'number' ? rawModule.position : 0,
      locked: rawModule.locked === true,
      locked_reason: reason(rawModule.locked_reason),
      unlock_at: typeof rawModule.unlock_at === 'string'
        ? rawModule.unlock_at : null,
      lessons: lessons.sort((a, b) => a.position - b.position ||
        a.id.localeCompare(b.id)),
    }]
  }).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

export function availableLessons(modules: OutlineModule[]): OutlineLesson[] {
  return modules.flatMap((module) => module.locked
    ? []
    : module.lessons.filter((lesson) => !lesson.locked))
}

export function nextLesson(
  modules: OutlineModule[],
  completedIds: ReadonlySet<string>,
  afterLessonId?: string,
): OutlineLesson | null {
  const lessons = availableLessons(modules)
  const start = afterLessonId
    ? lessons.findIndex((lesson) => lesson.id === afterLessonId) + 1
    : 0
  return lessons.slice(start).find((lesson) => !completedIds.has(lesson.id)) ?? null
}

export function formatUnlockDate(value: string | null, timezone: string): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null
  try {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value))
  }
}
