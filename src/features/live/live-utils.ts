import { z } from 'zod'

export const liveTypes = ['poll_single', 'poll_multi', 'vote', 'wordcloud', 'open', 'scale', 'quiz', 'compare', 'opportunity', 'template'] as const
export type LiveType = typeof liveTypes[number]

const help = z.string().trim().min(1).max(200).optional()
const context = z.string().max(6000).optional()
const indicatorLabel = z.string().trim().min(1).max(60).optional()
const optionSchema = z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200), score: z.number().int().min(0).max(100).optional() }).strict()
const optionsSchema = z.array(optionSchema).min(2).max(20).refine(
  (options) => new Set(options.map((option) => option.id)).size === options.length,
  'Las opciones deben tener identificadores diferentes.',
)
const choiceConfig = z.object({ options: optionsSchema, help, indicator_label: indicatorLabel, context }).strict()
const multiConfig = z.object({ options: optionsSchema, max_choices: z.number().int().min(1).max(20).optional(), help, indicator_label: indicatorLabel, context }).strict()
  .refine((config) => config.max_choices === undefined || config.max_choices <= config.options.length)
const wordConfig = z.object({ max_answers: z.number().int().min(1).max(20).default(3), help, indicator_label: indicatorLabel, context }).strict()
const scaleConfig = z.object({
  scale_min: z.number().int().min(-100).max(100),
  scale_max: z.number().int().min(-100).max(100),
  labels: z.record(z.string().max(10), z.string().trim().max(200)).optional(),
  help, indicator_label: indicatorLabel, context,
}).strict().refine((config) => config.scale_max > config.scale_min && config.scale_max - config.scale_min <= 20)
const quizConfig = z.object({
  options: z.array(z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200) }).strict()).min(2).max(6)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  correct: z.string(), explanation: z.string().max(400).optional(),
  seconds: z.number().int().min(5).max(120), concept: z.string().max(80).optional(), formative: z.boolean().optional(), help, context,
}).strict().refine((config) => config.options.some((option) => option.id === config.correct))
const compareConfig = z.object({
  description: z.string().max(2000).optional(),
  options: z.array(z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200), content: z.string().max(20000), real_name: z.string().max(60) }).strict()).min(2).max(5)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  criteria: z.array(z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(80), description: z.string().max(300) }).strict()).min(1).max(10)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  scale_max: z.number().int().min(3).max(10).default(5), final_question: z.string().max(200),
  ask_comment: z.boolean(), comment_max: z.number().int().min(0).max(200), blind: z.boolean().optional(), help, context,
}).strict()

export const templateFieldKinds = ['text', 'long', 'select'] as const
export const templateFieldSchema = z.object({
  id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200), kind: z.enum(templateFieldKinds),
  required: z.boolean().optional(), help: z.string().max(300).optional(),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(20).optional(),
}).strict().refine((field) => (field.kind === 'select') === (field.options !== undefined))
export type TemplateField = z.infer<typeof templateFieldSchema>
const templateConfig = z.object({
  fields: z.array(templateFieldSchema).min(1).max(15).refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  help, context,
}).strict()
export const templateAnswerSchema = z.record(z.string(), z.string().max(4000))
export type TemplateAnswer = z.infer<typeof templateAnswerSchema>
export function isTemplateAnswer(value: unknown): value is TemplateAnswer {
  return templateAnswerSchema.safeParse(value).success
}
export const OPEN_DEFAULT_MAX = 280

