import { useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui'
import { useCreateInvitation, useOfferingInvitations, useRevokeInvitation } from './api'
import {
  offeringInvitationSchema,
  type OfferingInvitationValues,
} from './schemas'

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
}

export function InvitationPanel({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const tenant = new URLSearchParams(search).get('tenant')
  const tenantSearch = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const invitations = useOfferingInvitations(offeringId, true)
  const create = useCreateInvitation(offeringId)
  const revoke = useRevokeInvitation(offeringId)
  const [link, setLink] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const linkRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OfferingInvitationValues>({
    resolver: zodResolver(offeringInvitationSchema),
    defaultValues: { email: '' },
  })
  const email = watch('email').trim().toLowerCase()
  const replacesPending = invitations.data?.some((item) =>
    item.email.toLowerCase() === email &&
    item.accepted_at === null &&
    Date.parse(item.expires_at) > Date.now(),
  ) ?? false

  function errorText(cause: unknown) {
    const code = codeOf(cause)
    if (code === '42501') return t('invitations.noPermission')
    if (code === '23514') return t('invitations.invalidOperation')
    return t('invitations.genericError')
  }

  async function submit(values: OfferingInvitationValues) {
    if (busyRef.current) return
    busyRef.current = true
    setError('')
    setNotice('')
    setLink('')
    try {
      const created = await create.mutateAsync(values.email)
      setLink(`${window.location.origin}/invitacion/${created.token}${tenantSearch}`)
      reset()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      busyRef.current = false
    }
  }

  async function copyLink() {
    if (!link) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(link)
      setNotice(t('invitations.copied'))
    } catch {
      linkRef.current?.focus()
      linkRef.current?.select()
      setNotice(t('invitations.selectToCopy'))
    }
  }

  async function revokeInvitation(id: string) {
    if (!window.confirm(t('invitations.confirmRevoke'))) return
    setError('')
    setNotice('')
    try {
      await revoke.mutateAsync(id)
      setNotice(t('invitations.revoked'))
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  if (invitations.isError && codeOf(invitations.error) === '42501') return null

  return (
    <Card className="grid gap-4">
      <h2 className="text-lg font-bold">{t('invitations.teacherTitle')}</h2>
      <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3">
        <Input
          id="invitation-email"
          type="email"
          label={t('invitations.email')}
          autoComplete="email"
          error={errors.email?.message}
          disabled={create.isPending || isSubmitting}
          {...register('email')}
        />
        {replacesPending && (
          <p role="status" className="text-sm text-text-muted">
            {t('invitations.replacesPending')}
          </p>
        )}
        <Button type="submit" disabled={create.isPending || isSubmitting}>
          {t('invitations.generate')}
        </Button>
      </form>

      {link && (
        <div className="grid gap-2">
          <p role="status" className="font-semibold">
            {t('invitations.oneTime')}
          </p>
          <Input
            ref={linkRef}
            id="generated-invitation-link"
            label={t('invitations.link')}
            value={link}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button variant="secondary" onClick={() => void copyLink()}>
            {t('invitations.copy')}
          </Button>
        </div>
      )}

      {error && <p role="alert" aria-live="assertive" className="text-sm text-error">{error}</p>}
      {notice && <p role="status" aria-live="polite">{notice}</p>}

      <h3 className="font-semibold">{t('invitations.listTitle')}</h3>
      {invitations.isPending ? (
        <Skeleton className="h-20" />
      ) : invitations.isError ? (
        <div className="grid gap-2">
          <p role="alert">{errorText(invitations.error)}</p>
          <Button variant="secondary" onClick={() => void invitations.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : invitations.data.length === 0 ? (
        <p className="text-text-muted">{t('invitations.listEmpty')}</p>
      ) : (
        <ul className="grid gap-3">
          {invitations.data.map((item) => {
            const pending = item.accepted_at === null &&
              Date.parse(item.expires_at) > Date.now()
            const status = item.accepted_at
              ? 'accepted'
              : pending ? 'pending' : 'expired'
            return (
              <li key={item.id} className="grid gap-2 rounded-control border border-border p-3">
                <span className="break-all font-semibold">{item.email}</span>
                <Badge status={status === 'accepted' ? 'success' : status === 'expired'
                  ? 'neutral' : 'warning'}>
                  {t(`invitations.status.${status}`)}
                </Badge>
                <span className="text-sm text-text-muted">
                  {t('invitations.expiresAt', {
                    date: new Date(item.expires_at).toLocaleString('es-PE'),
                  })}
                </span>
                {pending && (
                  <Button
                    variant="destructive"
                    disabled={revoke.isPending}
                    onClick={() => void revokeInvitation(item.id)}
                  >
                    {t('invitations.revoke')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
