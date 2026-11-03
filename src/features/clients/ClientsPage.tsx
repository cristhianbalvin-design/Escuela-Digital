import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { useClients, useCreateClient, useUpdateClient, type ClientRow } from './clients-api'
import { clientNameSchema } from './clients-utils'

export function ClientsPage() {
  const { t } = useTranslation()
  const tenantId = useTenantAccess().active?.tenant_id
  const query = useClients(tenantId)
  const create = useCreateClient(tenantId ?? '')
  const update = useUpdateClient(tenantId ?? '')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  if (!supabase || !tenantId) return <EmptyState title={t('clients.connect')} />

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    const parsed = clientNameSchema.safeParse(name)
    if (!parsed.success) {
      setMessage(t('clients.nameRequired'))
      return
    }
    try {
      await create.mutateAsync(parsed.data)
      setName('')
      setMessage(t('clients.created'))
    } catch {
      setMessage(t('clients.createError'))
    }
  }

  async function change(input: { id: string; name?: string; status?: 'active' | 'inactive' }) {
    setMessage('')
    try {
      await update.mutateAsync(input)
      setMessage(t('clients.saved'))
    } catch {
      setMessage(t('clients.saveError'))
    }
  }

  return (
    <section className="grid gap-5">
      <h1 className="font-heading text-2xl font-bold">{t('clients.title')}</h1>
      <p className="text-sm text-text-muted">{t('clients.hint')}</p>
      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => void onCreate(event)}>
          <Input label={t('clients.name')} value={name} maxLength={120}
            onChange={(event) => setName(event.target.value)} />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('clients.creating') : t('clients.add')}
          </Button>
        </form>
      </Card>
      <span role="status" className="text-sm">{message}</span>
      {query.isPending ? <Skeleton className="h-24" /> : query.isError ? (
        <Card className="grid gap-3">
          <p role="alert">{t('clients.loadError')}</p>
          <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        </Card>
      ) : query.data.length === 0 ? (
        <EmptyState title={t('clients.empty')} />
      ) : (
        <div className="grid gap-3">
          {query.data.map((row) => (
            <ClientCard key={`${row.id}:${row.name}:${row.status}`} row={row}
              pending={update.isPending} onChange={(input) => void change(input)} />
          ))}
        </div>
      )}
    </section>
  )
}

function ClientCard({ row, pending, onChange }: {
  row: ClientRow
  pending: boolean
  onChange: (input: { id: string; name?: string; status?: 'active' | 'inactive' }) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(row.name)
  const parsed = clientNameSchema.safeParse(name)
  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">{row.slug}</p>
        <Badge status={row.status === 'active' ? 'success' : 'warning'}>
          {t(`clients.status.${row.status}`)}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Input label={t('clients.name')} value={name} maxLength={120}
          onChange={(event) => setName(event.target.value)} />
        <Button disabled={pending || !parsed.success || parsed.data === row.name}
          onClick={() => parsed.success && onChange({ id: row.id, name: parsed.data })}>
          {t('clients.save')}
        </Button>
        <Button variant="secondary" disabled={pending}
          onClick={() => onChange({
            id: row.id, status: row.status === 'active' ? 'inactive' : 'active',
          })}>
          {row.status === 'active' ? t('clients.deactivate') : t('clients.activate')}
        </Button>
      </div>
    </Card>
  )
}
