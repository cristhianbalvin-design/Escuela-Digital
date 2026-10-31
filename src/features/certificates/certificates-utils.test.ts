import { describe, expect, it } from 'vitest'
import {
  assessmentsFromOutline, normalizeCertificateCode, parseOfferingCertificates,
  rulesToSave, unmetMessageKeys,
} from './certificates-utils'

describe('parseOfferingCertificates', () => {
  it('lee las filas válidas y descarta entradas inválidas', () => {
    expect(parseOfferingCertificates([
      null,
      {
        enrollment_id: 'en-1', full_name: 'Ana', email: 'ana@example.com',
        status: 'completed', progress_pct: 100, final_grade: 18,
        completion: { met: true, unmet: [], rules: {} },
        certificate: {
          id: 'cert-1', code: 'ABC-123', status: 'issued',
          issued_at: '2026-01-01', pdf_path: 'path.pdf',
        },
      },
    ])).toMatchObject([{
      enrollment_id: 'en-1',
      completion: { met: true, unmet: [] },
      certificate: { id: 'cert-1', status: 'issued', pdf_path: 'path.pdf' },
    }])
  })

  it('tolera un jsonb incompleto', () => {
    expect(parseOfferingCertificates({})).toEqual([])
    expect(parseOfferingCertificates(null)).toEqual([])
  })

  it('no da por cumplida una finalización con requisitos pendientes', () => {
    const [row] = parseOfferingCertificates([{
      enrollment_id: 'en-2',
      completion: { met: true, unmet: [{ code: 'min_progress_pct', required: 80, actual: 50 }] },
    }])
    expect(row?.completion.met).toBe(false)
  })
})

describe('unmetMessageKeys', () => {
  it('mapea cada regla incumplida a una clave legible', () => {
    expect(unmetMessageKeys([
      { code: 'min_progress_pct', required: 80 },
      { code: 'min_final_grade', required: 14 },
      { code: 'required_assessment', title: 'Evaluación' },
      { code: 'enrollment_status' },
      { code: 'enrollment_missing' },
    ])).toEqual([
      'certificates.missing.progress',
      'certificates.missing.grade',
      'certificates.missing.assessment',
      'certificates.missing.enrollmentStatus',
      'certificates.missing.enrollment',
    ])
  })
})

describe('assessmentsFromOutline', () => {
  it('extrae las evaluaciones desde el contenido de las lecciones', () => {
    expect(assessmentsFromOutline({
      modules: [{ lessons: [
        { title: 'Examen', content: { assessment_id: 'as-1' } },
        { title: 'Lectura', content: { body: 'x' } },
      ] }],
    })).toEqual([{ id: 'as-1', title: 'Examen' }])
  })
})

describe('rulesToSave', () => {
  it('omite la nota mínima cuando está vacía o es 0', () => {
    expect(rulesToSave({
      min_progress_pct: 80, min_final_grade: Number.NaN,
      auto_issue: false, required_assessments: [],
    })).toEqual({ min_progress_pct: 80, auto_issue: false })
    expect(rulesToSave({
      min_progress_pct: 80, min_final_grade: 0,
      auto_issue: true, required_assessments: ['a'],
    })).toEqual({ min_progress_pct: 80, auto_issue: true, required_assessments: ['a'] })
  })

  it('conserva una nota mínima positiva', () => {
    expect(rulesToSave({
      min_progress_pct: 100, min_final_grade: 14,
      auto_issue: false, required_assessments: [],
    }).min_final_grade).toBe(14)
  })
})

describe('normalizeCertificateCode', () => {
  it('quita espacios y normaliza mayúsculas', () => {
    expect(normalizeCertificateCode('  ab c- 12  ')).toBe('ABC-12')
  })
})