const choiceList = z.array(z.string().trim().min(1).max(80)).min(2).max(20).refine((items) => new Set(items).size === items.length)
const opportunityConfig = z.object({ areas: choiceList, problems: choiceList, solutions: choiceList, help, context }).strict()
export const opportunityAnswerSchema = z.object({
  area: z.string().max(80), process: z.string().trim().min(1).max(120), task: z.string().trim().min(1).max(250),
  problems: z.array(z.string().max(80)).min(1).max(20), opportunity: z.string().trim().min(1).max(400),
  solution: z.string().max(80), impact: z.number().int().min(1).max(5), ease: z.number().int().min(1).max(5),
}).strict()
export type OpportunityAnswer = z.infer<typeof opportunityAnswerSchema>
export type OpportunityQuadrant = 'quick_win' | 'strategic' | 'minor' | 'low'
/** Prioridad = impacto × facilidad; "alto" es 4 o 5. */
export function opportunityStats(answer: Pick<OpportunityAnswer, 'impact' | 'ease'>): { priority: number; quadrant: OpportunityQuadrant } {
  const high = (value: number) => value >= 4
  return { priority: answer.impact * answer.ease,
    quadrant: high(answer.impact) ? (high(answer.ease) ? 'quick_win' : 'strategic') : (high(answer.ease) ? 'minor' : 'low') }
}
export function isOpportunityAnswer(value: unknown): value is OpportunityAnswer {
  return opportunityAnswerSchema.safeParse(value).success
}

export const liveActivitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('poll_single'), config: choiceConfig }).strict(),
  z.object({ type: z.literal('vote'), config: choiceConfig }).strict(),
  z.object({ type: z.literal('poll_multi'), config: multiConfig }).strict(),
  z.object({ type: z.literal('wordcloud'), config: wordConfig }).strict(),
  z.object({ type: z.literal('open'), config: z.object({ max_length: z.number().int().min(280).max(4000).optional(), help, indicator_label: indicatorLabel, context }).strict() }).strict(),
  z.object({ type: z.literal('scale'), config: scaleConfig }).strict(),
  z.object({ type: z.literal('quiz'), config: quizConfig }).strict(),
  z.object({ type: z.literal('compare'), config: compareConfig }).strict(),
  z.object({ type: z.literal('opportunity'), config: opportunityConfig }).strict(),
  z.object({ type: z.literal('template'), config: templateConfig }).strict(),
])
export type LiveActivity = z.output<typeof liveActivitySchema>

/** Las respuestas se validan de nuevo en el servidor antes de guardarlas. */
export function answerSchema(activity: LiveActivity) {
  switch (activity.type) {
    case 'poll_single':
    case 'vote':
      return z.string().refine((id) => activity.config.options.some((option) => option.id === id))
    case 'poll_multi':
      return z.array(z.string()).min(1).max(activity.config.max_choices ?? activity.config.options.length)
        .refine((ids) => new Set(ids).size === ids.length && ids.every((id) => activity.config.options.some((option) => option.id === id)))
    case 'wordcloud':
      return z.array(z.string().trim().min(1).max(30).refine((value) => normalizeTerm(value).length > 0))
        .min(1).max(activity.config.max_answers)
    case 'open':
      return z.string().trim().min(1).max(activity.config.max_length ?? OPEN_DEFAULT_MAX)
    case 'scale':
      return z.number().int().min(activity.config.scale_min).max(activity.config.scale_max)
    case 'quiz':
      return z.string().refine((id) => activity.config.options.some((option) => option.id === id))
    case 'opportunity': {
      const config = activity.config
      return opportunityAnswerSchema.refine((answer) => config.areas.includes(answer.area) && config.solutions.includes(answer.solution)
        && answer.problems.every((problem) => config.problems.includes(problem)))
    }
    case 'template': {
      const fields = activity.config.fields
      return templateAnswerSchema.refine((answer) =>
        Object.entries(answer).every(([key, value]) => {
          const field = fields.find((item) => item.id === key)
          return field !== undefined && value.length <= (field.kind === 'long' ? 4000 : 300)
            && (field.kind !== 'select' || value === '' || field.options!.includes(value))
        }) && fields.every((field) => !field.required || (answer[field.id] ?? '').trim().length > 0))
    }
    case 'compare': {
      const config = activity.config
      return z.object({
        ratings: z.record(z.string(), z.record(z.string(), z.number().int().min(1).max(config.scale_max))),
        choice: z.string(), comment: z.string().max(config.comment_max).optional(),
      }).strict().refine((answer) =>
        config.options.some((option) => option.id === answer.choice) &&
        (answer.comment === undefined || config.ask_comment) &&
        Object.keys(answer.ratings).length === config.options.length &&
        config.options.every((option) => {
          const ratings = answer.ratings[option.id]
          return ratings !== undefined && Object.keys(ratings).length === config.criteria.length &&
            config.criteria.every((criterion) => ratings[criterion.id] !== undefined)
        }),
      )
    }
  }
}

