import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useTenant } from '@/app/TenantContext'
import { useTenantAccess } from '@/features/tenants'
import { readableError } from '@/features/courses/schemas'
import { supabase } from '@/lib/supabase'
import { useCreateOffering, useOfferingChoices } from './api'
import { offeringSchema, type OfferingValues } from './schemas'

const selectClass = 'min-h-11 rounded-control border border-border bg-surface px-3 focus-visible:outline-3'

export function CreateOfferingPage() {
  const { search } = useLocation()
  const { t } = useTranslation()
  const tenantId = useTenantAccess().active?.tenant_id
  const brand = useTenant()
  const choices = useOfferingChoices(tenantId)
  const mutation = useCreateOffering(tenantId)
  const navigate = useNavigate()
  const form = useForm<OfferingValues>({
    resolver: zodResolver(offeringSchema),
    defaultValues: {
      versionId: '', clientId: '', title: '', code: '',
      modality: 'self_paced', startsAt: '', endsAt: '',
      seats: '', enrollmentMode: 'invite', timezone: brand.timeZone,
    },
  })

  if (!supabase || !tenantId) return <EmptyState title={t('teacherCommon.connect')} />
  if (choices.isPending) return <Skeleton className="h-64" />
  if (choices.isError) {
    return (
      <Card>
        <p role="alert">{readableError(choices.error)}</p>
        <Button onClick={() => void choices.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }

  async function submit(values: OfferingValues) {
    const id = await mutation.mutateAsync(values)
    navigate({ pathname: `/docente/ediciones/${id}`, search })
  }

  return (
    <section className="mx-auto grid max-w-2xl gap-5">
      <Link to={{ pathname: '/docente/ediciones', search }} className="min-h-11 text-brand underline">
        {t('teacherCommon.back')}
      </Link>
      <h1 className="font-heading text-2xl font-bold">{t('teacherOfferings.create')}</h1>
      {choices.data.clients.length === 0 ? (
        <EmptyState title={t('teacherOfferings.noClients')} />
      ) : choices.data.versions.length === 0 ? (
        <EmptyState title={t('teacherOfferings.noPublished')} />
      ) : (
        <Card>
          <form noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
            <label htmlFor="offering-version" className="text-sm font-semibold">
              {t('teacherOfferings.version')}
            </label>
            <select id="offering-version" className={selectClass}
              aria-invalid={!!form.formState.errors.versionId}
              {...form.register('versionId')}>
              <option value="">{t('teacherCommon.choose')}</option>
              {choices.data.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.title} · v{version.version_number}
                </option>
              ))}
            </select>
            {form.formState.errors.versionId && (
              <p role="alert" className="text-error">
                {form.formState.errors.versionId.message}
              </p>
            )}
            <label htmlFor="offering-client" className="text-sm font-semibold">
              {t('client')}
            </label>
            <select id="offering-client" className={selectClass}
              aria-invalid={!!form.formState.errors.clientId}
              {...form.register('clientId')}>
              <option value="">{t('teacherCommon.choose')}</option>
              {choices.data.clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
            {form.formState.errors.clientId && (
              <p role="alert" className="text-error">
                {form.formState.errors.clientId.message}
              </p>
            )}
            <Input label={t('teacherOfferings.offeringTitle')}
              error={form.formState.errors.title?.message}
              {...form.register('title')} />
            <Input label={t('teacherOfferings.code')}
              error={form.formState.errors.code?.message}
              {...form.register('code')} />
            <label htmlFor="offering-modality" className="text-sm font-semibold">
              {t('teacherOfferings.modality')}
            </label>
            <select id="offering-modality" className={selectClass}
              {...form.register('modality')}>
              <option value="self_paced">{t('teacherOfferings.selfPaced')}</option>
              <option value="live">{t('teacherOfferings.live')}</option>
              <option value="hybrid">{t('teacherOfferings.hybrid')}</option>
            </select>
            <Input type="datetime-local" label={t('teacherOfferings.startsAt')}
              {...form.register('startsAt')} />
            <Input type="datetime-local" label={t('teacherOfferings.endsAt')}
              error={form.formState.errors.endsAt?.message}
              {...form.register('endsAt')} />
            <Input type="number" min={1} label={t('teacherOfferings.seats')}
              error={form.formState.errors.seats?.message}
              {...form.register('seats')} />
            <label htmlFor="offering-enrollment" className="text-sm font-semibold">
              {t('teacherOfferings.enrollmentMode')}
            </label>
            <select id="offering-enrollment" className={selectClass}
              {...form.register('enrollmentMode')}>
              <option value="invite">{t('teacherOfferings.invite')}</option>
              <option value="code">{t('teacherOfferings.byCode')}</option>
              <option value="csv">CSV</option>
            </select>
            <Input label={t('teacherOfferings.timezone')}
              error={form.formState.errors.timezone?.message}
              {...form.register('timezone')} />
            {mutation.isError && (
              <p role="alert" className="text-error">{readableError(mutation.error)}</p>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {t('teacherOfferings.create')}
            </Button>
          </form>
        </Card>
      )}
    </section>
  )
}
