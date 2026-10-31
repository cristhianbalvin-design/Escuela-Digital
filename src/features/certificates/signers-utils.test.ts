import { describe, expect, it } from 'vitest'
import { signatureExtension, validateSignatureFile } from './signers-utils'

describe('validateSignatureFile', () => {
  it('acepta PNG y JPEG de hasta 1 MB', () => {
    expect(validateSignatureFile({ type: 'image/png', size: 1_048_576 })).toBeNull()
    expect(validateSignatureFile({ type: 'image/jpeg', size: 500 })).toBeNull()
  })

  it('devuelve una clave de error para tipos o tamaños no permitidos', () => {
    expect(validateSignatureFile({ type: 'image/webp', size: 10 }))
      .toBe('certificates.signers.errors.fileType')
    expect(validateSignatureFile({ type: 'image/png', size: 1_048_577 }))
      .toBe('certificates.signers.errors.fileSize')
  })
})

describe('signatureExtension', () => {
  it('devuelve la extensión según el MIME type', () => {
    expect(signatureExtension('image/png')).toBe('png')
    expect(signatureExtension('image/jpeg')).toBe('jpg')
    expect(signatureExtension('image/webp')).toBeNull()
  })
})
