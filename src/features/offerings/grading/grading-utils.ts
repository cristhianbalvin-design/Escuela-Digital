import type { GradebookStudent, GradeItem, RubricCriterion } from './grading-api'

export function formatGrade(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—'
}

export function penalizedScore(
  raw: number, max: number, pct: number, isLate: boolean,
): number {
  const bounded = Math.min(max, Math.max(0, raw))
  return isLate ? bounded * (1 - Math.min(100, Math.max(0, pct)) / 100) : bounded
}

export function rubricTotal(
  criteria: RubricCriterion[], selections: Record<string, { levelId: string; comment?: string }>,
): number {
  return criteria.reduce((total, criterion) => {
    const levelId = selections[criterion.id]?.levelId
    return total + (criterion.levels.find((level) => level.id === levelId)?.points ?? 0)
  }, 0)
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function gradebookToCsv(items: GradeItem[], students: GradebookStudent[]): string {
  const headers = ['Alumno', 'Correo', ...items.map((item) => `${item.title} (${item.weight})`),
    'Nota parcial', 'Nota final']
  const rows = students.map((student) => [
    student.full_name?.trim() || student.email,
    student.email,
    ...items.map((item) => {
      const grade = student.grades[item.id]
      return grade ? String(grade.score) : ''
    }),
    student.summary.partial === null ? '' : String(student.summary.partial),
    student.summary.final === null ? '' : String(student.summary.final),
  ])
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
