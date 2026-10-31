import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/lib/i18n'
import { StudentCoursePage } from './StudentCoursePage'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('./MyGradesPanel', () => ({ MyGradesPanel: () => null }))
vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }))
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'ana@example.com' } }),
}))
vi.mock('@/features/tenants', () => ({
  useTenantAccess: () => ({ active: { tenant_id: 'tenant-1' } }),
}))

describe('StudentCoursePage', () => {
  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    from.mockImplementation((table: string) => {
      const data = table === 'enrollments'
        ? [{
          id: 'enrollment-1', offering_id: 'offering-1', status: 'active',
          progress_pct: 0, enrolled_at: '2026-10-01T00:00:00Z',
          last_activity_at: null,
        }]
        : table === 'offerings'
          ? [{
            id: 'offering-1', title: 'Edición de prueba', code: 'ED-1',
            status: 'running', starts_at: null, ends_at: null,
            modality: 'self_paced', timezone: 'America/Lima',
            release_schedule: {},
          }]
          : []
      const result = { data, error: null }
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        order: () => chain,
        then: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      }
      return chain
    })
    rpc.mockResolvedValue({
      data: {
        modules: [{
          id: 'module-1', title: 'Módulo cerrado', position: 1,
          locked: true, locked_reason: 'scheduled',
          unlock_at: '2026-11-12T15:00:00Z',
          lessons: [{
            id: 'lesson-1', title: 'Lección cerrada', position: 1, type: 'reading',
            locked: true, locked_reason: 'scheduled',
            unlock_at: '2026-11-12T15:00:00Z',
          }],
        }],
      },
      error: null,
    })
  })

  it('muestra el candado y la fecha sin enlazar la lección bloqueada', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/estudiante/cursos/offering-1?tenant=escuela']}>
          <Routes>
            <Route path="/estudiante/cursos/:offeringId"
              element={<StudentCoursePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const summary = await screen.findByText('Módulo cerrado')
    summary.closest('summary')?.click()
    expect(await screen.findByText(/Se libera el/)).toBeInTheDocument()
    expect(screen.getByText('Lección cerrada').closest('a')).toBeNull()
  })
})