/** Normalización deliberadamente simple: no intenta reducir plurales. */
export function normalizeTerm(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

export const LIVE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function isLiveCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code)
}

/** Muestreo sin sesgo; la unicidad de códigos se verifica en la base de datos. */
export function generateLiveCode(random: Crypto = crypto): string {
  const limit = Math.floor(256 / LIVE_CODE_ALPHABET.length) * LIVE_CODE_ALPHABET.length
  let code = ''
  while (code.length < 6) {
    const bytes = random.getRandomValues(new Uint8Array(6))
    for (const byte of bytes) {
      if (byte < limit) code += LIVE_CODE_ALPHABET[byte % LIVE_CODE_ALPHABET.length]
      if (code.length === 6) break
    }
  }
  return code
}

export type AggregateRow = { id: string; label: string; count: number; percent: number }
export function aggregateChoices(options: { id: string; label: string }[], answers: (string | string[])[]): AggregateRow[] {
  return options.map((option) => {
    const count = answers.filter((answer) => Array.isArray(answer) ? answer.includes(option.id) : answer === option.id).length
    return { ...option, count, percent: answers.length ? Math.round(count * 100 / answers.length) : 0 }
  })
}

export function aggregateScale(min: number, max: number, answers: number[]) {
  const valid = answers.filter((answer) => Number.isInteger(answer) && answer >= min && answer <= max)
  const rows = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => {
    const value = min + index
    const count = valid.filter((answer) => answer === value).length
    return { value, count, percent: valid.length ? Math.round(count * 100 / valid.length) : 0 }
  })
  return { rows, average: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null }
}

export function aggregateTerms(answers: string[][], moderation: Record<string, { mergedInto?: string | null; hidden?: boolean }> = {}) {
  const counts = new Map<string, number>()
  for (const answer of answers) for (const raw of answer) {
    const term = normalizeTerm(raw)
    if (!term || moderation[term]?.hidden) continue
    const target = normalizeTerm(moderation[term]?.mergedInto ?? term)
    if (!target || moderation[target]?.hidden) continue
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  return [...counts].map(([term, count]) => ({ term, count })).sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'es'))
}

export function topTerms(rows: { term: string; count: number }[], limit: number): { term: string; count: number }[] {
  return [...rows].filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'es'))
    .slice(0, Math.max(0, limit))
}

export function averageSelections(rows: { count: number }[], total: number): number | null {
  return total > 0 ? rows.reduce((sum, row) => sum + row.count, 0) / total : null
}

export type AdoptionLevel = 'initial' | 'basic' | 'intermediate' | 'advanced' | 'leader'
export function weightedScore(options: { id: string; score?: number }[], rows: { id: string; count: number }[], total: number):
  { average: number; max: number; level: AdoptionLevel } | null {
  if (total <= 0 || options.length === 0 || options.some((option) => option.score === undefined)) return null
  const max = Math.max(...options.map((option) => option.score!))
  const counts = new Map(rows.map((row) => [row.id, row.count]))
  const average = options.reduce((sum, option) => sum + option.score! * (counts.get(option.id) ?? 0), 0) / total
  const ratio = max > 0 ? average / max : 0
  const level = ratio < .25 ? 'initial' : ratio < .5 ? 'basic' : ratio < .75 ? 'intermediate' : ratio < .9 ? 'advanced' : 'leader'
  return { average, max, level }
}

/** Sólo el parámetro de escuela viaja en los enlaces de la clase; el resto ensucia el QR. */
export function liveSearch(search: string = typeof window === 'undefined' ? '' : window.location.search): string {
  const tenant = new URLSearchParams(search).get('tenant')
  return tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
}
