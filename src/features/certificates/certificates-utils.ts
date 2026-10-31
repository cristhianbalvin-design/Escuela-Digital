import type { Json } from '@/lib/supabase/database.types'

export type CompletionUnmet = {
  code: 'enrollment_status' | 'min_progress_pct' | 'min_final_grade' |
    'required_assessment' | 'enrollment_missing'
  required?: number | string
  actual?: number | string
  title?: string
}

export type CompletionRules = {
  min_progress_pct?: number
  min_final_grade?: number
  auto_issue?: boolean
  required_assessments?: string[]
}

export type Completion = {
  met: boolean
  unmet: CompletionUnmet[]
  rules: CompletionRules
}

export type CertificateStatus = 'pending_render' | 'issued' | 'revoked' | 'reissued'

export type IssuedCertificate = {
  id: string
  code: string
  status: CertificateStatus
  issued_at: string
  pdf_path: string | null
  last_render_error: string | null
  revoked_reason?: string | null
}

export type OfferingCertificate = {
  enrollment_id: string
  full_name: string
  email: string
  status: string
  progress_pct: number
  final_grade: number | null
  completion: Completion
  certificate: IssuedCertificate | null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rulesFrom(value: unknown): CompletionRules {
  const row = record(value)
  const required = Array.isArray(row?.required_assessments)
    ? row.required_assessments.filter((id): id is string => typeof id === 'string')
    : undefined
  const progress = num(row?.min_progress_pct)
  const grade = num(row?.min_final_grade)
  return {
    ...(progress !== null ? { min_progress_pct: progress } : {}),
    ...(grade !== null ? { min_final_grade: grade } : {}),
    ...(typeof row?.auto_issue === 'boolean' ? { auto_issue: row.auto_issue } : {}),
    ...(required ? { required_assessments: required } : {}),
  }
}

const UNMET_CODES = new Set<CompletionUnmet['code']>([
  'enrollment_status', 'min_progress_pct', 'min_final_grade',
  'required_assessment', 'enrollment_missing',
])

function parseUnmet(value: unknown): CompletionUnmet[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.code !== 'string' ||
      !UNMET_CODES.has(row.code as CompletionUnmet['code'])) return []
    const required = num(row.required) ?? (typeof row.required === 'string' ? row.required : undefined)
    const actual = num(row.actual) ?? (typeof row.actual === 'string' ? row.actual : undefined)
    return [{
      code: row.code as CompletionUnmet['code'],
      ...(required !== undefined ? { required } : {}),
      ...(actual !== undefined ? { actual } : {}),
      ...(typeof row.title === 'string' ? { title: row.title } : {}),
    }]
  })
}

export function parseCompletion(value: unknown): Completion {
  const row = record(value)
  const unmet = parseUnmet(row?.unmet)
  return {
    met: row?.met === true && unmet.length === 0,
    unmet,
    rules: rulesFrom(row?.rules),
  }
}

function certificateStatus(value: unknown): CertificateStatus {
  return value === 'issued' || value === 'revoked' || value === 'reissued'
    ? value : 'pending_render'
}

export function parseOfferingCertificates(value: unknown): OfferingCertificate[] {
  const values = Array.isArray(value) ? value : []
  return values.flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.enrollment_id !== 'string') return []
    const raw = record(row.certificate)
    const certificate: IssuedCertificate | null =
      raw && typeof raw.id === 'string'
        ? {
          id: raw.id,
          code: text(raw.code),
          status: certificateStatus(raw.status),
          issued_at: text(raw.issued_at),
          pdf_path: typeof raw.pdf_path === 'string' ? raw.pdf_path : null,
          last_render_error: typeof raw.last_render_error === 'string'
            ? raw.last_render_error : null,
          revoked_reason: typeof raw.revoked_reason === 'string'
            ? raw.revoked_reason : null,
        } : null
    return [{
      enrollment_id: row.enrollment_id,
      full_name: text(row.full_name),
      email: text(row.email),
      status: text(row.status),
      progress_pct: num(row.progress_pct) ?? 0,
      final_grade: num(row.final_grade),
      completion: parseCompletion(row.completion),
      certificate,
    }]
  })
}

export function parseCompletionRules(value: Json | unknown): CompletionRules {
  return rulesFrom(value)
}

export function unmetMessageKeys(unmet: CompletionUnmet[]): string[] {
  return unmet.map((item) => {
    switch (item.code) {
      case 'enrollment_status': return 'certificates.missing.enrollmentStatus'
      case 'min_progress_pct': return 'certificates.missing.progress'
      case 'min_final_grade': return 'certificates.missing.grade'
      case 'required_assessment': return 'certificates.missing.assessment'
      case 'enrollment_missing': return 'certificates.missing.enrollment'
    }
  })
}

/** Evaluaciones (quiz) del curso, tomadas del outline que devuelve get_course_outline. */
export function assessmentsFromOutline(value: unknown): { id: string; title: string }[] {
  const root = record(value)
  if (!root || !Array.isArray(root.modules)) return []
  return root.modules.flatMap((rawModule) => {
    const module = record(rawModule)
    if (!module || !Array.isArray(module.lessons)) return []
    return module.lessons.flatMap((rawLesson) => {
      const lesson = record(rawLesson)
      const content = record(lesson?.content)
      const id = typeof content?.assessment_id === 'string' ? content.assessment_id : null
      if (!lesson || !id) return []
      return [{ id, title: text(lesson.title, id) }]
    })
  })
}

/** Reglas a guardar: la nota mínima vacía o 0 significa "sin regla de nota". */
export function rulesToSave(values: {
  min_progress_pct: number
  min_final_grade: number
  auto_issue: boolean
  required_assessments: string[]
}): CompletionRules {
  return {
    min_progress_pct: values.min_progress_pct,
    ...(Number.isFinite(values.min_final_grade) && values.min_final_grade > 0
      ? { min_final_grade: values.min_final_grade } : {}),
    auto_issue: values.auto_issue,
    ...(values.required_assessments.length > 0
      ? { required_assessments: values.required_assessments } : {}),
  }
}

export function normalizeCertificateCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase()
}
