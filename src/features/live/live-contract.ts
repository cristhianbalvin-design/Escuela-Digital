import { z } from 'zod'
import { isLiveCode } from './live-utils'

// La validación que depende de la configuración de una ronda se repite en SQL.
const uuid = z.uuid()
const code = z.string().refine(isLiveCode)
const token = z.string().regex(/^[0-9a-f]{64}$/)
const sessionId = z.object({ p_session_id: uuid }).strict()
const runId = z.object({ p_run_id: uuid }).strict()
const lessonId = z.object({ p_lesson_id: uuid }).strict()
const offeringId = z.object({ p_offering_id: uuid }).strict()
const context = z.string().max(6000).optional()
const option = z.object({
  id: z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 100),
  label: z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 200),
  score: z.number().int().min(0).max(100).optional(),
}).strict()
const help = z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 200).optional()
const indicator_label = z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 60).optional()
const options = z.array(option).min(2).max(20).refine((items) => new Set(items.map((item) => item.id)).size === items.length)
const choiceConfig = z.object({ options, help, indicator_label, context }).strict()
const multiConfig = z.object({ options, max_choices: z.number().int().min(1).max(20).optional(), help, indicator_label, context }).strict()
  .refine((config) => config.max_choices === undefined || config.max_choices <= config.options.length)
const wordConfig = z.object({ max_answers: z.number().int().min(1).max(20), help, indicator_label, context }).strict()
const scaleConfig = z.object({
  scale_min: z.number().int().min(-100).max(100), scale_max: z.number().int().min(-100).max(100),
  labels: z.record(z.string().max(10), z.string().refine((value) => value.trim().length <= 200)).optional(),
  help, indicator_label, context,
}).strict().refine((config) => config.scale_max > config.scale_min && config.scale_max - config.scale_min <= 20)
const emptyConfig = z.object({ help, indicator_label, context }).strict()
const quizOption = option.omit({ score: true })
const quizConfig = z.object({ options: z.array(quizOption).min(2).max(6).refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  correct: z.string(), explanation: z.string().max(400).optional(), seconds: z.number().int().min(5).max(120), concept: z.string().max(80).optional(), help, context }).strict()
  .refine((value) => value.options.some((item) => item.id === value.correct))
const compareOption = z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200), content: z.string().max(20000), real_name: z.string().max(60) }).strict()
const compareCriterion = z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(80), description: z.string().max(300) }).strict()
const compareConfig = z.object({ description: z.string().max(2000).optional(), options: z.array(compareOption).min(2).max(5).refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  criteria: z.array(compareCriterion).min(1).max(10).refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  scale_max: z.number().int().min(3).max(10).optional(), final_question: z.string().max(200), ask_comment: z.boolean(), comment_max: z.number().int().min(0).max(200), help, context }).strict()
const publicQuizConfig = z.object({ options: z.array(quizOption).min(2).max(6),
  seconds: z.number().int().min(5).max(120), concept: z.string().max(80).optional(), help, context }).strict()
  .refine((value) => new Set(value.options.map((item) => item.id)).size === value.options.length)
const publicCompareOption = z.object({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200), content: z.string().max(20000) }).strict()
const publicCompareConfig = z.object({ description: z.string().max(2000).optional(), options: z.array(publicCompareOption).min(2).max(5),
  criteria: z.array(compareCriterion).min(1).max(10),
  scale_max: z.number().int().min(3).max(10).optional(), final_question: z.string().max(200), ask_comment: z.boolean(), comment_max: z.number().int().min(0).max(200), help, context }).strict()
  .refine((value) => new Set(value.options.map((item) => item.id)).size === value.options.length)
const activityType = z.enum(['poll_single', 'poll_multi', 'vote', 'wordcloud', 'open', 'scale', 'quiz', 'compare'])
const configForType = {
  poll_single: choiceConfig, poll_multi: multiConfig, vote: choiceConfig,
  wordcloud: wordConfig, open: emptyConfig, scale: scaleConfig, quiz: quizConfig, compare: compareConfig,
} as const
const config = z.record(z.string(), z.unknown())
const activityMatchesConfig = (value: { type: z.infer<typeof activityType>; config: Record<string, unknown> }) =>
  configForType[value.type].safeParse(value.config).success
const activityMatchesInputConfig = (value: { type: z.infer<typeof activityType>; config: Record<string, unknown> }) =>
  activityMatchesConfig(value) || (value.type === 'wordcloud' && Object.keys(value.config).length === 0)
