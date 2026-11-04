import { useState } from 'react'
import { Bell, Search } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { useTenant } from './TenantContext'
import { navigation } from './navigation'
import { rolePath, useRole, type Role } from './role'
import { ThemeToggle } from './ThemeToggle'

const roles: Role[] = ['teacher', 'student', 'admin', 'coordinator', 'platform']

export function RoleLayout({ role }: { role: Role }) {
  const { t } = useTranslation()
  const brand = useTenant()
  const auth = useAuth()
  const access = useTenantAccess()
  const location = useLocation()
  const navigate = useNavigate()
  const setRole = useRole((state) => state.setRole)
  const [signOutError, setSignOutError] = useState('')
  const links = navigation[role]
  const viewOptions = (['admin', 'teacher', 'coordinator'] as const).filter((item) => access.views?.[item])

  async function handleSignOut() {
    setSignOutError('')
    try {
      await auth.signOut()
      navigate(`/iniciar-sesion${location.search}`, { replace: true })
    } catch {
      setSignOutError('No se pudo cerrar sesión. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex min-h-18 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            role="img"
            aria-label={brand.logos.alt}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand text-xl font-bold text-brand-on"
          >
            {brand.logos.mark}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold sm:text-base">
              {brand.name}
            </p>
            <p className="text-xs text-text-muted">{t('school')}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {access.location.kind === 'platform' &&
            access.memberships.length > 0 && (
              <NavLink
                to={`/${location.search}`}
                className="hidden min-h-11 items-center rounded-control px-3 text-sm font-semibold hover:bg-brand-soft sm:inline-flex"
              >
                {t('selectSchool')}
              </NavLink>
            )}
          {supabase && viewOptions.length > 1 && (viewOptions as readonly Role[]).includes(role) && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <span className="sr-only sm:not-sr-only">{t('viewSelector')}</span>
              <select
                value={role}
                aria-label={t('viewSelector')}
                onChange={(event) => {
                  navigate(`${rolePath[event.target.value as Role]}${location.search}`)
                }}
                className="min-h-11 rounded-control border border-border bg-transparent px-2 font-normal hover:bg-brand-soft"
              >
                {viewOptions.map((item) => (
                  <option key={item} value={item}>{t(`views.${item}`)}</option>
                ))}
              </select>
            </label>
          )}
          <Button variant="ghost" aria-label={t('search')} className="px-3">
            <Search size={20} />
          </Button>
          <Button
            variant="ghost"
            aria-label={t('notifications')}
            className="px-3"
          >
            <Bell size={20} />
          </Button>
          <ThemeToggle />
          <details className="relative">
            <summary
              aria-label={t('accountMenu')}
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-chip border border-border bg-brand-soft font-bold focus-visible:outline-3"
            >
              {brand.logos.mark}
            </summary>
            <div className="absolute right-0 mt-2 min-w-40 rounded-control border border-border bg-surface p-2 shadow-lg">
              {supabase ? (
                <>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => void handleSignOut()}
                  >
                    Cerrar sesión
                  </Button>
                  {signOutError && (
                    <p role="alert" className="px-3 text-sm text-error">
                      {signOutError}
                    </p>
                  )}
                </>
              ) : (
                <NavLink
                  to={`/iniciar-sesion${location.search}`}
                  className="block rounded-control px-3 py-2 text-sm hover:bg-brand-soft"
                >
                  {t('signIn')}
                </NavLink>
              )}
            </div>
          </details>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside
          className="hidden w-60 shrink-0 border-r border-border p-4 md:block"
          aria-label={t(`role${role.charAt(0).toUpperCase()}${role.slice(1)}`)}
        >
          <nav className="grid gap-1">
            {links.map(({ key, segment }) => (
              <NavLink
                key={key}
                to={`${rolePath[role]}/${segment}${location.search}`}
                className={({ isActive }) =>
                  `flex min-h-11 items-center rounded-control px-3 text-sm font-medium hover:bg-brand-soft ${isActive ? 'bg-brand-soft text-brand' : 'text-text-muted'}`
                }
              >
                {t(`nav.${role}.${key}`)}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main
          className={`min-w-0 flex-1 p-5 sm:p-8 ${role === 'student' ? 'pb-24 md:pb-8' : ''}`}
        >
          {import.meta.env.DEV && !supabase && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-3">
              <label htmlFor="demo-role" className="text-sm font-semibold">
                {t('demoRole')}
              </label>
              <select
                id="demo-role"
                value={role}
                onChange={(event) => {
                  const nextRole = event.target.value as Role
                  setRole(nextRole)
                  navigate(`${rolePath[nextRole]}${location.search}`)
                }}
                className="min-h-11 rounded-control border border-border bg-surface px-3 text-sm"
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {t(`role${item.charAt(0).toUpperCase()}${item.slice(1)}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {role === 'student' && (
        <nav
          aria-label={t('roleStudent')}
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface md:hidden"
        >
          {links.map(({ key, segment }) => (
            <NavLink
              key={key}
              to={`${rolePath[role]}/${segment}${location.search}`}
              className={({ isActive }) =>
                `flex min-h-16 flex-1 items-center justify-center px-1 text-center text-xs ${isActive ? 'font-bold text-brand' : 'text-text-muted'}`
              }
            >
              {t(`nav.${role}.${key}`)}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
