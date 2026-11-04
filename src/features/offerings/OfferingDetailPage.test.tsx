import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui'
import '@/lib/i18n'
import { OfferingDetailPage } from './OfferingDetailPage'

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, from },
}))

vi.mock('@/features/tenants', () => ({
  useTenantAccess: () => ({ active: { tenant_id: 'tenant-1' } }),
}))

describe('OfferingDetailPage', () => {
  beforeEach(() => {
    rpc.mockReset()
    from.mockReset()

    from.mockImplementation((table: string) => {
      const data = table === 'offerings'
        ? {
          id: 'offering-1',
          title: 'Edición de prueba',
          status: 'open',
          code: 'ED-1',
          starts_at: null,
          ends_at: null,
          seats: 10,
          client_id: 'client-1',
        }
        : table === 'clients'
          ? [{ id: 'client-1', name: 'Cliente de prueba' }]
          : []
      const result = { data, error: null }
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        single: () => Promise.resolve(result),
        then: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      }
      return chain
    })

    rpc.mockImplementation(async (name: string) => {
      if (name === 'list_offering_roster') return { data: [], error: null }
      if (name === 'list_enrollable_students') {
        return {
          data: [
            { user_id: 'student-1', email: 'ana@example.com', full_name: 'Ana Pérez' },
            { user_id: 'student-2', email: 'luis@example.com', full_name: 'Luis Soto' },
          ],
          error: null,
        }
      }
      if (name === 'enroll_user') return { data: 'enrollment-1', error: null }
      return { data: null, error: null }
    })
  })

  it('lista candidatos y matricula los ids seleccionados', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/docente/ediciones/offering-1?tenant=escuela']}>
          <ToastProvider>
            <Routes>
              <Route path="/docente/ediciones/:offeringId" element={<OfferingDetailPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('tab', { name: 'Estudiantes' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Matricular' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana Pérez/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Luis Soto/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Matricular seleccionados' }))

    await waitFor(() => {
      const enrollCalls = rpc.mock.calls.filter(([name]) => name === 'enroll_user')
      expect(enrollCalls).toEqual([
        ['enroll_user', { p_offering_id: 'offering-1', p_user_id: 'student-1' }],
        ['enroll_user', { p_offering_id: 'offering-1', p_user_id: 'student-2' }],
      ])
    })
  })
})
