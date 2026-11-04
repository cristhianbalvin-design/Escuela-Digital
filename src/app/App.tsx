import { useEffect, useMemo, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button, Card, ToastProvider } from '@/components/ui'
import { AuthProvider, LoginPage, ResetPasswordPage, useAuth } from '@/features/auth'
import { InvitationPage } from '@/features/invitations/InvitationPage'
import {
  NoSchoolAccess,
  SchoolSelector,
  TenantAccessProvider,
  useTenantAccess,
} from '@/features/tenants'
import {
  CoursesPage,
  CreateCoursePage,
  CourseBuilderPage,
} from '@/features/courses'
import {
  OfferingsPage,
  CreateOfferingPage,
  OfferingDetailPage,
} from '@/features/offerings'
import {
  LessonPlayerPage,
  StudentCoursePage,
  StudentCoursesPage,
  StudentHomePage,
} from '@/features/student'
import {
  SignersPage,
  StudentCertificatesPage,
  VerifyCertificatePage,
} from '@/features/certificates'
import { ClientsPage } from '@/features/clients'
import { GlobalAnalyticsPage, GlobalCalendarPage, GlobalStudentsPage } from '@/features/global'
import { supabase } from '@/lib/supabase'
import { applyBrand } from '@/lib/theme'
import { resolveTenant, type TenantLocation } from '@/lib/tenant'
import {
  MockBrandingSource,
  SupabaseBrandingSource,
  type TenantBranding,
} from '@/lib/tenant/branding'
import { navigation } from './navigation'
import { PlaceholderPage } from './PlaceholderPage'
import { RoleGuard } from './RoleGuard'
import { RoleLayout } from './RoleLayout'
import { rolePath, useRole, type Role } from './role'
import { TenantContext } from './TenantContext'

const brandingSource = supabase
  ? new SupabaseBrandingSource(supabase)
  : new MockBrandingSource()
const queryClient = new QueryClient()
const roles: Role[] = ['teacher', 'student', 'admin', 'coordinator', 'platform']

const platformBrand: TenantBranding = {
  name: 'Escuela Digital',
  logos: { mark: 'E', alt: 'Escuela Digital' },
  colors: { primary: '#4F46E5', secondary: '#14B8A6' },
  welcomeText: '',
  language: 'es',
  timeZone: 'America/Lima',
}

function PwaNotice() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-4 shadow-lg"
    >
      <span>{t('updateAvailable')}</span>
      <Button onClick={() => void updateServiceWorker(true)}>
        {t('updateNow')}
      </Button>
      <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('later')}
      </Button>
    </div>
  )
}

function HomeRedirect() {
  const auth = useAuth()
  const access = useTenantAccess()
  const mockRole = useRole((state) => state.role)
  const location = useLocation()

  if (supabase && auth.status === 'loading') {
    return <main role="status" className="p-8">Cargando acceso…</main>
  }
  if (supabase && auth.status === 'anonymous') {
    return <Navigate to={`/iniciar-sesion${location.search}`} replace />
  }

  const role = supabase ? access.role : mockRole
  return role
    ? <Navigate to={`${rolePath[role]}${location.search}`} replace />
    : <Navigate to={`/iniciar-sesion${location.search}`} replace />
}

function AccessScreen() {
  const { t } = useTranslation()
  const access = useTenantAccess()
  const auth = useAuth()

  if (!supabase || auth.status !== 'authenticated') return null

  if (access.status === 'loading') {
    return <main role="status" className="p-8">{t('loading')}</main>
  }

  if (access.status === 'error') {
    return (
      <main className="mx-auto grid min-h-screen max-w-lg content-center p-5">
        <Card>
          <h1 className="mb-3 text-xl font-bold">
            No se pudo comprobar tu acceso
          </h1>
          <Button onClick={access.retry}>{t('retry')}</Button>
        </Card>
      </main>
    )
  }

  if (access.location.kind === 'platform' && !access.isPlatformAdmin) {
    return access.memberships.length > 0
      ? <SchoolSelector />
      : <NoSchoolAccess />
  }

  if (access.location.kind !== 'platform' && !access.active) {
    return <NoSchoolAccess />
  }

  return null
}

