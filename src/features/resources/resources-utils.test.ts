import { describe, expect, it } from 'vitest'
import {
  fileProblem, formatBytes, kindOf, MAX_RESOURCE_BYTES, resourcePath, safeFileName,
} from './resources-utils'

describe('safeFileName', () => {
  it('quita acentos, espacios y caracteres raros', () => {
    expect(safeFileName('Presentación Clase 1 (final).PPTX')).toBe('Presentacion-Clase-1-final.pptx')
  })
  it('usa un nombre por defecto si queda vacío', () => {
    expect(safeFileName('???.pdf')).toBe('archivo.pdf')
  })
})

describe('resourcePath', () => {
  it('arma tenant/lección/uid-nombre', () => {
    expect(resourcePath('t1', 'l1', 'Guía 1.pdf', 'abc')).toBe('t1/l1/abc-Guia-1.pdf')
  })
})

describe('kindOf y fileProblem', () => {
  it('clasifica por extensión', () => {
    expect(kindOf('a.PPTX')).toBe('presentation')
    expect(kindOf('a.xlsx')).toBe('spreadsheet')
    expect(kindOf('a.zip')).toBe('archive')
  })
  it('valida tipo, tamaño y vacío', () => {
    expect(fileProblem({ name: 'a.exe', size: 10 })).toBe('type')
    expect(fileProblem({ name: 'a.pdf', size: MAX_RESOURCE_BYTES + 1 })).toBe('size')
    expect(fileProblem({ name: 'a.pdf', size: 0 })).toBe('empty')
    expect(fileProblem({ name: 'a.pdf', size: 1000 })).toBeNull()
  })
})

describe('formatBytes', () => {
  it('formatea tamaños', () => {
    expect(formatBytes(null)).toBe('')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
