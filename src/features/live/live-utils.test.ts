import { describe, expect, it } from 'vitest'
import { aggregateChoices, aggregateScale, aggregateTerms, answerSchema, generateLiveCode, isLiveCode, liveActivitySchema, normalizeTerm } from './live-utils'

const options = [{ id: 'a', label: 'Primera' }, { id: 'b', label: 'Segunda' }]

describe('actividades en vivo', () => {
  it('valida opciones, límites y tipos', () => {
    expect(liveActivitySchema.safeParse({ type: 'poll_single', config: { options } }).success).toBe(true)
    expect(liveActivitySchema.safeParse({ type: 'vote', config: { options: [options[0]] } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'poll_single', config: { options: [options[0], options[0]] } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'poll_multi', config: { options, max_choices: 3 } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'poll_single', config: { options: Array.from({ length: 21 }, (_, i) => ({ id: String(i), label: 'Opción' })) } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'poll_single', config: { options: [{ id: 'a', label: 'x'.repeat(201) }, options[1]] } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'wordcloud', config: {} }).data).toEqual({ type: 'wordcloud', config: { max_answers: 3 } })
    expect(liveActivitySchema.safeParse({ type: 'scale', config: { scale_min: 5, scale_max: 1 } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'scale', config: { scale_min: 0, scale_max: 21 } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'open', config: { extra: true } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'quiz', config: {} }).success).toBe(false)
  })

  it('valida respuestas según la configuración', () => {
    const multi = liveActivitySchema.parse({ type: 'poll_multi', config: { options, max_choices: 1 } })
    expect(answerSchema(multi).safeParse(['a']).success).toBe(true)
    expect(answerSchema(multi).safeParse(['a', 'b']).success).toBe(false)
    expect(answerSchema(multi).safeParse(['desconocida']).success).toBe(false)
    const multiBoth = liveActivitySchema.parse({ type: 'poll_multi', config: { options } })
    expect(answerSchema(multiBoth).safeParse(['a', 'a']).success).toBe(false)
    expect(answerSchema(multiBoth).safeParse([]).success).toBe(false)
    const vote = liveActivitySchema.parse({ type: 'vote', config: { options } })
    expect(answerSchema(vote).safeParse('b').success).toBe(true)
    expect(answerSchema(vote).safeParse('c').success).toBe(false)
    const words = liveActivitySchema.parse({ type: 'wordcloud', config: {} })
    expect(answerSchema(words).safeParse(['   ']).success).toBe(false)
    expect(answerSchema(words).safeParse(['!']).success).toBe(false)
    expect(answerSchema(words).safeParse(['a'.repeat(31)]).success).toBe(false)
    expect(answerSchema(words).safeParse(['uno', 'dos', 'tres', 'cuatro']).success).toBe(false)
    const open = liveActivitySchema.parse({ type: 'open', config: {} })
    expect(answerSchema(open).safeParse('a'.repeat(281)).success).toBe(false)
    expect(answerSchema(open).safeParse('a'.repeat(280)).success).toBe(true)
    const scale = liveActivitySchema.parse({ type: 'scale', config: { scale_min: 1, scale_max: 5 } })
    expect(answerSchema(scale).safeParse(3).success).toBe(true)
    expect(answerSchema(scale).safeParse(3.5).success).toBe(false)
    expect(answerSchema(scale).safeParse(6).success).toBe(false)
  })
})

describe('resultados y códigos', () => {
  it('normaliza acentos, puntuación y espacios sin reducir plurales', () => {
    expect(normalizeTerm('  Innovación,   ÁGIL! ')).toBe('innovacion agil')
    expect(normalizeTerm('Ideas')).not.toBe(normalizeTerm('Idea'))
  })
  it('cuenta selecciones múltiples por participante y contempla cero respuestas', () => {
    expect(aggregateChoices(options, [['a', 'b'], ['a']])).toEqual([
      { ...options[0], count: 2, percent: 100 }, { ...options[1], count: 1, percent: 50 },
    ])
    expect(aggregateChoices(options, [])[0]?.percent).toBe(0)
  })
  it('calcula distribución y promedio solo con valores válidos', () => {
    expect(aggregateScale(1, 3, [1, 2, 3, 4, 1.5])).toEqual({
      rows: [{ value: 1, count: 1, percent: 33 }, { value: 2, count: 1, percent: 33 }, { value: 3, count: 1, percent: 33 }], average: 2,
    })
    expect(aggregateScale(1, 2, []).average).toBeNull()
  })
  it('agrupa y modera términos sin mostrar términos ocultos', () => {
    expect(aggregateTerms([['Ágil', 'ágil'], ['rápido', 'oculto']], { rapido: { mergedInto: 'agil' }, oculto: { hidden: true } })).toEqual([{ term: 'agil', count: 3 }])
    expect(aggregateTerms([['a']], { a: { mergedInto: 'b' }, b: { hidden: true } })).toEqual([])
  })
  it('genera códigos válidos y rechaza caracteres ambiguos', () => {
    expect(isLiveCode(generateLiveCode())).toBe(true)
    for (const code of ['000000', 'IIIIII', 'OOOOOO', '111111', 'ABC', 'abcdef', 'ABCDEF7']) expect(isLiveCode(code)).toBe(false)
  })
})
