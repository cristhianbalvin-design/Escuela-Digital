export type BrandScale = Record<
  50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
  string
>

export function buildBrandScale(primaryHex: string): BrandScale {
  const color = normalizeHex(primaryHex)
  return {
    50: `color-mix(in oklch, ${color} 5%, white)`,
    100: `color-mix(in oklch, ${color} 12%, white)`,
    200: `color-mix(in oklch, ${color} 25%, white)`,
    300: `color-mix(in oklch, ${color} 42%, white)`,
    400: `color-mix(in oklch, ${color} 70%, white)`,
    500: color,
    600: `color-mix(in oklch, ${color} 88%, black)`,
    700: `color-mix(in oklch, ${color} 75%, black)`,
    800: `color-mix(in oklch, ${color} 62%, black)`,
    900: `color-mix(in oklch, ${color} 48%, black)`,
  }
}

function normalizeHex(hex: string): string {
  const raw = hex.replace('#', '')
  const expanded = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  if (!/^[0-9a-f]{6}$/i.test(expanded)) throw new Error('Invalid hex color')
  return `#${expanded.toUpperCase()}`
}

function luminance(hex: string): number {
  const value = normalizeHex(hex).slice(1)
  const rgb = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(value.slice(i, i + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!
}

export function pickOnColor(hex: string): '#FFFFFF' | '#0F172A' | '#000000' {
  const background = luminance(hex)
  const dark = luminance('#0F172A')
  const whiteContrast = 1.05 / (background + 0.05)
  const darkContrast = (background + 0.05) / (dark + 0.05)
  if (whiteContrast >= 4.5 && whiteContrast >= darkContrast) return '#FFFFFF'
  if (darkContrast >= 4.5) return '#0F172A'
  return '#000000'
}
