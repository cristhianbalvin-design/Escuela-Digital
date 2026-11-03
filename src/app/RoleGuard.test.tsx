import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleGuard } from './RoleGuard'

const mocked = vi.hoisted(() => ({
  authStatus: 'authenticated' as 'authenticated' | 'anonymous' | 'loading',
  role: 'teacher' as 'teacher' | 'student' | 'admin' | 'coordinator' | 'platform' | null,
}))

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ status: mocked.authStatus }),
}))
vi.mock('@/features/tenants', () => ({
  useTenantAccess: () => ({ status: 'ready', role: mocked.role }),
}))

describe('RoleGuard con Supabase configurado', () => {
  function TeacherPage() {
    const location = useLocation()
    return <p>Docente {location.search}</p>
  }

  beforeEach(() => {
    mocked.authStatus = 'authenticated'
    mocked.role = 'teacher'
  })
  afterEach(cleanup)

  it('muestra la página cuando coincide el rol del servidor', () => {
    render(
      <MemoryRouter initialEntries={['/docente']}>
        <Routes>
          <Route
            path="/docente"
            element={
              <RoleGuard allowed="teacher">
                <p>Permitido</p>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Permitido')).toBeInTheDocument()
  })

  it('redirige al panel del rol efectivo', () => {
    render(
      <MemoryRouter initialEntries={['/admin?tenant=tideo']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RoleGuard allowed="admin">
                <p>Admin</p>
              </RoleGuard>
            }
          />
          <Route path="/docente" element={<TeacherPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Docente ?tenant=tideo')).toBeInTheDocument()
  })

  it('permite al administrador entrar a la vista docente', () => {
    mocked.role = 'admin'
    render(
      <MemoryRouter initialEntries={['/docente']}>
        <Routes>
          <Route
            path="/docente"
            element={
              <RoleGuard allowed="teacher">
                <p>Vista docente del administrador</p>
              </RoleGuard>
            }
          />
          <Route path="/admin" element={<p>Admin</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Vista docente del administrador')).toBeInTheDocument()
  })

  it('redirige a iniciar sesión cuando no hay sesión', () => {
    mocked.authStatus = 'anonymous'
    mocked.role = null

    render(
      <MemoryRouter initialEntries={['/docente?tenant=tideo']}>
        <Routes>
          <Route
            path="/docente"
            element={
              <RoleGuard allowed="teacher">
                <p>Docente</p>
              </RoleGuard>
            }
          />
          <Route
            path="/iniciar-sesion"
            element={<p>Iniciar sesión</p>}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Iniciar sesión')).toBeInTheDocument()
  })
})
