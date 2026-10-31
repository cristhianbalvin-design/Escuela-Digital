import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'

export type ActivityAttemptStatus =
  Database['public']['Enums']['attempt_status']
export type ActivityQuestionType =
  Database['public']['Enums']['question_type']
export type ActivitySubmissionStatus =
  Database['public']['Enums']['submission_status']

export type AssessmentAttemptSummary = {
  id: string
  attempt_no: number
  status: ActivityAttemptStatus
  submitted_at: string | null
  score: number | null
  max_score: number | null
  pending_review: boolean
}

export type AssessmentInfo = {
  assessment_id: string
  title: string
  instructions: string
  question_count: number
  total_points: number
  time_limit_minutes: number | null
  max_attempts: number | null
  pass_pct: number | null
  opens_at: string | null
  closes_at: string | null
  show_results: string
  results_visible: boolean
  attempts_used: number
  in_progress_attempt_id: string | null
  can_start: boolean
  reason: 'no_questions' | 'not_open' | 'closed' | 'no_attempts' | null
  attempts: AssessmentAttemptSummary[]
}

export type StartAttemptResponse = {
  attempt_id: string
  resumed: boolean
}

export type QuestionOption = {
  id: string
  label: string
}

export type AttemptQuestion = {
  id: string
  type: ActivityQuestionType
  prompt: string
  points: number
  answer: Json | null
  options: QuestionOption[] | null
}

export type AttemptInfo = {
  attempt_id: string
  assessment_id: string
  title: string
  instructions?: string
  status: ActivityAttemptStatus
  started_at?: string
  deadline_at?: string | null
  server_now?: string
  questions: AttemptQuestion[] | null
}

export type SubmitAttemptResponse = {
  attempt_id: string
  status: ActivityAttemptStatus
}

export type AttemptResultQuestion = AttemptQuestion & {
  score: number | null
  feedback: string | null
  correct: Json | null
}

export type AttemptResult = {
  attempt_id: string
  attempt_no: number
  status: ActivityAttemptStatus
  submitted_at: string | null
  results_visible: boolean
  pending_review: boolean
  score?: number
  max_score?: number
  pct?: number
  passed?: boolean | null
  questions?: AttemptResultQuestion[]
}

export type AssignmentRubricLevel = {
  id: string
  label: string
  descriptor: string
  points: number
}

export type AssignmentRubricCriterion = {
  id: string
  title: string
  levels: AssignmentRubricLevel[]
}

export type AssignmentRubric = {
  id: string
  title: string
  criteria: AssignmentRubricCriterion[]
}

export type SubmissionFile = {
  path: string
  name: string
  size: number
  mime: string | null
}

export type AssignmentRubricScore = {
  criterion_id: string
  level_id: string | null
  points: number
  comment: string | null
}

export type StudentSubmission = {
  id: string
  status: ActivitySubmissionStatus
  submitted_at: string
  is_late: boolean
  text: string | null
  link: string | null
  files: SubmissionFile[]
  score: number | null
  raw_score: number | null
  feedback: string | null
  graded_at: string | null
  rubric_scores: AssignmentRubricScore[] | null
}

export type AssignmentInfo = {
  assignment_id: string
  title: string
  instructions: string
  submission_types: Array<'text' | 'link' | 'file'>
  due_at: string | null
  allow_late: boolean
  late_penalty_pct: number
  max_score: number
  rubric: AssignmentRubric | null
  storage_prefix: string
  can_submit: boolean
  reason: 'closed' | 'graded' | null
  submission: StudentSubmission | null
}

export type SubmitAssignmentResponse = {
  submission_id: string
  is_late: boolean
}

export type UploadedSubmissionFile = {
  path: string
  name: string
  size: number
  mime: string
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw error
}

function rpcResult<T>(data: Json | null): T {
  if (data === null) throw new Error('La actividad no devolvió una respuesta')
  return data as T
}

export function useAssessmentInfo(
  enrollmentId: string | undefined,
  assessmentId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['student-assessment', enrollmentId, assessmentId],
    enabled: !!supabase && !!enrollmentId && !!assessmentId && enabled,
    queryFn: async (): Promise<AssessmentInfo> => {
      const { data, error } = await client().rpc('get_assessment_info', {
        p_enrollment_id: enrollmentId!,
        p_assessment_id: assessmentId!,
      })
      check(error)
      return rpcResult<AssessmentInfo>(data)
    },
  })
}

