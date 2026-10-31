import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'
import type {
  AssessmentValues, AssignmentValues, QuestionValues, RubricValues, SettingsValues,
} from './schemas'

type Tables = Database['public']['Tables']
type Question = Tables['questions']['Row']
type Option = Tables['question_options']['Row']
type Key = Tables['question_keys']['Row']
type Criterion = Tables['rubric_criteria']['Row']
type Level = Tables['rubric_levels']['Row']

export type ActivityQuestion = Question & { options: Option[]; key: Key | null }
export type ActivityAssessment = Tables['assessments']['Row'] & {
  questions: ActivityQuestion[]
}
export type ActivityRubric = Tables['rubrics']['Row'] & {
  criteria: Array<Criterion & { levels: Level[] }>
}
export type ActivitiesData = {
  assessments: ActivityAssessment[]
  rubrics: ActivityRubric[]
  assignments: Tables['assignments']['Row'][]
  gradeItems: Tables['grade_items']['Row'][]
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

const activitiesKey = (versionId: string | undefined) => ['activities', versionId] as const

function isRecord(value: unknown): value is Record<string, Json | undefined> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// ---------- funciones puras ----------
const pad = (n: number) => String(n).padStart(2, '0')

export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function settingsFromForm(form: SettingsValues): Json {
  const out: Record<string, Json> = {
    shuffle_questions: form.shuffle_questions,
    shuffle_options: form.shuffle_options,
    show_results: form.show_results,
  }
  const numeric = ['time_limit_minutes', 'max_attempts', 'pass_pct'] as const
  for (const key of numeric) {
    if (form[key].trim() !== '') out[key] = Number(form[key])
  }
  const opens = localInputToIso(form.opens_at)
  const closes = localInputToIso(form.closes_at)
  if (opens) out.opens_at = opens
  if (closes) out.closes_at = closes
  return out
}

export function formFromSettings(settings: Json | undefined): SettingsValues {
  const s = isRecord(settings) ? settings : {}
  const num = (key: string) => (typeof s[key] === 'number' ? String(s[key]) : '')
  const str = (key: string) => (typeof s[key] === 'string' ? isoToLocalInput(s[key]) : '')
  const show = s.show_results
  return {
    time_limit_minutes: num('time_limit_minutes'),
    max_attempts: num('max_attempts'),
    pass_pct: num('pass_pct'),
    shuffle_questions: s.shuffle_questions === true,
    shuffle_options: s.shuffle_options === true,
    show_results: show === 'never' || show === 'after_close' ? show : 'immediate',
    opens_at: str('opens_at'),
    closes_at: str('closes_at'),
  }
}

export function answerKeyFromForm(form: QuestionValues, optionIds: string[]): Json | null {
  if (form.type === 'essay') return null
  if (form.type === 'true_false') return { value: form.trueFalse }
  if (form.type === 'short') {
    return { accepted: form.accepted.map((a) => a.value.trim()).filter(Boolean) }
  }
  const ids = form.correct.map((i) => optionIds[i]).filter((id): id is string => !!id)
  if (form.type === 'single') return ids[0] ? { option_id: ids[0] } : null
  return ids.length ? { option_ids: ids } : null
}

export function questionToForm(q: ActivityQuestion): QuestionValues {
  const key = isRecord(q.key?.answer) ? q.key.answer : {}
  const ids = Array.isArray(key.option_ids) ? key.option_ids
    : typeof key.option_id === 'string' ? [key.option_id] : []
  return {
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    feedback_ok: q.feedback_ok ?? '',
    feedback_bad: q.feedback_bad ?? '',
    options: q.options.map((o) => ({ label: o.label })),
    correct: q.options.flatMap((o, i) => (ids.includes(o.id) ? [i] : [])),
    trueFalse: key.value === true,
    accepted: Array.isArray(key.accepted) && key.accepted.length
      ? key.accepted.filter((a): a is string => typeof a === 'string').map((value) => ({ value }))
      : [{ value: '' }],
  }
}

// ---------- consultas ----------
export function useActivities(versionId: string | undefined) {
  return useQuery({
    queryKey: activitiesKey(versionId),
    enabled: !!supabase && !!versionId,
    queryFn: async (): Promise<ActivitiesData> => {
      const db = client()
      const v = versionId!
      const [a, q, o, k, r, c, l, s, g] = await Promise.all([
        db.from('assessments').select('*').eq('version_id', v).order('created_at'),
        db.from('questions').select('*').eq('version_id', v).order('position'),
        db.from('question_options').select('*').eq('version_id', v).order('position'),
        db.from('question_keys').select('*').eq('version_id', v),
        db.from('rubrics').select('*').eq('version_id', v).order('created_at'),
        db.from('rubric_criteria').select('*').eq('version_id', v).order('position'),
        db.from('rubric_levels').select('*').eq('version_id', v).order('position'),
        db.from('assignments').select('*').eq('version_id', v).order('created_at'),
        db.from('grade_items').select('*').eq('version_id', v).order('created_at'),
      ])
      for (const res of [a, q, o, k, r, c, l, s, g]) if (res.error) throw res.error
      const opts = o.data ?? []
      const keys = k.data ?? []
      const levels = l.data ?? []
      return {
        assessments: (a.data ?? []).map((assessment) => ({
          ...assessment,
          questions: (q.data ?? []).filter((x) => x.assessment_id === assessment.id)
            .map((question) => ({
              ...question,
              options: opts.filter((x) => x.question_id === question.id),
              key: keys.find((x) => x.question_id === question.id) ?? null,
            })),
        })),
        rubrics: (r.data ?? []).map((rubric) => ({
          ...rubric,
          criteria: (c.data ?? []).filter((x) => x.rubric_id === rubric.id)
            .map((criterion) => ({
              ...criterion,
              levels: levels.filter((x) => x.criterion_id === criterion.id),
            })),
        })),
        assignments: s.data ?? [],
        gradeItems: g.data ?? [],
      }
    },
  })
}

function useInvalidate(versionId: string | undefined) {
  const cache = useQueryClient()
  return async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: activitiesKey(versionId) }),
      cache.invalidateQueries({ queryKey: ['course'] }),
    ])
  }
}

