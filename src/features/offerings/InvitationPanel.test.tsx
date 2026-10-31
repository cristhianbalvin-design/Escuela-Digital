import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/lib/i18n'
import { InvitationPanel } from './InvitationPanel'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}))

beforeEach(() => {
  rpc.mockReset()
  rpc.mockImplementation(async (name: string) => {
    if (name === 'list_offering_invitations') return { data: [], error: null }
    if (name === 'create_invitation') {
      return {
        data: {
          id: 'invitation-1',
          token: 'secret-token',
          expires_at: '2026-11-12T00:00:00Z',
        },
        error: null,
      }
    }
    return { data: null, error: null }
  })
})

afterEach(() => cleanup())

describe('InvitationPanel', () => {
  it('muestra el enlace completo únicamente tras crearlo', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/docente/ediciones/offering-1?tenant=escuela']}>
          <InvitationPanel offeringId="offering-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.queryByLabelText('Enlace de invitación')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'alumno@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generar enlace' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Enlace de invitación')).toHaveValue(
        `${window.location.origin}/invitacion/secret-token?tenant=escuela`,
      )
    })
    expect(screen.getByText(
      'Este enlace se muestra una sola vez. Cópialo ahora.',
    )).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('create_invitation', {
      p_offering_id: 'offering-1',
      p_email: 'alumno@example.com',
    })
  })
})
