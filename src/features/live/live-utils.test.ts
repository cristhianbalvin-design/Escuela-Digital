import { describe, expect, it } from 'vitest'
import { aggregateChoices, aggregateScale, aggregateTerms, answerSchema, averageSelections, generateLiveCode, isLiveCode, liveActivitySchema, normalizeTerm, topTerms, weightedScore } from './live-utils'

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
    expect(liveActivitySchema.safeParse({ type: 'open', config: { help: 'Una pista' } }).success).toBe(true)
    expect(liveActivitySchema.safeParse({ type: 'open', config: { help: ' ' } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'poll_single', config: { options: [{ ...options[0], score: 100 }, { ...options[1], score: 0 }], indicator_label: 'Uso' } }).success).toBe(true)
    expect(liveActivitySchema.safeParse({ type: 'vote', config: { options: [{ ...options[0], score: -1 }, options[1] ] } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'quiz', config: {} }).success).toBe(false)
  })

  it('valida rondas competitivas y matriz completa de evaluación ciega', () => {
    const quizConfig = { options, correct: 'a', seconds: 30, explanation: 'Sí', concept: 'Concepto' }
    expect(liveActivitySchema.safeParse({ type: 'quiz', config: quizConfig }).success).toBe(true)
    expect(liveActivitySchema.safeParse({ type: 'quiz', config: { ...quizConfig, correct: 'x' } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'quiz', config: { ...quizConfig, seconds: 4 } }).success).toBe(false)
    expect(liveActivitySchema.safeParse({ type: 'quiz', config: { ...quizConfig, options: [options[0], options[0]] } }).success).toBe(false)
    const quiz = liveActivitySchema.parse({ type: 'quiz', config: quizConfig })
    expect(answerSchema(quiz).safeParse('a').success).toBe(true)
    expect(answerSchema(quiz).safeParse('x').success).toBe(false)

    const compareConfig = { options: [{ id: 'a', label: 'Modelo A', content: 'Texto', real_name: 'Uno' },
      { id: 'b', label: 'Modelo B', content: 'Texto', real_name: 'Dos' }],
      criteria: [{ id: 'c', label: 'Claridad', description: 'Legible' }], final_question: '¿Cuál eliges?', ask_comment: true, comment_max: 20 }
    expect(liveActivitySchema.safeParse({ type: 'compare', config: compareConfig }).success).toBe(true)
    expect(liveActivitySchema.safeParse({ type: 'compare', config: { ...compareConfig, options: [compareConfig.options[0]] } }).success).toBe(false)
    const compare = liveActivitySchema.parse({ type: 'compare', config: compareConfig })
    const valid = { ratings: { a: { c: 5 }, b: { c: 3 } }, choice: 'a', comment: 'Claro' }
    expect(answerSchema(compare).safeParse(valid).success).toBe(true)
    expect(answerSchema(compare).safeParse({ ...valid, ratings: { a: { c: 5 } } }).success).toBe(false)
    expect(answerSchema(compare).safeParse({ ...valid, ratings: { ...valid.ratings, b: { c: 6 } } }).success).toBe(false)
    expect(answerSchema(compare).safeParse({ ...valid, ratings: { ...valid.ratings, b: { c: 3, extra: 2 } } }).success).toBe(false)
    expect(answerSchema(compare).safeParse({ ...valid, choice: 'x' }).success).toBe(false)
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
  it('deriva top, promedio múltiple y niveles ponderados sin mutar filas', () => {
    const rows = [{ term: 'b', count: 2 }, { term: 'a', count: 2 }, { term: 'c', count: 1 }]
    expect(topTerms(rows, 2)).toEqual([{ term: 'a', count: 2 }, { term: 'b', count: 2 }])
    expect(rows[0]?.term).toBe('b')
    expect(averageSelections([{ count: 3 }, { count: 2 }], 2)).toBe(2.5)
    expect(averageSelections([], 0)).toBeNull()
    const scored = [{ id: 'a', score: 100 }, { id: 'b', score: 0 }]
    expect(weightedScore(scored, [{ id: 'a', count: 9 }, { id: 'b', count: 1 }], 10)).toEqual({ average: 90, max: 100, level: 'leader' })
    expect(weightedScore(scored, [{ id: 'a', count: 2 }, { id: 'b', count: 8 }], 10)?.level).toBe('initial')
    for (const [count, level] of [[25, 'basic'], [50, 'intermediate'], [75, 'advanced'], [90, 'leader']] as const) {
      expect(weightedScore(scored, [{ id: 'a', count }, { id: 'b', count: 100 - count }], 100)?.level).toBe(level)
    }
    expect(weightedScore([{ id: 'a', score: 100 }, { id: 'b' }], [], 1)).toBeNull()
    expect(weightedScore(scored, [], 0)).toBeNull()
  })
  it('genera códigos válidos y rechaza caracteres ambiguos', () => {
    expect(isLiveCode(generateLiveCode())).toBe(true)
    for (const code of ['000000', 'IIIIII', 'OOOOOO', '111111', 'ABC', 'abcdef', 'ABCDEF7']) expect(isLiveCode(code)).toBe(false)
  })
})
