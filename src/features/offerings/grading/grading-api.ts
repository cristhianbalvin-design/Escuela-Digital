import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'

type Tables = Database['public']['Tables']
type SubmissionRow = Tables['submissions']['Row']
type AssignmentRow = Tables['assignments']['Row']
type AttemptRow = Tables['attempts']['Row']
type QuestionRow = Tables['questions']['Row']
type ScoreRow = Tables['submission_scores']['Row']

export type QueueSubmission = {
  submission_id: string
  assignment_id: string
  assignment_title: string
  enrollment_id: string
  student_name: string | null
  student_email: string
  status: 'submitted' | 'graded'
  submitted_at: string
  is_late: boolean
  score: number | null
  max_score: number
}
export type QueueAttempt = {
  attempt_id: string
  attempt_no: number
  assessment_id: string
  assessment_title: string
  enrollment_id: string
  student_name: string | null
  student_email: string
  submitted_at: string
}
export type GradingQueue = { submissions: QueueSubmission[]; attempts: QueueAttempt[] }
export type RubricLevel = { id: string; label: string; descriptor: string; points: number }
export type RubricCriterion = { id: string; title: string; levels: RubricLevel[] }
export type SubmissionFile = { path: string; name: string; size: number; mime: string | null }
export type SubmissionForGrading = {
  submission: Pick<SubmissionRow, 'id' | 'text' | 'link' | 'files' | 'is_late' |
    'score' | 'raw_score' | 'feedback' | 'status' | 'assignment_id' | 'enrollment_id'>
  assignment: Pick<AssignmentRow, 'max_score' | 'late_penalty_pct' | 'rubric_id' |
    'title' | 'instructions'>
  criteria: RubricCriterion[]
  scores: ScoreRow[]
}
export type AttemptQuestionForGrading = Pick<QuestionRow, 'id' | 'position' |
  'type' | 'prompt' | 'points'> & { answer: Json | null; score: number | null;
  feedback: string | null }
export type AttemptForGrading = {
  attempt: Pick<AttemptRow, 'id' | 'assessment_id' | 'enrollment_id' |
    'attempt_no' | 'status' | 'score' | 'max_score'>
  questions: AttemptQuestionForGrading[]
}
export type GradeItem = {
  id: string
  title: string
  source_type: 'assessment' | 'assignment' | 'manual' | 'attendance'
  source_id: string
  weight: number
  max_score: number
}
export type GradeSummaryItem = {
  grade_item_id: string
  title: string
  source_type: GradeItem['source_type']
  weight: number
  score: number | null
  max_score: number | null
  hidden: boolean
  normalized: number | null
}
export type GradebookStudent = {
  enrollment_id: string
  user_id: string
  email: string
  full_name: string | null
  status: string
  saved_final_grade: number | null
  grades: Record<string, {
    score: number
    max_score: number
    adjusted: boolean
    adjusted_reason: string | null
  }>
  summary: {
    items: GradeSummaryItem[]; partial: number | null; final: number | null
    weights_total?: number | null
  }
}
export type Gradebook = {
  mode: 'items' | 'dimensions'
  items: GradeItem[]
  students: GradebookStudent[]
}
export type RubricScoreInput = { criterion_id: string; level_id: string; comment?: string }

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function parseQueue(value: unknown): GradingQueue {
  const root = record(value)
  const submissions = array(root?.submissions).flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.submission_id !== 'string') return []
    return [{
      submission_id: row.submission_id, assignment_id: string(row.assignment_id),
      assignment_title: string(row.assignment_title), enrollment_id: string(row.enrollment_id),
      student_name: nullableString(row.student_name), student_email: string(row.student_email),
      status: row.status === 'graded' ? 'graded' as const : 'submitted' as const,
      submitted_at: string(row.submitted_at), is_late: row.is_late === true,
      score: nullableNumber(row.score), max_score: number(row.max_score),
    }]
  })
  const attempts = array(root?.attempts).flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.attempt_id !== 'string') return []
    return [{
      attempt_id: row.attempt_id, attempt_no: number(row.attempt_no),
      assessment_id: string(row.assessment_id), assessment_title: string(row.assessment_title),
      enrollment_id: string(row.enrollment_id), student_name: nullableString(row.student_name),
      student_email: string(row.student_email), submitted_at: string(row.submitted_at),
    }]
  })
  return { submissions, attempts }
}

