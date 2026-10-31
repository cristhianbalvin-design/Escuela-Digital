import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/lib/i18n'
import { InvitationPage } from './InvitationPage'

const mocked = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  order: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocked.rpc,
    functions: { invoke: mocked.invoke },
  },
}))

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    configured: true,
    status: 'anonymous',
    user: null,
    signInWithPassword: mocked.signInWithPassword,
    signOut: mocked.signOut,
  }),
}))

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      <MemoryRouter initialEntries={['/invitacion/token-1?tenant=escuela']}>
        <Routes>
          <Route path="/invitacion/:token" element={<InvitationPage />} />
          <Route path="/estudiante/cursos" element={<p>Mis cursos listos</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocked.rpc.mockReset()
  mocked.invoke.mockReset()
  mocked.signInWithPassword.mockReset()
  mocked.signOut.mockReset()
  mocked.order.length = 0
})

afterEach(() => cleanup())

describe('InvitationPage', () => {
  it.each([
    ['invalid', 'Esta invitación no es válida.'],
    ['expired', 'Esta invitación venció.'],
  ])('muestra el estado %s', async (status, message) => {
    mocked.rpc.mockResolvedValue({
      data: status === 'invalid'
        ? { status }
        : {
          status,
          email: 'alumno@example.com',
          tenant_name: 'Escuela',
          tenant_slug: 'escuela',
          offering_title: 'Curso',
        },
      error: null,
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }))
      .toHaveAttribute('href', '/iniciar-sesion?tenant=escuela')
  })

  it('crea la cuenta, inicia sesión y acepta en ese orden', async () => {
    mocked.rpc.mockImplementation(async (name: string) => {
      if (name === 'preview_invitation') {
        return {
          data: {
            status: 'valid',
            email: 'alumno@example.com',
            tenant_name: 'Escuela',
            tenant_slug: 'escuela',
            offering_title: 'Curso',
          },
          error: null,
        }
      }
      mocked.order.push('accept_invitation')
      return {
        data: {
          offering_id: 'offering-1',
          enrollment_id: 'enrollment-1',
          tenant_slug: 'escuela',
        },
        error: null,
      }
    })
    mocked.invoke.mockImplementation(async () => {
      mocked.order.push('accept-invite')
      return { data: { ok: true, email: 'alumno@example.com' }, error: null }
    })
    mocked.signInWithPassword.mockImplementation(async () => {
      mocked.order.push('signInWithPassword')
    })
    renderPage()

    fireEvent.change(await screen.findByLabelText('Contraseña'), {
      target: { value: 'contraseña-segura' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { value: 'contraseña-segura' },
    })
    fireEvent.click(screen.getByRole('button', {
      name: 'Crear cuenta y aceptar invitación',
    }))

    await waitFor(() => expect(screen.getByText('Mis cursos listos')).toBeInTheDocument())
    expect(mocked.order).toEqual([
      'accept-invite',
      'signInWithPassword',
      'accept_invitation',
    ])
    expect(mocked.invoke).toHaveBeenCalledWith('accept-invite', {
      body: {
        token: 'token-1',
        password: 'contraseña-segura',
        full_name: undefined,
      },
    })
    expect(mocked.signInWithPassword).toHaveBeenCalledWith(
      'alumno@example.com',
      'contraseña-segura',
    )
    expect(mocked.rpc).toHaveBeenCalledWith('accept_invitation', {
      p_token: 'token-1',
    })
  })
})
