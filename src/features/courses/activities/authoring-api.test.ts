import { describe, expect, it } from 'vitest'
import {
  answerKeyFromForm, formFromSettings, isoToLocalInput, localInputToIso, settingsFromForm,
} from './authoring-api'
import type { QuestionValues } from './schemas'

const base: QuestionValues = {
  type: 'multiple', prompt: 'P', points: 1, feedback_ok: '', feedback_bad: '',
  options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }], correct: [0, 2],
  trueFalse: true, accepted: [{ value: ' Lima ' }, { value: '' }],
}

describe('transformaciones de autoría', () => {
  it('construye la clave según el tipo', () => {
    const ids = ['u-a', 'u-b', 'u-c']
    expect(answerKeyFromForm(base, ids)).toEqual({ option_ids: ['u-a', 'u-c'] })
    expect(answerKeyFromForm({ ...base, type: 'single', correct: [1] }, ids)).toEqual({ option_id: 'u-b' })
    expect(answerKeyFromForm({ ...base, type: 'true_false', trueFalse: false }, ids)).toEqual({ value: false })
    expect(answerKeyFromForm({ ...base, type: 'short' }, ids)).toEqual({ accepted: ['Lima'] })
    expect(answerKeyFromForm({ ...base, type: 'essay' }, ids)).toBeNull()
  })
  it('convierte ajustes: omite vacíos y ida y vuelta de fechas', () => {
    const form = {
      time_limit_minutes: '', max_attempts: '3', pass_pct: '60', shuffle_questions: true,
      shuffle_options: false, show_results: 'after_close' as const,
      opens_at: '2026-03-01T10:00', closes_at: '',
    }
    const saved = settingsFromForm(form)
    expect(saved).toMatchObject({ max_attempts: 3, pass_pct: 60, show_results: 'after_close' })
    expect(saved).not.toHaveProperty('time_limit_minutes')
    expect(saved).not.toHaveProperty('closes_at')
    const back = formFromSettings(saved)
    expect(back.max_attempts).toBe('3')
    expect(back.opens_at).toBe('2026-03-01T10:00')
    expect(back.show_results).toBe('after_close')
  })
  it('maneja fechas vacías o inválidas', () => {
    expect(isoToLocalInput(null)).toBe('')
    expect(isoToLocalInput('no-fecha')).toBe('')
    expect(localInputToIso('')).toBeNull()
    expect(formFromSettings(null).show_results).toBe('immediate')
  })
})
