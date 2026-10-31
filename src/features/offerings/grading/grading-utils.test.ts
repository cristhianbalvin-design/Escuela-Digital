import { describe, expect, it } from 'vitest'
import { formatGrade, gradebookToCsv, penalizedScore, rubricTotal } from './grading-utils'
import type { GradebookStudent, GradeItem, RubricCriterion } from './grading-api'

describe('utilidades de calificación', () => {
  it('formatea notas y valores vacíos', () => {
    expect(formatGrade(15.5)).toBe('15.50')
    expect(formatGrade(null)).toBe('—')
  })
  it('aplica penalidad solo si la entrega llegó tarde', () => {
    expect(penalizedScore(18, 20, 25, true)).toBe(13.5)
    expect(penalizedScore(18, 20, 25, false)).toBe(18)
  })
  it('suma los niveles de rúbrica seleccionados', () => {
    const criteria: RubricCriterion[] = [{
      id: 'c1', title: 'Criterio', levels: [{ id: 'l1', label: 'Alto', descriptor: '', points: 4 }],
    }]
    expect(rubricTotal(criteria, { c1: { levelId: 'l1' } })).toBe(4)
  })
  it('genera CSV escapando comas y comillas sin BOM', () => {
    const items: GradeItem[] = [{
      id: 'i1', title: 'Tarea, "A"', source_type: 'manual', source_id: 's1', weight: 50, max_score: 20,
    }]
    const students: GradebookStudent[] = [{
      enrollment_id: 'e1', user_id: 'u1', email: 'ana@example.com', full_name: 'Ana, "Pérez"',
      status: 'active', saved_final_grade: null, grades: {},
      summary: { items: [], partial: 15.5, final: null },
    }]
    expect(gradebookToCsv(items, students)).toBe(
      'Alumno,Correo,"Tarea, ""A"" (50)",Nota parcial,Nota final\r\n"Ana, ""Pérez""",ana@example.com,,15.5,',
    )
    expect(gradebookToCsv(items, students).startsWith('\uFEFF')).toBe(false)
  })
})
