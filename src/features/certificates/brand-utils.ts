export const DEFAULT_PRIMARY = '#4F46E5'
export const DEFAULT_SECONDARY = '#14B8A6'
export const MAX_LOGO_BYTES = 2_097_152

const HEX = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: string): boolean {
  return HEX.test(value)
}

/** Acepta "abc123" o "#abc123" y devuelve "#ABC123", o null si no es válido. */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return isHexColor(withHash) ? withHash.toUpperCase() : null
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relación de contraste de un color sobre fondo blanco (1 a 21). */
export function contrastOnWhite(hex: string): number {
  if (!isHexColor(hex)) return 21
  const r = channel(parseInt(hex.slice(1, 3), 16))
  const g = channel(parseInt(hex.slice(3, 5), 16))
  const b = channel(parseInt(hex.slice(5, 7), 16))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (luminance + 0.05)
}

export type LogoFileError =
  | 'certificates.brand.errors.fileType'
  | 'certificates.brand.errors.fileSize'

export function validateLogoFile(file: { type: string; size: number }): LogoFileError | null {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return 'certificates.brand.errors.fileType'
  }
  if (file.size > MAX_LOGO_BYTES) return 'certificates.brand.errors.fileSize'
  return null
}

export function logoExtension(type: string): 'png' | 'jpg' | null {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  return null
}
