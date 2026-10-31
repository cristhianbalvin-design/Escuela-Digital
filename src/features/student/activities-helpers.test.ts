import { describe, expect, it } from 'vitest'
import {
  buildAnswer, formatCountdown, gradeLabel, isAnswered,
  remainingSeconds, sanitizeFileName, scoreLabel, validateFile,
} from './activities-utils'

describe('activities-utils (helpers)', () => {
  it('sanitiza nombres de archivo', () => {
    expect(sanitizeFileName('mi archivo/áé.txt')).toBe('mi_archivo.txt')
    expect(sanitizeFileName(`a${'b'.repeat(125)}.pdf`)).toHaveLength(120)
    expect(sanitizeFileName('///')).toBe('archivo')
  })
  it('valida tamaño y tipo', () => {
    expect(validateFile({ name: 'tarea.pdf', size: 10, type: '' })).toBeNull()
    expect(validateFile({ name: 'a.exe', size: 10, type: '' })).toBe('file_type_not_allowed')
    expect(validateFile({ name: 'a.pdf', size: 10 * 1024 * 1024 + 1, type: '' })).toBe('file_too_large')
  })
  it('calcula el tiempo restante con desfase servidor-cliente', () => {
    expect(remainingSeconds('2026-01-01T00:01:00.000Z', '2026-01-01T00:00:00.000Z', 1000, 11000)).toBe(50)
    expect(remainingSeconds('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0, 1000)).toBe(0)
  })
  it('formatea la cuenta regresiva', () => {
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(3661)).toBe('1:01:01')
    expect(formatCountdown(-1)).toBe('00:00')
  })
  it('construye y comprueba respuestas', () => {
    expect(buildAnswer('single', 'o1')).toEqual({ option_id: 'o1' })
    expect(buildAnswer('multiple', ['a'])).toEqual({ option_ids: ['a'] })
    expect(buildAnswer('true_false', false)).toEqual({ value: false })
    expect(buildAnswer('essay', '')).toBeNull()
    expect(isAnswered('true_false', { value: false })).toBe(true)
    expect(isAnswered('multiple', { option_ids: [] })).toBe(false)
    expect(isAnswered('short', { text: '  ' })).toBe(false)
  })
  it('formatea puntajes y notas', () => {
    expect(scoreLabel(7, 8)).toBe('7 / 8')
    expect(gradeLabel(18)).toBe('18.00')
    expect(gradeLabel(20.5)).toBe('—')
    expect(gradeLabel(null)).toBe('—')
  })
})
