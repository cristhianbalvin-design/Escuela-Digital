import { describe, expect, it } from 'vitest'
import { codeAttempt, generateOfferingCode } from './offering-code'

describe('offering-code', () => {
  const date = new Date(2026, 10, 2)
  it('usa palabras clave, sin tildes ni conectores', () => {
    expect(generateOfferingCode('Power BI con IA', date)).toBe('POWER-BI-IA-2026-11')
    expect(generateOfferingCode('Excel para análisis de datos', date)).toBe('EXCEL-ANALISIS-2026-11')
  })
  it('tiene respaldo cuando el título está vacío', () => {
    expect(generateOfferingCode('', date)).toBe('EDICION-2026-11')
    expect(generateOfferingCode('de la', date)).toBe('DE-LA-2026-11')
  })
  it('limita el largo de la base', () => {
    expect(generateOfferingCode('Administración financiera estratégica avanzada', date).split('-2026')[0]!.length).toBeLessThanOrEqual(16)
  })
  it('agrega sufijo en los reintentos', () => {
    expect(codeAttempt('A-2026-11', 1)).toBe('A-2026-11')
    expect(codeAttempt('A-2026-11', 3)).toBe('A-2026-11-3')
  })
})
