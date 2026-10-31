import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui'
import '@/lib/i18n'
import { LessonPlayerPage } from './LessonPlayerPage'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }))
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'ana@example.com' } }),
}))
vi.mock('@/features/tenants', () => ({
  useTenantAccess: () => ({ active: { tenant_id: 'tenant-1' } }),
}))

describe('LessonPlayerPage', () => {
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
    rpc.mockImplementation(async (name: string) => name === 'get_course_outline'
      ? {
        data: {
          modules: [{
            id: 'module-1', title: 'Módulo', position: 1,
            locked: false, locked_reason: null, unlock_at: null,
            lessons: [{
              id: 'lesson-1', title: 'Lección', position: 1, type: 'reading',
              locked: false, locked_reason: null, unlock_at: null,
              content: { text: 'Contenido' },
            }],
          }],
        },
        error: null,
      }
      : { data: { progress_pct: 0 }, error: null })
  })

  it('registra la apertura una vez con matrícula, lección y estado correctos', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[
          '/estudiante/cursos/offering-1/lecciones/lesson-1?tenant=escuela',
        ]}>
          <ToastProvider>
            <Routes>
              <Route
                path="/estudiante/cursos/:offeringId/lecciones/:lessonId"
                element={<LessonPlayerPage />}
              />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Contenido')).toBeInTheDocument()
    await waitFor(() => {
      expect(rpc.mock.calls.filter(([name]) =>
        name === 'mark_lesson_progress')).toEqual([[
        'mark_lesson_progress',
        {
          p_enrollment_id: 'enrollment-1',
          p_lesson_id: 'lesson-1',
          p_status: 'in_progress',
        },
      ]])
    })
  })
})
