import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Card, Input } from '@/components/ui'
import { useTenant } from '@/app/TenantContext'
import { ThemeToggle } from '@/app/ThemeToggle'
import { useAuth } from './AuthProvider'

const loginSchema = z.object({
  email: z.email('Ingresa un correo válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

type LoginValues = z.infer<typeof loginSchema>

function invitationReturn(search: string): string | null {
  const raw = new URLSearchParams(search).get('from')
  if (!raw) return null
  try {
    const url = new URL(raw, window.location.origin)
    if (
      url.origin !== window.location.origin ||
      !/^\/invitacion\/[^/]+$/.test(url.pathname)
    ) return null
    const tenant = url.searchParams.get('tenant')
    return `${url.pathname}${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`
  } catch {
    return null
  }
}

export function LoginPage() {
  const { t } = useTranslation()
  const brand = useTenant()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [magicPending, setMagicPending] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const returnTo = invitationReturn(location.search)

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    if (auth.status === 'authenticated') {
      navigate(returnTo ?? `/${location.search}`, { replace: true })
    }
  }, [auth.status, returnTo, location.search, navigate])

  async function submitPassword(values: LoginValues) {
    setError('')
    setNotice('')
    try {
      await auth.signInWithPassword(values.email, values.password)
    } catch {
      setError(t('login.passwordError'))
    }
  }

  async function submitMagicLink() {
    setError('')
    setNotice('')
    if (!(await trigger('email'))) return

    setMagicPending(true)
    try {
      await auth.signInWithMagicLink(getValues('email'), returnTo ?? '/')
      setNotice(t('login.magicNotice'))
    } catch {
      setError(t('login.magicError'))
    } finally {
      setMagicPending(false)
    }
  }

  async function submitPasswordReset() {
    setError('')
    setNotice('')
    if (!(await trigger('email'))) return

    setResetPending(true)
    try {
      await auth.sendPasswordReset(getValues('email'))
      setNotice(t('login.resetNotice'))
    } catch {
      setError(t('login.magicError'))
    } finally {
      setResetPending(false)
    }
  }

  const pending = isSubmitting || magicPending || resetPending

  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-6 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {brand.logos.lightUrl ? (
            <img
              src={brand.logos.lightUrl}
              alt={brand.logos.alt}
              className="h-11 max-w-32 object-contain"
            />
          ) : (
            <span
              role="img"
              aria-label={brand.logos.alt}
              className="flex h-11 w-11 items-center justify-center rounded-control bg-brand font-bold text-brand-on"
            >
              {brand.logos.mark}
            </span>
          )}
          <span className="font-heading font-bold">{brand.name}</span>
        </div>
        <ThemeToggle />
      </div>

      <Card>
        <h1 className="mb-2 text-xl font-bold">{t('signIn')}</h1>
        <p className="mb-6 text-text-muted">
          {t('login.description', { school: brand.name })}
        </p>

        {!auth.configured && (
          <p role="status" className="mb-4 text-sm text-text-muted">
            {t('login.notConfigured')}
          </p>
        )}

        <form
          noValidate
          onSubmit={handleSubmit(submitPassword)}
          className="grid gap-4"
        >
          <Input
            id="login-email"
            type="email"
            label={t('login.email')}
            autoComplete="email"
            error={errors.email?.message}
            disabled={pending || !auth.configured}
            {...register('email')}
          />
          <Input
            id="login-password"
            type="password"
            label={t('login.password')}
            autoComplete="current-password"
            error={errors.password?.message}
            disabled={pending || !auth.configured}
            {...register('password')}
          />

          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-text-muted">
              {notice}
            </p>
          )}

          <Button type="submit" disabled={pending || !auth.configured}>
            {isSubmitting ? t('login.signingIn') : t('signIn')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !auth.configured}
            onClick={() => void submitMagicLink()}
          >
            {magicPending ? t('login.sending') : t('login.sendLink')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !auth.configured}
            onClick={() => void submitPasswordReset()}
          >
            {t('login.forgot')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