const activityInput = z.object({
  id: uuid.optional(), plan_item_id: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(200), type: activityType, config,
}).strict().refine(activityMatchesInputConfig)

// Las claves y los campos corresponden a las firmas PostgreSQL.
export const liveRpcInputSchemas = {
  get_live_activities: lessonId,
  save_live_activities: z.object({ p_lesson_id: uuid, p_items: z.array(activityInput).max(500) }).strict(),
  create_live_session: z.object({
    p_offering_id: uuid, p_lesson_id: uuid,
    p_access_mode: z.enum(['enrolled', 'guest', 'both']),
    p_ask_name: z.boolean(), p_ask_company: z.boolean(),
  }).strict(),
  get_live_control_state: sessionId,
  get_offering_live_session: offeringId,
  launch_live_run: z.object({ p_session_id: uuid, p_activity_id: uuid }).strict(),
  close_live_run: runId,
  set_live_run_visibility: z.object({ p_run_id: uuid, p_show_results: z.boolean() }).strict(),
  set_live_run_paused: z.object({ p_run_id: uuid, p_paused: z.boolean() }).strict(),
  set_live_run_reveal: z.object({ p_run_id: uuid, p_reveal: z.boolean() }).strict(),
  set_live_run_ranking: z.object({ p_run_id: uuid, p_show: z.boolean() }).strict(),
  moderate_live_response: z.object({ p_response_id: uuid, p_hidden: z.boolean(), p_pinned: z.boolean() }).strict(),
  merge_live_term: z.object({ p_run_id: uuid, p_term: z.string().min(1).max(30), p_merged_into: z.string().min(1).max(30).nullable(), p_hidden: z.boolean() }).strict(),
  end_live_session: sessionId,
  reset_live_run: runId,
  reset_live_session_results: sessionId,
  join_live_session: z.object({ p_code: code, p_name: z.string().max(200).nullable(), p_company: z.string().max(200).nullable() }).strict(),
  get_live_state: z.object({ p_code: code, p_token: token }).strict(),
  submit_live_response: z.object({
    p_code: code, p_token: token, p_run_id: uuid,
    p_answer: z.union([z.string().max(280), z.array(z.string().max(100)).min(1).max(20), z.number().int(),
      z.object({ ratings: z.record(z.string(), z.record(z.string(), z.number().int().min(1).max(10))), choice: z.string(), comment: z.string().max(200).optional() }).strict()]),
  }).strict(),
  get_projector_state: z.object({ p_code: code }).strict(),
} as const

export type LiveRpcName = keyof typeof liveRpcInputSchemas
export type LiveRpcInput<K extends LiveRpcName> = z.input<(typeof liveRpcInputSchemas)[K]>

const timestamp = z.iso.datetime({ offset: true })
const count = z.number().int().nonnegative()
const activityOutput = z.object({
  id: uuid, plan_item_id: uuid.nullable(), title: z.string().min(1).max(200),
  type: activityType, config, position: count,
}).strict().refine(activityMatchesConfig)
const activitiesOutput = z.array(activityOutput)
const responseOutput = z.object({
  id: uuid, answer: z.union([z.string(), z.array(z.string()), z.number().int(), z.object({ ratings: z.record(z.string(), z.record(z.string(), z.number().int().min(1).max(10))), choice: z.string(), comment: z.string().max(200).optional() }).strict()]),
  hidden: z.boolean(), pinned: z.boolean(), participant_name: z.string().nullable(),
}).strict()
const resultsOutput = z.object({
  total: count,
  rows: z.array(z.union([
    z.object({ id: z.string(), label: z.string(), count, percent: count }).strict(),
    z.object({ id: z.string(), label: z.string(), count, percent: count, correct: z.boolean().nullable() }).strict(),
    z.object({ value: z.number().int(), count, percent: count }).strict(),
    z.object({ term: z.string(), count }).strict(),
  ])),
  average: z.number().nullable(),
  responses: z.array(responseOutput),
  correct_percent: count.optional(), avg_seconds: z.number().nonnegative().nullable().optional(),
  matrix: z.array(z.object({ option_id: z.string(), label: z.string(), real_name: z.string().nullable(),
    criteria: z.array(z.object({ criterion_id: z.string(), average: z.number().nullable() }).strict()).min(1).max(10),
    overall: z.number().nullable(), votes: count, vote_percent: count }).strict()).min(2).max(5).optional(),
  comments: z.array(z.string()).optional(),
}).strict()
// En público sólo las respuestas abiertas visibles, siempre sin nombre.
const publicResultsOutput = resultsOutput.safeExtend({
  responses: z.array(responseOutput.safeExtend({ hidden: z.literal(false), participant_name: z.null() })),
})
const publicConfigMatches = (value: { type: z.infer<typeof activityType>; config: Record<string, unknown>; reveal: boolean }) =>
  value.reveal || (value.type === 'quiz' ? publicQuizConfig.safeParse(value.config).success :
    value.type === 'compare' ? publicCompareConfig.safeParse(value.config).success : true)
