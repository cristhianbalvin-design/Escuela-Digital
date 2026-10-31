import { describe, expect, it } from 'vitest'
import { buildBrandScale, pickOnColor } from './brand'

function contrast(a: string, b: string): number {
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((i) => {
      const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
  }
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

describe('brand colors', () => {
  it('genera los diez tonos desde 50 hasta 900', () => {
    const scale = buildBrandScale('#4F46E5')
    expect(Object.keys(scale)).toEqual([
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
    ])
    expect(scale[500]).toBe('#4F46E5')
    expect(scale[50]).toContain('color-mix(in oklch')
    expect(scale[900]).toContain('black')
  })
  it.each([
    '#FFFFFF',
    '#FDE68A',
    '#777777',
    '#4F46E5',
    '#0B1020',
    '#000000',
    '#059669',
  ])('elige contraste AA para %s', (background) => {
    expect(
      contrast(background, pickOnColor(background)),
    ).toBeGreaterThanOrEqual(4.5)
  })
  it('rechaza un color inválido', () => {
    expect(() => buildBrandScale('red')).toThrow()
  })
})