function TenantView({ tenant }: { tenant: TenantLocation }) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const auth = useAuth()
  const access = useTenantAccess()
  const accessScreen = <AccessScreen />

  const localPreview =
    !!supabase &&
    import.meta.env.DEV &&
    (tenant.host === 'localhost' || tenant.host === '127.0.0.1') &&
    tenant.kind !== 'platform'

  const root = (import.meta.env.VITE_PLATFORM_ROOT_DOMAIN ?? '')
    .toLowerCase()
    .replace(/\.$/, '')
  const previewHost = access.active
    ? access.active.primary_host ??
      (root ? `${access.active.slug}.${root}` : null)
    : null
  const brandingHost = localPreview ? previewHost : tenant.host
  const brandKey = `${tenant.kind}:${tenant.slug ?? ''}:${brandingHost ?? ''}`
  const [brandState, setBrandState] = useState<{
    key: string
    brand: TenantBranding | null
    failed: boolean
  } | null>(null)

  const useStaticBrand =
    !!supabase &&
    (tenant.kind === 'platform' || (localPreview && !brandingHost))
  const staticBrand = useMemo<TenantBranding | null>(() => {
    if (!useStaticBrand) return null
    if (localPreview && access.active) {
      return {
        ...platformBrand,
        name: access.active.name,
        logos: {
          mark: access.active.name.trim().charAt(0).toUpperCase(),
          alt: access.active.name,
        },
      }
    }
    return platformBrand
  }, [useStaticBrand, localPreview, access.active])

  useEffect(() => {
    if (!staticBrand) return
    applyBrand(staticBrand)
    void i18n.changeLanguage(staticBrand.language)
  }, [staticBrand, i18n])

  useEffect(() => {
    if (useStaticBrand) return
    let active = true

    brandingSource
      .getBranding({ ...tenant, host: brandingHost ?? tenant.host })
      .then((brand) => {
        if (!active) return
        setBrandState({ key: brandKey, brand, failed: false })
        if (brand) {
          applyBrand(brand)
          void i18n.changeLanguage(brand.language)
        } else {
          document.title = i18n.t('schoolNotFound')
        }
      })
      .catch(() => {
        if (active) {
          setBrandState({ key: brandKey, brand: null, failed: true })
        }
      })

    return () => {
      active = false
    }
  }, [useStaticBrand, brandKey, brandingHost, i18n, tenant])

  const returningToInvitation =
    location.pathname === '/iniciar-sesion' &&
    new URLSearchParams(location.search).has('from')

  const isResetPasswordPage = location.pathname === '/nueva-clave'

  if (
    supabase &&
    auth.status === 'authenticated' &&
    !returningToInvitation &&
    !isResetPasswordPage &&
    (access.status !== 'ready' ||
      (tenant.kind === 'platform' && !access.isPlatformAdmin) ||
      (tenant.kind !== 'platform' && !access.active))
  ) {
    return accessScreen
  }

  const brand =
    staticBrand ??
    (brandState?.key === brandKey ? brandState.brand : undefined)
  const failed = staticBrand ? false : (brandState?.failed ?? false)

  if (brand === undefined) {
    return <main className="p-8" role="status">{t('loading')}</main>
  }

  if (!brand) {
    return (
      <main className="mx-auto grid min-h-screen max-w-lg content-center p-5">
        <Card>
          <h1 className="mb-3 text-xl font-bold">
            {t(failed ? 'loadError' : 'schoolNotFound')}
          </h1>
          <p className="text-text-muted">
            {t('schoolNotFoundDescription')}
          </p>
        </Card>
      </main>
    )
  }

  return (
    <TenantContext.Provider value={brand}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/iniciar-sesion" element={<LoginPage />} />
        <Route path="/nueva-clave" element={<ResetPasswordPage />} />
        <Route path="/verificar" element={<VerifyCertificatePage />} />
        <Route path="/c/:code" element={<VerifyCertificatePage />} />
        {roles.map((role) => (
          <Route
            key={role}
            path={rolePath[role]}
            element={
              <RoleGuard allowed={role}>
                <RoleLayout role={role} />
              </RoleGuard>
            }
          >
            <Route
              index
              element={
                <Navigate
                  to={`${navigation[role][0]!.segment}${location.search}`}
                  replace
                />
              }
            />
            {navigation[role].map(({ key, segment }) => (
              <Route
                key={key}
                path={segment}
                element={
                  role === 'teacher' && key === 'courses'
                    ? <CoursesPage />
                    : role === 'teacher' && key === 'offerings'
                      ? <OfferingsPage />
                      : role === 'student' && key === 'home'
                        ? <StudentHomePage />
                        : role === 'student' && key === 'courses'
                          ? <StudentCoursesPage />
                          : role === 'student' && key === 'certificates'
                            ? <StudentCertificatesPage />
                            : (role === 'teacher' || role === 'admin') && key === 'certificates'
                              ? <SignersPage />
                              : role === 'admin' && key === 'clients'
                                ? <ClientsPage />
                                : role === 'teacher' && key === 'students'
                                  ? <GlobalStudentsPage />
                                  : role === 'teacher' && key === 'calendar'
                                    ? <GlobalCalendarPage />
                                    : role === 'teacher' && key === 'analytics'
                                      ? <GlobalAnalyticsPage />
                                      : <PlaceholderPage role={role} name={key} />
                }
              />
            ))}
            {role === 'teacher' && (
              <>
                <Route path="cursos/nuevo" element={<CreateCoursePage />} />
                <Route path="cursos/:courseId" element={<CourseBuilderPage />} />
                <Route path="ediciones/nueva" element={<CreateOfferingPage />} />
                <Route path="ediciones/:offeringId" element={<OfferingDetailPage />} />
              </>
            )}
            {role === 'student' && (
              <>
                <Route path="cursos/:offeringId" element={<StudentCoursePage />} />
                <Route path="cursos/:offeringId/lecciones/:lessonId"
                  element={<LessonPlayerPage />} />
              </>
            )}
          </Route>
        ))}
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
      <PwaNotice />
    </TenantContext.Provider>
  )
}

function TenantRoutes() {
  const location = useLocation()
  const tenant = useMemo(
    () =>
      resolveTenant(
        window.location.hostname,
        import.meta.env.VITE_PLATFORM_ROOT_DOMAIN ?? '',
        import.meta.env.DEV ? location.search : '',
      ),
    [location.search],
  )

  return (
    <TenantAccessProvider location={tenant}>
      <TenantView tenant={tenant} />
    </TenantAccessProvider>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/invitacion/:token" element={<InvitationPage />} />
              <Route path="/*" element={<TenantRoutes />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
