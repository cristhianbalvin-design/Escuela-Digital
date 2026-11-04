import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { supabase } from '@/lib/supabase'
import type { TenantLocation } from '@/lib/tenant'
import type { Role } from '@/app/role'
import {
  fetchIsPlatformAdmin,
  fetchMyTenants,
  fetchMyViews,
  mapTenantRole,
  NO_VIEWS,
  selectActiveTenant,
  viewsFromRole,
  type MyTenant,
  type MyViews,
} from './membership'

type AccessStatus = 'idle' | 'loading' | 'ready' | 'error'

type TenantAccess = {
  status: AccessStatus
  location: TenantLocation
  memberships: MyTenant[]
  active: MyTenant | null
  isPlatformAdmin: boolean
  role: Role | null
  views: MyViews
  retry: () => void
}

const TenantAccessContext = createContext<TenantAccess | null>(null)

export function TenantAccessProvider({
  location,
  children,
}: {
  location: TenantLocation
  children: ReactNode
}) {
  const auth = useAuth()
  const query = useQuery({
    queryKey: ['tenant-access', auth.user?.id, location.host],
    enabled: !!supabase && auth.status === 'authenticated' && !!auth.user,
    queryFn: async () => {
      if (!supabase || !auth.user) throw new Error('Sesión no disponible')

      const [memberships, isPlatformAdmin] = await Promise.all([
        fetchMyTenants(supabase),
        fetchIsPlatformAdmin(supabase, auth.user.id),
      ])
      const activeTenant = selectActiveTenant(location, memberships)
      let views: MyViews | null = null
      if (activeTenant) {
        try {
          views = await fetchMyViews(supabase, activeTenant.tenant_id)
        } catch {
          views = null
        }
      }
      return { memberships, isPlatformAdmin, views }
    },
    retry: 1,
  })

  const status: AccessStatus =
    !supabase || auth.status !== 'authenticated'
      ? 'idle'
      : query.isPending
        ? 'loading'
        : query.isError
          ? 'error'
          : 'ready'

  const memberships = status === 'ready' ? (query.data?.memberships ?? []) : []
  const isPlatformAdmin =
    status === 'ready' ? (query.data?.isPlatformAdmin ?? false) : false
  const active = selectActiveTenant(location, memberships)
  const role: Role | null =
    status !== 'ready'
      ? null
      : location.kind === 'platform'
        ? isPlatformAdmin
          ? 'platform'
          : null
        : // Dentro de una escuela manda la membresía (p. ej. dueño → admin);
          // el rol de operador solo aplica en el host de plataforma.
          active
          ? mapTenantRole(active.role)
          : null

  const views: MyViews =
    status !== 'ready' ? NO_VIEWS : (query.data?.views ?? viewsFromRole(role))

  return (
    <TenantAccessContext.Provider
      value={{
        status,
        location,
        memberships,
        active,
        isPlatformAdmin,
        role,
        views,
        retry: () => void query.refetch(),
      }}
    >
      {children}
    </TenantAccessContext.Provider>
  )
}

export function useTenantAccess(): TenantAccess {
  const context = useContext(TenantAccessContext)
  if (!context) throw new Error('TenantAccessProvider missing')
  return context
}

function schoolUrl(school: MyTenant, location: TenantLocation): string | null {
  if (
    import.meta.env.DEV &&
    (location.host === 'localhost' || location.host === '127.0.0.1')
  ) {
    return `${window.location.origin}/?tenant=${encodeURIComponent(school.slug)}`
  }

  const root = (import.meta.env.VITE_PLATFORM_ROOT_DOMAIN ?? '')
    .toLowerCase()
    .replace(/\.$/, '')
  const host = school.primary_host ?? (root ? `${school.slug}.${root}` : '')
  return host ? `${window.location.protocol}//${host}/` : null
}

export function SchoolSelector() {
  const { memberships, location } = useTenantAccess()

  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center p-5">
      <Card>
        <h1 className="mb-3 text-xl font-bold">Seleccionar escuela</h1>
        <p className="mb-5 text-text-muted">
          Elige la escuela a la que quieres acceder.
        </p>
        <div className="grid gap-2">
          {memberships.map((school) => {
            const url = schoolUrl(school, location)
            return url ? (
              <a
                key={school.tenant_id}
                href={url}
                className="flex min-h-11 items-center rounded-control border border-border px-4 font-semibold hover:bg-brand-soft"
              >
                {school.name}
              </a>
            ) : (
              <p key={school.tenant_id} className="text-sm text-text-muted">
                {school.name}: no hay un dominio de acceso configurado.
              </p>
            )
          })}
        </div>
      </Card>
    </main>
  )
}

export function NoSchoolAccess() {
  const { signOut } = useAuth()

  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center p-5">
      <Card>
        <h1 className="mb-3 text-xl font-bold">Sin acceso a esta escuela</h1>
        <p className="mb-5 text-text-muted">
          Tu cuenta no tiene una membresía activa para esta escuela.
        </p>
        <Button onClick={() => void signOut()}>Cerrar sesión</Button>
      </Card>
    </main>
  )
}
