import { describe, expect, it } from 'vitest'
import { assessmentSchema, MSG, questionSchema, rubricSchema } from './schemas'

const question = {
  type: 'single' as const, prompt: 'Capital', points: 1, feedback_ok: '', feedback_bad: '',
  options: [{ label: 'Lima' }, { label: 'Cusco' }], correct: [0], trueFalse: true,
  accepted: [{ value: '' }],
}

describe('esquemas de autoría', () => {
  it('acepta opción única con dos opciones y una correcta', () => {
    expect(questionSchema.safeParse(question).success).toBe(true)
  })
  it('rechaza opción única sin respuesta correcta o con una sola opción', () => {
    const noKey = questionSchema.safeParse({ ...question, correct: [] })
    expect(noKey.success).toBe(false)
    const oneOption = questionSchema.safeParse({ ...question, options: [{ label: 'Lima' }] })
    expect(oneOption.success).toBe(false)
  })
  it('exige una respuesta aceptada en respuesta corta', () => {
    const result = questionSchema.safeParse({ ...question, type: 'short' })
    expect(result.success).toBe(false)
    expect(questionSchema.safeParse({
      ...question, type: 'short', accepted: [{ value: 'Lima' }],
    }).success).toBe(true)
  })
  it('no exige clave en desarrollo y valida los puntos', () => {
    expect(questionSchema.safeParse({ ...question, type: 'essay', options: [], correct: [] }).success).toBe(true)
    const bad = questionSchema.safeParse({ ...question, points: 0 })
    expect(bad.success).toBe(false)
    expect(JSON.stringify(bad)).toContain(MSG.points)
  })
  it('valida rangos de ajustes y apertura anterior al cierre', () => {
    const settings = {
      time_limit_minutes: '', max_attempts: '2', pass_pct: '70', shuffle_questions: false,
      shuffle_options: false, show_results: 'immediate' as const,
      opens_at: '2026-01-01T10:00', closes_at: '2026-01-01T10:00',
    }
    expect(assessmentSchema.safeParse({ title: 'E', instructions: '', settings }).success).toBe(false)
    expect(assessmentSchema.safeParse({
      title: 'E', instructions: '', settings: { ...settings, closes_at: '2026-01-02T10:00' },
    }).success).toBe(true)
    expect(assessmentSchema.safeParse({
      title: 'E', instructions: '', settings: { ...settings, closes_at: '', max_attempts: '21' },
    }).success).toBe(false)
  })
  it('una rúbrica necesita criterios y niveles', () => {
    expect(rubricSchema.safeParse({ title: 'R', criteria: [] }).success).toBe(false)
    expect(rubricSchema.safeParse({
      title: 'R', criteria: [{ title: 'C', levels: [] }],
    }).success).toBe(false)
    expect(rubricSchema.safeParse({
      title: 'R', criteria: [{ title: 'C', levels: [{ label: 'Alto', descriptor: '', points: 5 }] }],
    }).success).toBe(true)
  })
})
