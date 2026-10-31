import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Card, Input } from '@/components/ui'
import { useTenant } from '@/app/TenantContext'
import { ThemeToggle } from '@/app/ThemeToggle'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const brand = useTenant()
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  async function submit(values: ResetPasswordValues) {
    setError('')
    try {
      if (!supabase) throw new Error('Supabase no está configurado')
      const { error: updateError } = await supabase.auth.updateUser({
        password: values.password,
      })
      if (updateError) throw updateError
      setSucceeded(true)
    } catch (caught) {
      const code = (caught as { code?: string } | null)?.code
      const known = ['same_password', 'weak_password', 'reauthentication_needed']
      setError(
        code && known.includes(code)
          ? t(`resetPassword.errors.${code}`)
          : t('resetPassword.error'),
      )
    }
  }

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
        <h1 className="mb-2 text-xl font-bold">{t('resetPassword.title')}</h1>
        <p className="mb-6 text-text-muted">{t('resetPassword.description')}</p>

        {auth.status === 'loading' ? (
          <p role="status" className="text-sm text-text-muted">
            {t('loading')}
          </p>
        ) : auth.status === 'anonymous' ? (
          <div className="grid gap-4">
            <p className="text-sm text-text-muted">{t('resetPassword.invalidLink')}</p>
            <Button
              type="button"
              onClick={() => navigate(`/iniciar-sesion${location.search}`)}
            >
              {t('resetPassword.backToLogin')}
            </Button>
          </div>
        ) : succeeded ? (
          <div className="grid gap-4">
            <p role="status" className="text-sm text-text-muted">
              {t('resetPassword.success')}
            </p>
            <Button
              type="button"
              onClick={() => navigate(`/${location.search}`, { replace: true })}
            >
              {t('resetPassword.continue')}
            </Button>
          </div>
        ) : (
          <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-4">
            <Input
              id="reset-password"
              type="password"
              label={t('resetPassword.newPassword')}
              autoComplete="new-password"
              error={errors.password?.message}
              disabled={isSubmitting}
              {...register('password')}
            />
            <Input
              id="reset-confirm"
              type="password"
              label={t('resetPassword.confirm')}
              autoComplete="new-password"
              error={errors.confirm?.message}
              disabled={isSubmitting}
              {...register('confirm')}
            />
            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('resetPassword.saving') : t('resetPassword.save')}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}
