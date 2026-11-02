import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from '@/components/ui'
import { todayIso } from './attendance-utils'

function Overlay({ labelId, children }: { labelId: string; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={labelId}
      className="fixed inset-0 z-40 overflow-y-auto bg-black/40 p-4">
      <Card className="mx-auto grid max-w-lg gap-4">{children}</Card>
    </div>
  )
}

export function SessionFormDialog({
  initial, pending, error, onClose, onSubmit,
}: {
  initial: { title: string; date: string } | null
  pending: boolean
  error: string
  onClose: () => void
  onSubmit: (values: { title: string; date: string }) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? todayIso())
  const [touched, setTouched] = useState(false)
  const titleError = touched && (title.trim().length < 1 || title.trim().length > 120)
  const dateError = touched && !date

  return (
    <Overlay labelId="attendance-form-title">
      <h2 id="attendance-form-title" className="text-xl font-bold">
        {t(initial ? 'attendance.editTitle' : 'attendance.createTitle')}
      </h2>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (title.trim().length >= 1 && title.trim().length <= 120 && date) {
          onSubmit({ title: title.trim(), date })
        }
      }}>
        <Input id="attendance-title" label={t('attendance.sessionTitle')} autoFocus
          maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)}
          error={titleError ? t('attendance.errors.title') : undefined} />
        <Input id="attendance-date" type="date" label={t('attendance.date')}
          value={date} onChange={(event) => setDate(event.target.value)}
          error={dateError ? t('attendance.errors.date') : undefined} />
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t('attendance.saving') : t('attendance.save')}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t('attendance.cancel')}
          </Button>
        </div>
      </form>
    </Overlay>
  )
}

export function ReasonDialog({
  title, description, pending, error, onClose, onSubmit,
}: {
  title: string
  description: string
  pending: boolean
  error: string
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = touched && reason.trim().length < 3

  return (
    <Overlay labelId="attendance-reason-title">
      <h2 id="attendance-reason-title" className="text-xl font-bold">{title}</h2>
      <p>{description}</p>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (reason.trim().length >= 3) onSubmit(reason.trim())
      }}>
        <div className="grid gap-1.5">
          <label htmlFor="attendance-reason" className="text-sm font-semibold">
            {t('attendance.reason')}
          </label>
          <textarea id="attendance-reason" autoFocus maxLength={500} value={reason}
            aria-invalid={invalid}
            className="min-h-24 rounded-control border border-border bg-surface p-3"
            onChange={(event) => setReason(event.target.value)} />
          {invalid && <p role="alert" className="text-sm text-error">{t('attendance.errors.reason')}</p>}
        </div>
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t('attendance.saving') : t('attendance.reopen')}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {t('attendance.cancel')}
          </Button>
        </div>
      </form>
    </Overlay>
  )
}

export function ConfirmDialog({
  title, description, confirmLabel, destructive, pending, error, onClose, onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Overlay labelId="attendance-confirm-title">
      <h2 id="attendance-confirm-title" className="text-xl font-bold">{title}</h2>
      <p>{description}</p>
      {error && <p role="alert" className="text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant={destructive ? 'destructive' : 'primary'} disabled={pending}
          onClick={onConfirm}>
          {pending ? t('attendance.saving') : confirmLabel}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {t('attendance.cancel')}
        </Button>
      </div>
    </Overlay>
  )
}
