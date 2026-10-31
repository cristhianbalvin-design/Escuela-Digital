import { describe, expect, it } from 'vitest'
import {
  availableLessons, formatUnlockDate, nextLesson, parseOutline,
} from './utils'

const modules = parseOutline({
  modules: [
    {
      id: 'm1', title: 'Primero', position: 1, locked: false,
      locked_reason: null, unlock_at: null,
      lessons: [
        {
          id: 'l1', title: 'Uno', type: 'reading', position: 1,
          locked: false, locked_reason: null, unlock_at: null,
          content: { text: 'Hola' },
        },
        {
          id: 'l2', title: 'Dos', type: 'quiz', position: 2,
          locked: false, locked_reason: null, unlock_at: null,
          content: { assessment_id: 'assessment-1' },
        },
      ],
    },
    {
      id: 'm2', title: 'Después', position: 2, locked: true,
      locked_reason: 'scheduled', unlock_at: '2026-11-12T15:00:00Z',
      lessons: [
        {
          id: 'l3', title: 'Tres', type: 'assignment', position: 1,
          locked: true, locked_reason: 'scheduled',
          unlock_at: '2026-11-12T15:00:00Z',
        },
      ],
    },
  ],
})

describe('utilidades del estudiante', () => {
  it('elige la siguiente lección pendiente y desbloqueada', () => {
    expect(nextLesson(modules, new Set(['l1']))?.id).toBe('l2')
    expect(nextLesson(modules, new Set(['l1']), 'l1')?.id).toBe('l2')
    expect(nextLesson(modules, new Set(['l1', 'l2']))).toBeNull()
  })

  it('excluye módulos y lecciones bloqueados', () => {
    expect(availableLessons(modules).map((lesson) => lesson.id)).toEqual(['l1', 'l2'])
    expect(modules[1]?.lessons[0]?.content).toBeUndefined()
  })

  it('conserva el tipo y el contenido de las lecciones disponibles', () => {
    expect(modules[0]?.lessons[1]).toMatchObject({
      type: 'quiz',
      content: { assessment_id: 'assessment-1' },
    })
  })

  it('formatea la apertura en la zona horaria de la edición', () => {
    const date = formatUnlockDate('2026-11-12T03:00:00Z', 'America/Lima')
    expect(date).toContain('11 de noviembre')
    expect(date).toMatch(/10:00|22:00/)
  })
})
