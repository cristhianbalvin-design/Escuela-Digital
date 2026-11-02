import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Skeleton } from '@/components/ui'
import { useOfferingDimensions, useSaveDimensions } from './dimensions-api'
import {
  MAX_DIMENSIONS, parseWeight, toRows, totalWeight, validateRows,
  type DimensionRow,
} from './dimensions-utils'

function signature(rows: DimensionRow[]): string {
  return JSON.stringify(rows.map((row) => [row.id, row.name.trim(), row.weight.trim(), row.kind]))
}

export function DimensionsCard({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const query = useOfferingDimensions(offeringId)
  const save = useSaveDimensions(offeringId)
  const [draft, setDraft] = useState<DimensionRow[] | null>(null)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')

  if (query.isPending) return <Card role="status"><Skeleton className="h-32" /></Card>
  if (query.isError) return <Card><p role="alert">{query.error.message}</p></Card>

  const saved = toRows(query.data)
  const rows = draft ?? saved
  const total = totalWeight(rows)
  const problem = validateRows(rows)
  const changed = draft !== null && signature(draft) !== signature(saved)
  const hasAttendance = rows.some((row) => row.kind === 'attendance')
  const lost = saved.filter((row) => row.scored > 0 && !rows.some((r) => r.id === row.id))

  function update(next: DimensionRow[]) {
    setError('')
    setDraft(next)
  }
  function patch(key: string, values: Partial<DimensionRow>) {
    update(rows.map((row) => (row.key === key ? { ...row, ...values } : row)))
  }
  function add(kind: 'manual' | 'attendance') {
    update([...rows, {
      key: crypto.randomUUID(), id: null, kind, scored: 0,
      name: kind === 'attendance' ? t('dimensions.attendanceName') : '', weight: '',
    }])
  }
  async function submit() {
    setTouched(true)
    if (problem) return
    setError('')
    try {
      await save.mutateAsync(rows)
      setDraft(null)
      setTouched(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('dimensions.saveError'))
    }
  }

  const remaining = Math.round((100 - total) * 100) / 100
  const status = total === 100 ? t('dimensions.totalOk')
    : total < 100 ? t('dimensions.totalMissing', { value: remaining })
    : t('dimensions.totalOver', { value: -remaining })

  return (
    <Card className="grid gap-4">
      <div>
        <h3 className="text-lg font-bold">{t('dimensions.title')}</h3>
        <p className="text-sm text-text-muted">{t('dimensions.hint')}</p>
      </div>
      {rows.length === 0 && <p>{t('dimensions.empty')}</p>}
      <ul className="grid gap-3">
        {rows.map((row, index) => (
          <li key={row.key} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <Input id={`dim-name-${row.key}`} label={t('dimensions.name')} value={row.name}
              maxLength={80} onChange={(event) => patch(row.key, { name: event.target.value })}
              error={touched && (row.name.trim().length < 1) ? t('dimensions.nameError') : undefined} />
            <Input id={`dim-weight-${row.key}`} label={t('dimensions.weight')} type="text"
              inputMode="decimal" value={row.weight}
              onChange={(event) => patch(row.key, { weight: event.target.value })}
              error={touched && (() => { const w = parseWeight(row.weight); return w === null || w <= 0 || w > 100 })()
                ? t('dimensions.weightError') : undefined} />
            <Button variant="ghost" aria-label={t('dimensions.remove', { name: row.name || index + 1 })}
              onClick={() => update(rows.filter((r) => r.key !== row.key))}>
              {t('dimensions.removeShort')}
            </Button>
            {row.kind === 'attendance' && (
              <p className="text-sm text-text-muted sm:col-span-3">{t('dimensions.attendanceHint')}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={rows.length >= MAX_DIMENSIONS} onClick={() => add('manual')}>
          {t('dimensions.add')}
        </Button>
        <Button variant="secondary" disabled={hasAttendance || rows.length >= MAX_DIMENSIONS}
          onClick={() => add('attendance')}>
          {t('dimensions.addAttendance')}
        </Button>
      </div>
      <p aria-live="polite" className={total === 100 ? 'font-semibold text-green-700' : 'font-semibold text-amber-700'}>
        {t('dimensions.total', { value: total })} · {status}
      </p>
      {lost.length > 0 && <p role="alert">{t('dimensions.lostScores')}</p>}
      {touched && problem === 'over' && <p role="alert">{t('dimensions.overError')}</p>}
      {error && <p role="alert">{error}</p>}
      {save.isSuccess && !changed && <p>{t('dimensions.saved')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!changed || save.isPending} onClick={() => void submit()}>
          {save.isPending ? t('dimensions.saving') : t('dimensions.save')}
        </Button>
        {changed && (
          <Button variant="secondary" disabled={save.isPending} onClick={() => { setDraft(null); setTouched(false); setError('') }}>
            {t('dimensions.discard')}
          </Button>
        )}
      </div>
    </Card>
  )
}
