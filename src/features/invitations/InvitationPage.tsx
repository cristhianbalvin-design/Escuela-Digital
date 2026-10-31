import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Input, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { supabase } from '@/lib/supabase'
import {
  acceptInvitation,
  createAccountFromInvitation,
  invitationEdgeErrorKey,
  invitationRpcErrorKey,
  useInvitationPreview,
} from './api'
import { invitationSignupSchema, type InvitationSignupValues } from './schemas'

export function InvitationPage() {
  const { t } = useTranslation()
  const { token } = useParams()
  const { search } = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const preview = useInvitationPreview(token)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [accountExists, setAccountExists] = useState(false)
  const busyRef = useRef(false)
  const tenant = new URLSearchParams(search).get('tenant')
  const tenantSearch = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const invitationPath = `/invitacion/${encodeURIComponent(token ?? '')}${tenantSearch}`
  const loginParams = new URLSearchParams()
  if (tenant) loginParams.set('tenant', tenant)
  loginParams.set('from', invitationPath)
  const returnLogin = `/iniciar-sesion?${loginParams.toString()}`
  const plainLogin = `/iniciar-sesion${tenantSearch}`
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvitationSignupValues>({
    resolver: zodResolver(invitationSignupSchema),
    defaultValues: { fullName: '', password: '', confirmPassword: '' },
  })

  async function complete(values?: InvitationSignupValues) {
    if (busyRef.current || !token || preview.data?.status !== 'valid') return
    busyRef.current = true
    setPending(true)
    setError('')
    setAccountExists(false)
    try {
      if (values) {
        try {
          await createAccountFromInvitation(token, values.password, values.fullName.trim())
        } catch (cause) {
          const key = await invitationEdgeErrorKey(cause)
          if (key === 'invitations.accountExists') setAccountExists(true)
          setError(t(key))
          return
        }
        try {
          await auth.signInWithPassword(preview.data.email, values.password)
        } catch {
          setError(t('invitations.signInFailed'))
          return
        }
      }
      await acceptInvitation(token)
      navigate(`/estudiante/cursos${tenantSearch}`, { replace: true })
    } catch (cause) {
      setError(t(invitationRpcErrorKey(cause)))
    } finally {
      busyRef.current = false
      setPending(false)
    }
  }

  async function signOut() {
    if (busyRef.current) return
    busyRef.current = true
    setPending(true)
    setError('')
    try {
      await auth.signOut()
    } catch {
      setError(t('invitations.signOutFailed'))
    } finally {
      busyRef.current = false
      setPending(false)
    }
  }

  if (!supabase) {
    return (
      <main className="mx-auto grid min-h-screen max-w-lg content-center p-5">
        <Card><p role="alert">{t('invitations.notConfigured')}</p></Card>
      </main>
    )
  }

  const loading = preview.isPending || auth.status === 'loading'
  const status = preview.data?.status
  const invalidState = preview.isError || !token || status === 'invalid' ||
    status === 'used' || status === 'expired'
  const invitedEmail = status && status !== 'invalid' ? (preview.data?.email ?? '') : ''
  const sameEmail = auth.user?.email?.toLowerCase() === invitedEmail.toLowerCase()

  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center p-5">
      <Card className="grid gap-5">
        <h1 className="font-heading text-2xl font-bold">
          {t('invitations.publicTitle')}
        </h1>
        {loading ? (
          <div role="status" aria-label={t('invitations.loading')}>
            <Skeleton className="h-24" />
          </div>
        ) : invalidState ? (
          <>
            <p role="alert">
              {t(preview.isError ? 'invitations.previewError'
                : status === 'used' ? 'invitations.used'
                  : status === 'expired' ? 'invitations.expired'
                    : 'invitations.invalid')}
            </p>
            <Link to={plainLogin}
              className="inline-flex min-h-11 w-fit items-center text-brand underline">
              {t('signIn')}
            </Link>
          </>
        ) : status === 'valid' ? (
          <>
            <p>{t('invitations.invitedTo', {
              offering: preview.data.offering_title ?? t('invitations.untitledOffering'),
              school: preview.data.tenant_name,
            })}</p>
            <Input
              id="invited-email"
              type="email"
              label={t('invitations.email')}
              value={preview.data.email}
              readOnly
            />
            {auth.status === 'anonymous' ? (
              <form noValidate onSubmit={(event) => { void handleSubmit((values) => complete(values))(event) }}
                className="grid gap-4">
                <Input
                  id="invitation-name"
                  label={t('invitations.fullName')}
                  autoComplete="name"
                  error={errors.fullName?.message}
                  disabled={pending}
                  {...register('fullName')}
                />
                <Input
                  id="invitation-password"
                  type="password"
                  label={t('invitations.password')}
                  autoComplete="new-password"
                  error={errors.password?.message}
                  disabled={pending}
                  {...register('password')}
                />
                <Input
                  id="invitation-confirm-password"
                  type="password"
                  label={t('invitations.confirmPassword')}
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  disabled={pending}
                  {...register('confirmPassword')}
                />
                <Button type="submit" disabled={pending}>
                  {pending ? t('invitations.processing') : t('invitations.createAndAccept')}
                </Button>
              </form>
            ) : sameEmail ? (
              <Button disabled={pending} onClick={() => void complete()}>
                {pending ? t('invitations.processing') : t('invitations.accept')}
              </Button>
            ) : (
              <div className="grid gap-3">
                <p>{t('invitations.otherEmail', { email: preview.data.email })}</p>
                <Button variant="secondary" disabled={pending}
                  onClick={() => void signOut()}>
                  {t('invitations.signOut')}
                </Button>
              </div>
            )}
            {error && (
              <div aria-live="assertive" className="grid gap-2">
                <p role="alert" className="text-sm text-error">{error}</p>
                {accountExists && (
                  <Link to={returnLogin}
                    className="inline-flex min-h-11 w-fit items-center text-brand underline">
                    {t('signIn')}
                  </Link>
                )}
              </div>
            )}
          </>
        ) : null}
      </Card>
    </main>
  )
}
