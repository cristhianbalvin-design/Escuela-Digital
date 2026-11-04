import { describe, expect, it } from 'vitest'
import {
  fileProblem, formatBytes, formatMarkDate, isPastDate, kindOf, markProgress, MAX_RESOURCE_BYTES,
  renamedFile, resourcePath, safeFileName, stateOf, toggleMark, type ResourceMark,
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

describe('marcas de material', () => {
  const marks = new Map<string, ResourceMark>([
    ['a', { resource_id: 'a', shared_at: '2026-11-01T15:00:00Z', used_at: '2026-11-02T15:00:00Z' }],
    ['b', { resource_id: 'b', shared_at: '2026-11-01T15:00:00Z', used_at: null }],
  ])
  it('lee el estado de una marca', () => {
    expect(stateOf(marks.get('a'))).toEqual({ shared: true, used: true })
    expect(stateOf(marks.get('b'))).toEqual({ shared: true, used: false })
    expect(stateOf(undefined)).toEqual({ shared: false, used: false })
  })
  it('usado implica enviado', () => {
    expect(toggleMark({ shared: false, used: false }, 'used', true)).toEqual({ shared: true, used: true })
  })
  it('quitar enviado quita también usado', () => {
    expect(toggleMark({ shared: true, used: true }, 'shared', false)).toEqual({ shared: false, used: false })
  })
  it('desmarcar usado conserva enviado y marcar enviado conserva usado', () => {
    expect(toggleMark({ shared: true, used: true }, 'used', false)).toEqual({ shared: true, used: false })
    expect(toggleMark({ shared: true, used: true }, 'shared', true)).toEqual({ shared: true, used: true })
  })
  it('cuenta el progreso por sesión', () => {
    expect(markProgress(['a', 'b', 'c'], marks)).toEqual({ total: 3, shared: 2, used: 1, done: false })
    expect(markProgress(['a'], marks).done).toBe(true)
    expect(markProgress([], marks).done).toBe(false)
  })
  it('detecta fechas pasadas en hora de Lima', () => {
    const now = new Date('2026-11-04T03:00:00Z') // 3 de noviembre, 22:00 en Lima
    expect(isPastDate('2026-11-02', now)).toBe(true)
    expect(isPastDate('2026-11-03', now)).toBe(false)
    expect(isPastDate(null, now)).toBe(false)
  })
  it('formatea la fecha de la marca', () => {
    expect(formatMarkDate('2026-11-03T15:00:00Z')).toBe('03/11')
  })
})

describe('renamedFile', () => {
  it('conserva la extensión si se omite', () => {
    expect(renamedFile('Guia.pdf', '  Guía   de clase ')).toBe('Guía de clase.pdf')
  })
  it('respeta la extensión si ya la trae', () => {
    expect(renamedFile('Guia.pdf', 'Nueva.pdf')).toBe('Nueva.pdf')
  })
  it('rechaza nombres vacíos y limita el largo', () => {
    expect(renamedFile('Guia.pdf', '   ')).toBeNull()
    expect(renamedFile('Guia.pdf', 'a'.repeat(300))!.length).toBe(120)
  })
})
