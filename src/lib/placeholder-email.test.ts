import { describe, expect, it } from 'vitest'
import { isPlaceholderEmail, shownEmail } from './placeholder-email'

describe('placeholder-email', () => {
  it('reconoce el correo interno de participantes sin correo', () => {
    expect(isPlaceholderEmail('sin-correo-1a2b3c4d@sin-correo.invalid')).toBe(true)
    expect(isPlaceholderEmail('SIN-CORREO-ABC@x.com')).toBe(true)
    expect(isPlaceholderEmail('ana@empresa.com')).toBe(false)
    expect(isPlaceholderEmail(null)).toBe(false)
  })
  it('no muestra el correo interno', () => {
    expect(shownEmail('sin-correo-1a2b3c4d@sin-correo.invalid')).toBe('')
    expect(shownEmail('ana@empresa.com')).toBe('ana@empresa.com')
    expect(shownEmail(undefined)).toBe('')
  })
})
