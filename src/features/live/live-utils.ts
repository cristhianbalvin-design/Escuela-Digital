import { z } from 'zod'

export const liveTypes = ['poll_single', 'poll_multi', 'vote', 'wordcloud', 'open', 'scale'] as const
export type LiveType = typeof liveTypes[number]

const optionSchema = z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200) }).strict()
const optionsSchema = z.array(optionSchema).min(2).max(20).refine(
  (options) => new Set(options.map((option) => option.id)).size === options.length,
  'Las opciones deben tener identificadores diferentes.',
)
const choiceConfig = z.object({ options: optionsSchema }).strict()
const multiConfig = z.object({ options: optionsSchema, max_choices: z.number().int().min(1).max(20).optional() }).strict()
  .refine((config) => config.max_choices === undefined || config.max_choices <= config.options.length)
const wordConfig = z.object({ max_answers: z.number().int().min(1).max(20).default(3) }).strict()
const scaleConfig = z.object({
  scale_min: z.number().int().min(-100).max(100),
  scale_max: z.number().int().min(-100).max(100),
  labels: z.record(z.string().max(10), z.string().trim().max(200)).optional(),
}).strict().refine((config) => config.scale_max > config.scale_min && config.scale_max - config.scale_min <= 20)

export const liveActivitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('poll_single'), config: choiceConfig }),
  z.object({ type: z.literal('vote'), config: choiceConfig }),
  z.object({ type: z.literal('poll_multi'), config: multiConfig }),
  z.object({ type: z.literal('wordcloud'), config: wordConfig }),
  z.object({ type: z.literal('open'), config: z.object({}).strict() }),
  z.object({ type: z.literal('scale'), config: scaleConfig }),
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
      return z.string().trim().min(1).max(280)
    case 'scale':
      return z.number().int().min(activity.config.scale_min).max(activity.config.scale_max)
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