export function parseGradebook(value: unknown): Gradebook {
  const root = record(value)
  const items: GradeItem[] = array(root?.items).flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.id !== 'string') return []
    const source = row.source_type
    return [{
      id: row.id, title: string(row.title),
      source_type: source === 'assessment' || source === 'assignment' || source === 'attendance'
        ? source : 'manual',
      source_id: string(row.source_id), weight: number(row.weight),
      max_score: number(row.max_score),
    }]
  })
  const students: GradebookStudent[] = array(root?.students).flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.enrollment_id !== 'string') return []
    const rawGrades = record(row.grades) ?? {}
    const grades: GradebookStudent['grades'] = {}
    for (const [id, entryGrade] of Object.entries(rawGrades)) {
      const grade = record(entryGrade)
      if (!grade) continue
      grades[id] = {
        score: number(grade.score), max_score: number(grade.max_score),
        adjusted: grade.adjusted === true, adjusted_reason: nullableString(grade.adjusted_reason),
      }
    }
    const summary = record(row.summary)
    const summaryItems: GradeSummaryItem[] = array(summary?.items).flatMap((entryItem) => {
      const item = record(entryItem)
      if (!item || typeof item.grade_item_id !== 'string') return []
      const source = item.source_type
      return [{
        grade_item_id: item.grade_item_id, title: string(item.title),
        source_type: source === 'assessment' || source === 'assignment' || source === 'attendance'
          ? source : 'manual',
        weight: number(item.weight), score: nullableNumber(item.score),
        max_score: nullableNumber(item.max_score), hidden: item.hidden === true,
        normalized: nullableNumber(item.normalized),
      }]
    })
    return [{
      enrollment_id: row.enrollment_id, user_id: string(row.user_id), email: string(row.email),
      full_name: nullableString(row.full_name), status: string(row.status),
      saved_final_grade: nullableNumber(row.saved_final_grade), grades,
      summary: {
        items: summaryItems, partial: nullableNumber(summary?.partial),
        final: nullableNumber(summary?.final),
        weights_total: nullableNumber(summary?.weights_total),
      },
    }]
  })
  return { mode: root?.mode === 'dimensions' ? 'dimensions' : 'items', items, students }
}

export function useGradingQueue(offeringId: string) {
  return useQuery({
    queryKey: ['grading', offeringId, 'queue'],
    enabled: !!supabase && !!offeringId,
    queryFn: async () => {
      const { data, error } = await client().rpc('get_grading_queue', { p_offering_id: offeringId })
      if (error) throw error
      return parseQueue(data)
    },
  })
}

export function useSubmissionForGrading(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['grading', 'submission', submissionId],
    enabled: !!supabase && !!submissionId,
    queryFn: async (): Promise<SubmissionForGrading> => {
      const db = client()
      const { data: submission, error } = await db.from('submissions')
        .select('id,text,link,files,is_late,score,raw_score,feedback,status,assignment_id,enrollment_id')
        .eq('id', submissionId!).single()
      if (error) throw error
      const { data: assignment, error: assignmentError } = await db.from('assignments')
        .select('max_score,late_penalty_pct,rubric_id,title,instructions')
        .eq('id', submission.assignment_id).single()
      if (assignmentError) throw assignmentError
      const { data: scores, error: scoresError } = await db.from('submission_scores')
        .select('*').eq('submission_id', submissionId!)
      if (scoresError) throw scoresError
      let criteria: RubricCriterion[] = []
      if (assignment.rubric_id) {
        const { data: criteriaRows, error: criteriaError } = await db.from('rubric_criteria')
          .select('id,title,position').eq('rubric_id', assignment.rubric_id).order('position')
        if (criteriaError) throw criteriaError
        const rows = criteriaRows ?? []
        if (rows.length) {
          const { data: levels, error: levelsError } = await db.from('rubric_levels')
            .select('id,criterion_id,label,descriptor,points,position')
            .in('criterion_id', rows.map((item) => item.id)).order('position')
          if (levelsError) throw levelsError
          criteria = rows.map((item) => ({
            id: item.id, title: item.title,
            levels: (levels ?? []).filter((level) => level.criterion_id === item.id)
              .map((level) => ({
                id: level.id, label: level.label, descriptor: level.descriptor,
                points: level.points,
              })),
          }))
        }
      }
      return { submission, assignment, criteria, scores: scores ?? [] }
    },
  })
}

