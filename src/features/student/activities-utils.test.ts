import { describe, expect, it } from 'vitest'
import { lessonActivity, formatActivityDate, formatDuration, displayFileName } from './activities-utils'
import { parseOutline } from './utils'

describe('utilidades de actividades del estudiante', () => {
  it('obtiene el identificador de una evaluación desde la lección', () => {
    const [module] = parseOutline({
      modules: [{
        id: 'm1',
        title: 'Módulo',
        position: 1,
        locked: false,
        locked_reason: null,
        unlock_at: null,
        lessons: [{
          id: 'l1',
          title: 'Cuestionario',
          type: 'quiz',
          position: 1,
          locked: false,
          locked_reason: null,
          unlock_at: null,
          content: { assessment_id: 'assessment-1' },
        }],
      }],
    })

    expect(module && lessonActivity(module.lessons[0]!)).toEqual({
      type: 'quiz',
      activityId: 'assessment-1',
    })
  })

  it('obtiene el identificador de una tarea desde la lección', () => {
    const [module] = parseOutline({
      modules: [{
        id: 'm1',
        title: 'Módulo',
        position: 1,
        locked: false,
        locked_reason: null,
        unlock_at: null,
        lessons: [{
          id: 'l1',
          title: 'Tarea',
          type: 'assignment',
          position: 1,
          locked: false,
          locked_reason: null,
          unlock_at: null,
          content: { assignment_id: 'assignment-1' },
        }],
      }],
    })

    expect(module && lessonActivity(module.lessons[0]!)).toEqual({
      type: 'assignment',
      activityId: 'assignment-1',
    })
  })

  it('devuelve null para lecciones sin referencia de actividad', () => {
    const [module] = parseOutline({
      modules: [{
        id: 'm1',
        title: 'Módulo',
        position: 1,
        locked: false,
        locked_reason: null,
        unlock_at: null,
        lessons: [{
          id: 'l1',
          title: 'Lectura',
          type: 'reading',
          position: 1,
          locked: false,
          locked_reason: null,
          unlock_at: null,
          content: { body: 'Contenido' },
        }],
      }],
    })

    expect(module && lessonActivity(module.lessons[0]!)).toBeNull()
  })

  it('formatea fechas con la zona horaria solicitada y rechaza valores inválidos', () => {
    expect(formatActivityDate('2026-11-12T03:00:00Z', 'America/Lima'))
      .toContain('11 de noviembre')
    expect(formatActivityDate('fecha inválida')).toBeNull()
    expect(formatActivityDate(null)).toBeNull()
  })

  it('formatea duración en horas y minutos', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(25)).toBe('25 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(90)).toBe('1 h 30 min')
  })
})

describe('displayFileName', () => {
  it('quita el prefijo uuid y la ruta', () => {
    expect(displayFileName('t/o/e/a/603ede99-4355-4bda-899d-79ec4ff382e0-informe_prueba.txt')).toBe('informe_prueba.txt')
    expect(displayFileName('informe.txt')).toBe('informe.txt')
  })
})
