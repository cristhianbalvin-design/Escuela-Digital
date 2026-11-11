import { describe, expect, it } from 'vitest'
import { liveAnalysisSchema, liveWordcloudGroupsSchema, termsToMerge } from './live-ai'

describe('respuestas de IA en vivo', () => {
  it('valida el resumen y su límite', () => {
    expect(liveAnalysisSchema.safeParse({ summary: 'Un resumen\ncon saltos.' }).success).toBe(true)
    expect(liveAnalysisSchema.safeParse({ summary: 'a'.repeat(3001) }).success).toBe(false)
    expect(liveAnalysisSchema.safeParse({ summary: 3 }).success).toBe(false)
  })

  it('valida propuestas vacías y grupos con dos o más términos', () => {
    expect(liveWordcloudGroupsSchema.safeParse({ groups: [] }).success).toBe(true)
    expect(liveWordcloudGroupsSchema.safeParse({ groups: [{ canonical: 'herramienta', terms: ['IA', 'inteligencia artificial'] }] }).success).toBe(true)
    expect(liveWordcloudGroupsSchema.safeParse({ groups: [{ canonical: '', terms: ['a', 'b'] }] }).success).toBe(false)
    expect(liveWordcloudGroupsSchema.safeParse({ groups: [{ canonical: 'x'.repeat(31), terms: ['a', 'b'] }] }).success).toBe(false)
    expect(liveWordcloudGroupsSchema.safeParse({ groups: [{ canonical: 'algo', terms: ['a'] }] }).success).toBe(false)
    expect(liveWordcloudGroupsSchema.safeParse({ groups: [{ canonical: 'algo', terms: [1, 'b'] }] }).success).toBe(false)
  })

  it('omite términos iguales al canónico tras normalizarlos', () => {
    expect(termsToMerge([
      { canonical: 'inteligencia artificial', terms: ['Inteligencia Artificial', 'IA'] },
      { canonical: 'análisis', terms: ['Análisis!', 'analitica'] },
    ])).toEqual([
      { term: 'IA', canonical: 'inteligencia artificial' },
      { term: 'analitica', canonical: 'análisis' },
    ])
  })
})