// ---------- evaluaciones ----------
export function useSaveAssessment(tenantId: string, versionId: string) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: AssessmentValues }): Promise<string> => {
      const settings = settingsFromForm(values.settings)
      if (id) {
        const { error } = await client().from('assessments').update({
          title: values.title.trim(), instructions: values.instructions, settings,
        }).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await client().from('assessments').insert({
        tenant_id: tenantId, version_id: versionId, title: values.title.trim(),
        instructions: values.instructions, settings,
      }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: done,
  })
}

export function useDeleteActivity(
  versionId: string,
  table: 'assessments' | 'assignments' | 'rubrics' | 'questions' | 'grade_items',
) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client().from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
}

export function useSaveQuestion(tenantId: string, versionId: string, assessmentId: string) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async ({ id, position, values }: {
      id?: string; position: number; values: QuestionValues
    }) => {
      const db = client()
      let questionId = id
      const common = {
        prompt: values.prompt.trim(), points: values.points,
        feedback_ok: values.feedback_ok.trim() || null,
        feedback_bad: values.feedback_bad.trim() || null,
      }
      if (questionId) {
        const { error } = await db.from('questions').update(common).eq('id', questionId)
        if (error) throw error
        const { error: keyError } = await db.from('question_keys').delete().eq('question_id', questionId)
        if (keyError) throw keyError
        const { error: optError } = await db.from('question_options').delete().eq('question_id', questionId)
        if (optError) throw optError
      } else {
        const { data, error } = await db.from('questions').insert({
          tenant_id: tenantId, version_id: versionId, assessment_id: assessmentId,
          position, type: values.type, ...common,
        }).select('id').single()
        if (error) throw error
        questionId = data.id
      }
      let optionIds: string[] = []
      if (values.type === 'single' || values.type === 'multiple') {
        const { data, error } = await db.from('question_options').insert(
          values.options.map((option, index) => ({
            tenant_id: tenantId, version_id: versionId, question_id: questionId!,
            label: option.label.trim(), position: index + 1,
          })),
        ).select('id, position')
        if (error) throw error
        optionIds = [...data].sort((x, y) => x.position - y.position).map((x) => x.id)
      }
      const answer = answerKeyFromForm(values, optionIds)
      if (answer !== null) {
        // La clave se borró arriba al editar, así que basta insertar: el
        // upsert exigiría UPDATE sobre tenant_id/version_id (no concedido).
        const { error } = await db.from('question_keys').insert({
          question_id: questionId, tenant_id: tenantId, version_id: versionId, answer,
        })
        if (error) throw error
      }
    },
    onSuccess: done,
  })
}

