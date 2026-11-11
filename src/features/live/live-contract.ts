import { z } from 'zod'
import { isLiveCode } from './live-utils'

// La validación que depende de la configuración de una ronda se repite en SQL.
const uuid = z.uuid()
const code = z.string().refine(isLiveCode)
const token = z.string().regex(/^[0-9a-f]{64}$/)
const sessionId = z.object({ p_session_id: uuid }).strict()
const runId = z.object({ p_run_id: uuid }).strict()
const lessonId = z.object({ p_lesson_id: uuid }).strict()
const option = z.object({
  id: z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 100),
  label: z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 200),
}).strict()
const options = z.array(option).min(2).max(20).refine((items) => new Set(items.map((item) => item.id)).size === items.length)
const choiceConfig = z.object({ options }).strict()
const multiConfig = z.object({ options, max_choices: z.number().int().min(1).max(20).optional() }).strict()
  .refine((config) => config.max_choices === undefined || config.max_choices <= config.options.length)
const wordConfig = z.object({ max_answers: z.number().int().min(1).max(20) }).strict()
const scaleConfig = z.object({
  scale_min: z.number().int().min(-100).max(100), scale_max: z.number().int().min(-100).max(100),
  labels: z.record(z.string().max(10), z.string().refine((value) => value.trim().length <= 200)).optional(),
}).strict().refine((config) => config.scale_max > config.scale_min && config.scale_max - config.scale_min <= 20)
const emptyConfig = z.object({}).strict()
const activityType = z.enum(['poll_single', 'poll_multi', 'vote', 'wordcloud', 'open', 'scale'])
const configForType = {
  poll_single: choiceConfig, poll_multi: multiConfig, vote: choiceConfig,
  wordcloud: wordConfig, open: emptyConfig, scale: scaleConfig,
} as const
const config = z.record(z.string(), z.unknown())
const activityMatchesConfig = (value: { type: z.infer<typeof activityType>; config: Record<string, unknown> }) =>
  configForType[value.type].safeParse(value.config).success
const activityMatchesInputConfig = (value: { type: z.infer<typeof activityType>; config: Record<string, unknown> }) =>
  activityMatchesConfig(value) || (value.type === 'wordcloud' && emptyConfig.safeParse(value.config).success)
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
  launch_live_run: z.object({ p_session_id: uuid, p_activity_id: uuid }).strict(),
  close_live_run: runId,
  set_live_run_visibility: z.object({ p_run_id: uuid, p_show_results: z.boolean() }).strict(),
  moderate_live_response: z.object({ p_response_id: uuid, p_hidden: z.boolean(), p_pinned: z.boolean() }).strict(),
  merge_live_term: z.object({ p_run_id: uuid, p_term: z.string().min(1).max(30), p_merged_into: z.string().min(1).max(30).nullable(), p_hidden: z.boolean() }).strict(),
  end_live_session: sessionId,
  join_live_session: z.object({ p_code: code, p_name: z.string().max(200).nullable(), p_company: z.string().max(200).nullable() }).strict(),
  get_live_state: z.object({ p_code: code, p_token: token }).strict(),
  submit_live_response: z.object({
    p_code: code, p_token: token, p_run_id: uuid,
    p_answer: z.union([z.string().max(280), z.array(z.string().max(100)).min(1).max(20), z.number().int()]),
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
  id: uuid, answer: z.union([z.string(), z.array(z.string()), z.number().int()]),
  hidden: z.boolean(), pinned: z.boolean(), participant_name: z.string().nullable(),
}).strict()
const resultsOutput = z.object({
  total: count,
  rows: z.array(z.union([
    z.object({ id: z.string(), label: z.string(), count, percent: count }).strict(),
    z.object({ value: z.number().int(), count, percent: count }).strict(),
    z.object({ term: z.string(), count }).strict(),
  ])),
  average: z.number().nullable(),
  responses: z.array(responseOutput),
}).strict()
// En público sólo las respuestas abiertas visibles, siempre sin nombre.
const publicResultsOutput = resultsOutput.safeExtend({
  responses: z.array(responseOutput.safeExtend({ hidden: z.literal(false), participant_name: z.null() })),
})
const runOutput = z.object({
  id: uuid, title: z.string(), type: activityType,
  config, status: z.enum(['open', 'closed']),
  show_results: z.boolean(), opened_at: timestamp, closed_at: timestamp.nullable(),
  results: publicResultsOutput.nullable(),
}).strict().refine(activityMatchesConfig)
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
  runs: z.array(controlRunOutput), participant_count: count,
}).strict()
const participantStateOutput = z.object({
  session: z.object({ id: uuid, code, status: z.enum(['active', 'ended']),
    ask_name: z.boolean(), ask_company: z.boolean() }).strict(),
  participant: z.object({ id: uuid, name: z.string().nullable(), company: z.string().nullable() }).strict(),
  run: runOutput.nullable(), my_response: z.union([z.string(), z.array(z.string()), z.number().int()]).nullable(),
}).strict()
const projectorStateOutput = z.object({
  session: z.object({ code, status: z.enum(['active', 'ended']) }).strict(),
  run: runOutput.nullable(),
}).strict()

export const liveRpcOutputSchemas = {
  get_live_activities: activitiesOutput,
  save_live_activities: activitiesOutput,
  create_live_session: controlStateOutput,
  get_live_control_state: controlStateOutput,
  launch_live_run: controlStateOutput,
  close_live_run: controlStateOutput,
  set_live_run_visibility: controlStateOutput,
  moderate_live_response: controlStateOutput,
  merge_live_term: controlStateOutput,
  end_live_session: controlStateOutput,
  join_live_session: z.object({ token, state: participantStateOutput }).strict(),
  get_live_state: participantStateOutput,
  submit_live_response: participantStateOutput,
  get_projector_state: projectorStateOutput,
} as const satisfies Record<LiveRpcName, z.ZodType>

export type LiveRpcOutput<K extends LiveRpcName> = z.output<(typeof liveRpcOutputSchemas)[K]>
