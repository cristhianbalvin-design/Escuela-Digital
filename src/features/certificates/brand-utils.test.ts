import { describe, expect, it } from 'vitest'
import {
  contrastOnWhite, isHexColor, logoExtension, normalizeHex, validateLogoFile,
} from './brand-utils'

describe('colores', () => {
  it('valida y normaliza hexadecimales', () => {
    expect(isHexColor('#4F46E5')).toBe(true)
    expect(isHexColor('4F46E5')).toBe(false)
    expect(normalizeHex(' 4f46e5 ')).toBe('#4F46E5')
    expect(normalizeHex('#abc')).toBeNull()
    expect(normalizeHex('zzzzzz')).toBeNull()
  })

  it('calcula el contraste sobre blanco', () => {
    expect(contrastOnWhite('#000000')).toBeGreaterThan(20)
    expect(contrastOnWhite('#FFFFFF')).toBeLessThan(1.1)
    expect(contrastOnWhite('#FFF200')).toBeLessThan(3)
  })
})

describe('logo', () => {
  it('acepta PNG/JPG de hasta 2 MB', () => {
    expect(validateLogoFile({ type: 'image/png', size: 2_097_152 })).toBeNull()
    expect(validateLogoFile({ type: 'image/svg+xml', size: 10 }))
      .toBe('certificates.brand.errors.fileType')
    expect(validateLogoFile({ type: 'image/jpeg', size: 2_097_153 }))
      .toBe('certificates.brand.errors.fileSize')
    expect(logoExtension('image/jpeg')).toBe('jpg')
    expect(logoExtension('image/webp')).toBeNull()
  })
})
