import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TenantContext } from '@/app/TenantContext'
import '@/lib/i18n'
import type { TenantBranding } from '@/lib/tenant/branding'
import { LoginPage } from './LoginPage'

const mocked = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithMagicLink: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    configured: true,
    status: 'anonymous',
    signInWithPassword: mocked.signInWithPassword,
    signInWithMagicLink: mocked.signInWithMagicLink,
  }),
}))
vi.mock('@/app/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Tema</button>,
}))

const brand: TenantBranding = {
  name: 'Escuela Demo',
  logos: { mark: 'E', alt: 'Escuela Demo' },
  colors: { primary: '#4F46E5', secondary: '#14B8A6' },
  welcomeText: '',
  language: 'es',
  timeZone: 'America/Lima',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('valida el correo antes de solicitar un enlace', async () => {
    render(
      <MemoryRouter>
        <TenantContext.Provider value={brand}>
          <LoginPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'correo-invalido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace de acceso' }))

    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
    expect(mocked.signInWithMagicLink).not.toHaveBeenCalled()
  })

  it('muestra un error genérico de acceso', async () => {
    mocked.signInWithPassword.mockRejectedValueOnce(new Error('usuario inexistente'))

    render(
      <MemoryRouter>
        <TenantContext.Provider value={brand}>
          <LoginPage />
        </TenantContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'persona@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'contraseña' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
      )
    })
    expect(screen.queryByText('usuario inexistente')).not.toBeInTheDocument()
  })
})
