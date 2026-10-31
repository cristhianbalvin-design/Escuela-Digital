import { z } from 'zod'

export const MSG = {
  required: 'Este campo es obligatorio',
  options: 'Agrega al menos dos opciones con texto',
  single: 'Marca exactamente una respuesta correcta',
  multiple: 'Marca al menos una respuesta correcta',
  accepted: 'Agrega al menos una respuesta aceptada',
  points: 'Los puntos deben ser mayores que 0 y no superar 1000',
  date: 'El cierre debe ser posterior a la apertura',
  types: 'Selecciona al menos una forma de entrega',
  criteria: 'Agrega al menos un criterio',
  levels: 'Agrega al menos un nivel',
  weight: 'El peso debe ser 0 o mayor',
  percent: 'Ingresa un valor entre 0 y 100',
  maxScore: 'El puntaje máximo debe ser mayor que 0',
} as const

const required = z.string().trim().min(1, MSG.required)
const optionalInt = (min: number, max: number) => z.string().refine(
  (v) => v.trim() === '' || (/^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max),
  `Ingresa un entero entre ${min} y ${max}, o déjalo vacío`,
)

export const settingsSchema = z.object({
  time_limit_minutes: optionalInt(1, 600),
  max_attempts: optionalInt(1, 20),
  pass_pct: optionalInt(0, 100),
  shuffle_questions: z.boolean(),
  shuffle_options: z.boolean(),
  show_results: z.enum(['immediate', 'after_close', 'never']),
  opens_at: z.string(),
  closes_at: z.string(),
}).refine(
  (v) => !v.opens_at || !v.closes_at || new Date(v.closes_at) > new Date(v.opens_at),
  { path: ['closes_at'], message: MSG.date },
)

export const assessmentSchema = z.object({
  title: required,
  instructions: z.string(),
  settings: settingsSchema,
})

export const questionSchema = z.object({
  type: z.enum(['single', 'multiple', 'true_false', 'short', 'essay']),
  prompt: required,
  points: z.number({ error: MSG.points }).positive(MSG.points).max(1000, MSG.points),
  feedback_ok: z.string(),
  feedback_bad: z.string(),
  options: z.array(z.object({ label: z.string() })),
  correct: z.array(z.number().int().nonnegative()),
  trueFalse: z.boolean(),
  accepted: z.array(z.object({ value: z.string() })),
}).superRefine((v, ctx) => {
  if (v.type === 'single' || v.type === 'multiple') {
    if (v.options.length < 2 || v.options.some((o) => !o.label.trim())) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: MSG.options })
    }
    if (v.type === 'single' && v.correct.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['correct'], message: MSG.single })
    }
    if (v.type === 'multiple' && v.correct.length < 1) {
      ctx.addIssue({ code: 'custom', path: ['correct'], message: MSG.multiple })
    }
  }
  if (v.type === 'short' && !v.accepted.some((a) => a.value.trim())) {
    ctx.addIssue({ code: 'custom', path: ['accepted'], message: MSG.accepted })
  }
})

export const assignmentSchema = z.object({
  title: required,
  instructions: z.string(),
  rubric_id: z.string(),
  submission_types: z.array(z.enum(['text', 'link', 'file'])).min(1, MSG.types),
  due_at: z.string(),
  allow_late: z.boolean(),
  late_penalty_pct: z.number({ error: MSG.percent }).min(0, MSG.percent).max(100, MSG.percent),
  max_score: z.number({ error: MSG.maxScore }).positive(MSG.maxScore),
})

export const rubricSchema = z.object({
  title: required,
  criteria: z.array(z.object({
    title: required,
    levels: z.array(z.object({
      label: required,
      descriptor: z.string(),
      points: z.number({ error: MSG.required }).min(0, MSG.required),
    })).min(1, MSG.levels),
  })).min(1, MSG.criteria),
})

export const weightSchema = z.object({
  title: required,
  weight: z.number({ error: MSG.weight }).min(0, MSG.weight),
  max_score: z.number({ error: MSG.maxScore }).positive(MSG.maxScore),
})

export type SettingsValues = z.infer<typeof settingsSchema>
export type AssessmentValues = z.infer<typeof assessmentSchema>
export type QuestionValues = z.infer<typeof questionSchema>
export type AssignmentValues = z.infer<typeof assignmentSchema>
export type RubricValues = z.infer<typeof rubricSchema>
export type WeightValues = z.infer<typeof weightSchema>
