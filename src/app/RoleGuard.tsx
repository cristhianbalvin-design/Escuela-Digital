import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { useRole, type Role, rolePath } from './role'

export function RoleGuard({
  allowed,
  children,
}: {
  allowed: Role
  children: ReactNode
}) {
  const auth = useAuth()
  const access = useTenantAccess()
  const mockRole = useRole((state) => state.role)
  const location = useLocation()

  if (supabase && (auth.status === 'loading' || access.status === 'loading')) {
    return <main role="status" className="p-8">Cargando acceso…</main>
  }

  if (supabase && auth.status === 'anonymous') {
    return <Navigate to={`/iniciar-sesion${location.search}`} replace />
  }

  const role = supabase ? access.role : mockRole

  if (role === null) {
    return <Navigate to={`/iniciar-sesion${location.search}`} replace />
  }
  if (role !== allowed) {
    return <Navigate to={`${rolePath[role]}${location.search}`} replace />
  }

  return children
}