export function useGradeSubmission(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      submissionId: string
      scores: RubricScoreInput[] | null
      feedback: string | null
      rawScore: number | null
    }) => {
      const { error } = await client().rpc('grade_submission', {
        p_submission_id: input.submissionId, p_scores: input.scores as Json[] | null,
        p_feedback: input.feedback ?? undefined, p_raw_score: input.rawScore ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: async (_data, input) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['grading', offeringId, 'queue'] }),
        cache.invalidateQueries({ queryKey: ['grading', offeringId, 'gradebook'] }),
        cache.invalidateQueries({ queryKey: ['grading', 'submission', input.submissionId] }),
      ])
    },
  })
}

export function useAttemptForGrading(attemptId: string | undefined) {
  return useQuery({
    queryKey: ['grading', 'attempt', attemptId],
    enabled: !!supabase && !!attemptId,
    queryFn: async (): Promise<AttemptForGrading> => {
      const db = client()
      const { data: attempt, error } = await db.from('attempts')
        .select('id,assessment_id,enrollment_id,attempt_no,status,score,max_score')
        .eq('id', attemptId!).single()
      if (error) throw error
      const { data: questions, error: questionsError } = await db.from('questions')
        .select('id,position,type,prompt,points').eq('assessment_id', attempt.assessment_id)
        .order('position')
      if (questionsError) throw questionsError
      const { data: answers, error: answersError } = await db.from('attempt_answers')
        .select('attempt_id,question_id,answer,score,feedback')
        .eq('attempt_id', attemptId!)
      if (answersError) throw answersError
      return {
        attempt,
        questions: (questions ?? []).map((question) => {
          const answer = answers?.find((item) =>
            item.question_id === question.id)
          return { ...question, answer: answer?.answer ?? null,
            score: answer?.score ?? null, feedback: answer?.feedback ?? null }
        }),
      }
    },
  })
}

export function useGradeAttemptAnswer(offeringId: string, attemptId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { questionId: string; score: number; feedback: string | null }) => {
      const { error } = await client().rpc('grade_attempt_answer', {
        p_attempt_id: attemptId, p_question_id: input.questionId,
        p_score: input.score, p_feedback: input.feedback ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['grading', offeringId, 'queue'] }),
        cache.invalidateQueries({ queryKey: ['grading', offeringId, 'gradebook'] }),
        cache.invalidateQueries({ queryKey: ['grading', 'attempt', attemptId] }),
      ])
    },
  })
}

export function useGradebook(offeringId: string) {
  return useQuery({
    queryKey: ['grading', offeringId, 'gradebook'],
    enabled: !!supabase && !!offeringId,
    queryFn: async () => {
      const { data, error } = await client().rpc('get_gradebook', { p_offering_id: offeringId })
      if (error) throw error
      return parseGradebook(data)
    },
  })
}

export function useSetManualGrade(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      enrollmentId: string; gradeItemId: string; score: number
      comment: string | null; reason: string | null
    }) => {
      const { error } = await client().rpc('set_manual_grade', {
        p_enrollment_id: input.enrollmentId, p_grade_item_id: input.gradeItemId,
        p_score: input.score, p_comment: input.comment ?? undefined, p_reason: input.reason ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['grading', offeringId, 'gradebook'] })
    },
  })
}

export function useFinalizeGrades(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await client().rpc('finalize_final_grades', {
        p_offering_id: offeringId,
      })
      if (error) throw error
      return data ?? 0
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['grading', offeringId, 'gradebook'] })
    },
  })
}

export async function getSubmissionFileUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from('submissions').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