const rankingEntry = z.object({ participant_id: uuid, name: z.string(), points: count, correct: count,
  answered: count, best_streak: count, rank: z.number().int().positive() }).strict()
const runOutput = z.object({
  id: uuid, title: z.string(), type: activityType,
  config, status: z.enum(['open', 'closed']),
  paused: z.boolean(),
  show_results: z.boolean(), reveal: z.boolean(), show_ranking: z.boolean(), opened_at: timestamp, closed_at: timestamp.nullable(),
  results: publicResultsOutput.nullable(),
}).strict().refine((value) => publicConfigMatches(value) && (value.reveal ? activityMatchesConfig(value) :
  value.type === 'quiz' || value.type === 'compare' || activityMatchesConfig(value)) &&
  (value.reveal || value.results === null || (value.type === 'compare'
    ? value.results.comments === undefined && value.results.matrix?.every((row) => row.real_name === null)
    : value.type === 'quiz' ? value.results.correct_percent === undefined && value.results.avg_seconds === undefined : true)))
const controlRunOutput = z.object({
  ...runOutput.shape, activity_id: uuid, results: resultsOutput,
}).strict().refine(activityMatchesConfig)
const controlSessionOutput = z.object({
  id: uuid, offering_id: uuid, lesson_id: uuid, code,
  status: z.enum(['active', 'ended']), access_mode: z.enum(['enrolled', 'guest', 'both']),
  ask_name: z.boolean(), ask_company: z.boolean(), created_at: timestamp, ended_at: timestamp.nullable(),
}).strict()
const controlStateOutput = z.object({
  session: controlSessionOutput, activities: activitiesOutput,
  runs: z.array(controlRunOutput), participant_count: count, ranking: z.array(rankingEntry),
}).strict()
const participantStateOutput = z.object({
  session: z.object({ id: uuid, code, status: z.enum(['active', 'ended']),
    ask_name: z.boolean(), ask_company: z.boolean() }).strict(),
  participant: z.object({ id: uuid, name: z.string().nullable(), company: z.string().nullable() }).strict(),
  run: runOutput.nullable(), my_response: responseOutput.shape.answer.nullable(),
  ranking: z.array(rankingEntry).max(5).optional(), my_rank: z.object({ rank: z.number().int().positive(), points: count, streak_current: count }).strict().nullable().optional(),
}).strict()
const projectorStateOutput = z.object({
  session: z.object({ code, status: z.enum(['active', 'ended']) }).strict(),
  run: runOutput.nullable(),
  ranking: z.array(rankingEntry).max(5).optional(),
}).strict()

export const liveRpcOutputSchemas = {
  get_live_activities: activitiesOutput,
  save_live_activities: activitiesOutput,
  create_live_session: controlStateOutput,
  get_live_control_state: controlStateOutput,
  get_offering_live_session: controlStateOutput.nullable(),
  launch_live_run: controlStateOutput,
  close_live_run: controlStateOutput,
  set_live_run_visibility: controlStateOutput,
  set_live_run_paused: controlStateOutput,
  set_live_run_reveal: controlStateOutput,
  set_live_run_ranking: controlStateOutput,
  moderate_live_response: controlStateOutput,
  merge_live_term: controlStateOutput,
  end_live_session: controlStateOutput,
  reset_live_run: controlStateOutput,
  reset_live_session_results: controlStateOutput,
  join_live_session: z.object({ token, state: participantStateOutput }).strict(),
  get_live_state: participantStateOutput,
  submit_live_response: participantStateOutput,
  get_projector_state: projectorStateOutput,
} as const satisfies Record<LiveRpcName, z.ZodType>

export type LiveRpcOutput<K extends LiveRpcName> = z.output<(typeof liveRpcOutputSchemas)[K]>