// ---------- rúbricas y tareas ----------
export function useSaveRubric(tenantId: string, versionId: string) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: RubricValues }): Promise<string> => {
      const db = client()
      let rubricId = id
      if (rubricId) {
        const { error } = await db.from('rubrics').update({ title: values.title.trim() }).eq('id', rubricId)
        if (error) throw error
        const { error: delError } = await db.from('rubric_criteria').delete().eq('rubric_id', rubricId)
        if (delError) throw delError
      } else {
        const { data, error } = await db.from('rubrics')
          .insert({ tenant_id: tenantId, version_id: versionId, title: values.title.trim() })
          .select('id').single()
        if (error) throw error
        rubricId = data.id
      }
      for (const [ci, criterion] of values.criteria.entries()) {
        const { data, error } = await db.from('rubric_criteria').insert({
          tenant_id: tenantId, version_id: versionId, rubric_id: rubricId,
          title: criterion.title.trim(), position: ci + 1,
        }).select('id').single()
        if (error) throw error
        const { error: levelError } = await db.from('rubric_levels').insert(
          criterion.levels.map((level, li) => ({
            tenant_id: tenantId, version_id: versionId, criterion_id: data.id,
            label: level.label.trim(), descriptor: level.descriptor,
            points: level.points, position: li + 1,
          })),
        )
        if (levelError) throw levelError
      }
      return rubricId
    },
    onSuccess: done,
  })
}

export function useSaveAssignment(tenantId: string, versionId: string) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: AssignmentValues }) => {
      const row = {
        title: values.title.trim(), instructions: values.instructions,
        rubric_id: values.rubric_id || null, submission_types: values.submission_types,
        due_at: localInputToIso(values.due_at), allow_late: values.allow_late,
        late_penalty_pct: values.late_penalty_pct, max_score: values.max_score,
      }
      const { error } = id
        ? await client().from('assignments').update(row).eq('id', id)
        : await client().from('assignments').insert({
          tenant_id: tenantId, version_id: versionId, ...row,
        })
      if (error) throw error
    },
    onSuccess: done,
  })
}

// ---------- ponderaciones ----------
export function useSaveGradeItem(tenantId: string, versionId: string) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async ({ id, title, weight, max_score }: {
      id?: string; title: string; weight: number; max_score: number
    }) => {
      const { error } = id
        ? await client().from('grade_items').update({ title, weight, max_score }).eq('id', id)
        : await client().from('grade_items').insert({
          tenant_id: tenantId, version_id: versionId, source_type: 'manual',
          title, weight, max_score,
        })
      if (error) throw error
    },
    onSuccess: done,
  })
}

// ---------- vínculo lección ↔ actividad ----------
export function useLinkLessonActivity(versionId: string) {
  const done = useInvalidate(versionId)
  return useMutation({
    mutationFn: async ({ lessonId, type, activityId, newTitle }: {
      lessonId: string; type: 'quiz' | 'assignment'; activityId: string | null
      /** Si se indica, renombra la lección (p. ej. el título provisional). */
      newTitle?: string
    }) => {
      const content: Json = activityId
        ? { [type === 'quiz' ? 'assessment_id' : 'assignment_id']: activityId }
        : {}
      const { error } = await client().from('lessons')
        .update(newTitle ? { content, title: newTitle } : { content }).eq('id', lessonId)
      if (error) throw error
    },
    onSuccess: done,
  })
}