export function useStartAttempt(
  enrollmentId: string | undefined,
  assessmentId: string | undefined,
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<StartAttemptResponse> => {
      if (!enrollmentId || !assessmentId) {
        throw new Error('La evaluación no está disponible')
      }
      const { data, error } = await client().rpc('start_attempt', {
        p_enrollment_id: enrollmentId,
        p_assessment_id: assessmentId,
      })
      check(error)
      return rpcResult<StartAttemptResponse>(data)
    },
    onSuccess: async (result) => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['student-assessment', enrollmentId, assessmentId],
        }),
        cache.invalidateQueries({
          queryKey: ['student-attempt', result.attempt_id],
        }),
      ])
    },
  })
}

export function useStudentAttempt(
  attemptId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['student-attempt', attemptId],
    enabled: !!supabase && !!attemptId && enabled,
    queryFn: async (): Promise<AttemptInfo> => {
      const { data, error } = await client().rpc('get_attempt', {
        p_attempt_id: attemptId!,
      })
      check(error)
      return rpcResult<AttemptInfo>(data)
    },
  })
}

export function useSaveAttemptAnswer(attemptId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({
      questionId,
      answer,
    }: {
      questionId: string
      answer: Json | null
    }): Promise<void> => {
      if (!attemptId) throw new Error('El intento no está disponible')
      const { error } = await client().rpc('save_answer', {
        p_attempt_id: attemptId,
        p_question_id: questionId,
        p_answer: answer,
      })
      check(error)
    },
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ['student-attempt', attemptId],
      })
    },
  })
}

export function useSubmitAttempt(attemptId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SubmitAttemptResponse> => {
      if (!attemptId) throw new Error('El intento no está disponible')
      const { data, error } = await client().rpc('submit_attempt', {
        p_attempt_id: attemptId,
      })
      check(error)
      return rpcResult<SubmitAttemptResponse>(data)
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['student-attempt', attemptId],
        }),
        cache.invalidateQueries({
          queryKey: ['student-attempt-result', attemptId],
        }),
        cache.invalidateQueries({
          queryKey: ['student-assessment'],
        }),
      ])
    },
  })
}

export function useAttemptResult(
  attemptId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['student-attempt-result', attemptId],
    enabled: !!supabase && !!attemptId && enabled,
    queryFn: async (): Promise<AttemptResult> => {
      const { data, error } = await client().rpc('get_attempt_result', {
        p_attempt_id: attemptId!,
      })
      check(error)
      return rpcResult<AttemptResult>(data)
    },
  })
}

export function useAssignmentInfo(
  enrollmentId: string | undefined,
  assignmentId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['student-assignment', enrollmentId, assignmentId],
    enabled: !!supabase && !!enrollmentId && !!assignmentId && enabled,
    queryFn: async (): Promise<AssignmentInfo> => {
      const { data, error } = await client().rpc('get_assignment_for_student', {
        p_enrollment_id: enrollmentId!,
        p_assignment_id: assignmentId!,
      })
      check(error)
      return rpcResult<AssignmentInfo>(data)
    },
  })
}

export function useSubmitAssignment(
  enrollmentId: string | undefined,
  assignmentId: string | undefined,
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({
      text,
      link,
      files = [],
    }: {
      text?: string
      link?: string
      files?: Json
    }): Promise<SubmitAssignmentResponse> => {
      if (!enrollmentId || !assignmentId) {
        throw new Error('La tarea no está disponible')
      }
      const { data, error } = await client().rpc('submit_assignment', {
        p_enrollment_id: enrollmentId,
        p_assignment_id: assignmentId,
        p_text: text,
        p_link: link,
        p_files: files,
      })
      check(error)
      return rpcResult<SubmitAssignmentResponse>(data)
    },
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ['student-assignment', enrollmentId, assignmentId],
      })
    },
  })
}

export async function uploadSubmissionFile(
  storagePrefix: string,
  file: File,
): Promise<UploadedSubmissionFile> {
  const safeName = file.name.trim().replace(/[\\/]/g, '_') || 'archivo'
  const path = `${storagePrefix}${crypto.randomUUID()}-${safeName}`
  const { data, error } = await client()
    .storage
    .from('submissions')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (error) throw error

  return {
    path: data.path,
    name: safeName,
    size: file.size,
    mime: file.type || 'application/octet-stream',
  }
}

export async function createSignedUrl(
  path: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const { data, error } = await client()
    .storage
    .from('submissions')
    .createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}
