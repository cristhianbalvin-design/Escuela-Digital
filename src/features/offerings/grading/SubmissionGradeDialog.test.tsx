import '@/lib/i18n'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubmissionGradeDialog } from './SubmissionGradeDialog'

const { useSubmissionForGrading, useGradeSubmission } = vi.hoisted(() => ({
  useSubmissionForGrading: vi.fn(),
  useGradeSubmission: vi.fn(),
}))
vi.mock('./grading-api', () => ({
  useSubmissionForGrading, useGradeSubmission, getSubmissionFileUrl: vi.fn(),
}))

describe('SubmissionGradeDialog', () => {
  beforeEach(() => {
    useSubmissionForGrading.mockReturnValue({
      isPending: false, isError: false, data: {
        submission: { id: 's1', text: 'Respuesta', link: null, files: [], is_late: false,
          score: null, raw_score: null, feedback: null, status: 'submitted',
          assignment_id: 'a1', enrollment_id: 'e1' },
        assignment: { title: 'Tarea', instructions: '', max_score: 10, late_penalty_pct: 0,
          rubric_id: 'r1' },
        criteria: [{ id: 'c1', title: 'Claridad', levels: [
          { id: 'l1', label: 'Básico', descriptor: '', points: 2 },
          { id: 'l2', label: 'Avanzado', descriptor: '', points: 5 },
        ] }], scores: [],
      },
    })
    useGradeSubmission.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false })
  })
  it('calcula el total al seleccionar un nivel y guarda la rúbrica', async () => {
    const mutateAsync = useGradeSubmission().mutateAsync as ReturnType<typeof vi.fn>
    render(<QueryClientProvider client={new QueryClient()}>
      <SubmissionGradeDialog offeringId="o1" submissionId="s1" onClose={vi.fn()} />
    </QueryClientProvider>)
    fireEvent.click(screen.getByRole('radio', { name: /Avanzado/ }))
    expect(screen.getByRole('status')).toHaveTextContent('5.00')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      submissionId: 's1', scores: [{ criterion_id: 'c1', level_id: 'l2', comment: '' }],
      feedback: null, rawScore: null,
    }))
  })
})
