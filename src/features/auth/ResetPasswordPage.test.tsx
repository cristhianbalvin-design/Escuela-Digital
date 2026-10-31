import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TenantContext } from '@/app/TenantContext'
import '@/lib/i18n'
import type { TenantBranding } from '@/lib/tenant/branding'
import { ResetPasswordPage } from './ResetPasswordPage'

const mocked = vi.hoisted(() => ({ updateUser: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: mocked.updateUser } },
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ status: 'authenticated' }),
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

function renderPage() {
  return render(
    <MemoryRouter>
      <TenantContext.Provider value={brand}>
        <ResetPasswordPage />
      </TenantContext.Provider>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('muestra un error si las contraseñas son distintas', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'clave-segura-123' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'otra-clave-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(mocked.updateUser).not.toHaveBeenCalled()
  })

  it('actualiza la contraseña cuando los valores son válidos', async () => {
    mocked.updateUser.mockResolvedValueOnce({ error: null })
    renderPage()
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'clave-segura-123' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'clave-segura-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await waitFor(() => {
      expect(mocked.updateUser).toHaveBeenCalledWith({ password: 'clave-segura-123' })
    })
  })
})
