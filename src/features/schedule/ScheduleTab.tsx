import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import {
  useCreateAttendanceFromSchedule, useSaveSchedule, useSchedule,
} from './schedule-api'
import {
  applyPlan, draftsToItems, groupByModule, inferPlan, invalidTimes, rowsToDrafts,
  type SchedulePlan, type ScheduleDraft, type ScheduleRow,
} from './schedule-utils'

const fieldClass =
  'min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 focus-visible:outline-3'
// Orden de la semana para mostrar: lunes primero (valor = día JS, 0 = domingo).
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const

export function ScheduleTab({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const query = useSchedule(offeringId)
  if (query.isPending) return <Skeleton className="h-48" />
  if (query.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('schedule.loadError')}</p>
        <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </Card>
    )
  }
  if (query.data.length === 0) {
    return <EmptyState title={t('schedule.empty')} description={t('schedule.emptyHint')} />
  }
  return (
    <ScheduleEditor key={JSON.stringify(query.data)} offeringId={offeringId}
      rows={query.data} />
  )
}

function ScheduleEditor({ offeringId, rows }: { offeringId: string; rows: ScheduleRow[] }) {
  const { t } = useTranslation()
  const initial = rowsToDrafts(rows)
  const [drafts, setDrafts] = useState<ScheduleDraft[]>(initial)
  const [plan, setPlan] = useState<SchedulePlan>(() => inferPlan(initial))
  const [message, setMessage] = useState('')
  const save = useSaveSchedule(offeringId)
  const createCalls = useCreateAttendanceFromSchedule(offeringId)

  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial)
  const badTimes = invalidTimes(drafts)
  const scheduled = drafts.filter((draft) => draft.date !== '').length
  const linked = new Map(rows.map((row) => [row.lesson_id, row.attendance_session_id]))
  const draftOf = new Map(drafts.map((draft) => [draft.lesson_id, draft]))

  function patch(lessonId: string, change: Partial<ScheduleDraft>) {
    setMessage('')
    setDrafts((current) => current.map((draft) =>
      draft.lesson_id === lessonId ? { ...draft, ...change } : draft))
  }

  // Cada cambio del plan (inicio, días u horario) rellena de inmediato todas las sesiones.
  function changePlan(change: Partial<SchedulePlan>) {
    const next = { ...plan, ...change }
    setPlan(next)
    setMessage('')
    setDrafts((current) => applyPlan(current, next))
  }

  function toggleDay(day: number) {
    changePlan({
      weekdays: plan.weekdays.includes(day)
        ? plan.weekdays.filter((value) => value !== day)
        : [...plan.weekdays, day],
    })
  }

  async function onSave() {
    setMessage('')
    try {
      await save.mutateAsync(draftsToItems(drafts))
      setMessage(t('schedule.saved'))
    } catch {
      setMessage(t('schedule.saveError'))
    }
  }

  async function onCreateCalls() {
    setMessage('')
    try {
      const count = await createCalls.mutateAsync()
      setMessage(t('schedule.callsCreated', { count }))
    } catch {
      setMessage(t('schedule.callsError'))
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <h2 className="text-xl font-bold">{t('schedule.suggestTitle')}</h2>
        <p className="text-sm text-text-muted">{t('schedule.suggestHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            {t('schedule.startDate')}
            <input type="date" className={fieldClass} value={plan.startIso}
              onChange={(event) => changePlan({ startIso: event.target.value })} />
          </label>
          <fieldset className="grid gap-1">
            <legend className="text-sm font-semibold">{t('schedule.classDays')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label key={day}
                  className="flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-sm">
                  <input type="checkbox" className="size-4 accent-brand"
                    checked={plan.weekdays.includes(day)} onChange={() => toggleDay(day)} />
                  {t(`schedule.weekday.${day}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            {t('schedule.classStart')}
            <input type="time" className={fieldClass} value={plan.start}
              onChange={(event) => changePlan({ start: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t('schedule.classEnd')}
            <input type="time" className={fieldClass} value={plan.end}
              onChange={(event) => changePlan({ end: event.target.value })} />
          </label>
        </div>
        <p className="text-sm text-text-muted">{t('schedule.autoNote')}</p>
      </Card>

      {groupByModule(rows).map((group) => (
        <Card key={group.module} className="grid gap-3">
          <h3 className="text-lg font-bold">{group.module}</h3>
          {group.rows.map((row) => {
            const draft = draftOf.get(row.lesson_id)
            if (!draft) return null
            return (
              <div key={row.lesson_id}
                className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <div className="grid gap-1">
                  <p className="font-semibold">{row.lesson_title}</p>
                  {linked.get(row.lesson_id) && (
                    <Badge>{t('schedule.callCreated')}</Badge>
                  )}
                </div>
                <label className="grid gap-1 text-sm">
                  {t('schedule.date')}
                  <input type="date" className={fieldClass} value={draft.date}
                    onChange={(event) => patch(row.lesson_id, { date: event.target.value })} />
                </label>
                <label className="grid gap-1 text-sm">
                  {t('schedule.start')}
                  <input type="time" className={fieldClass} value={draft.start}
                    disabled={draft.date === ''}
                    onChange={(event) => patch(row.lesson_id, { start: event.target.value })} />
                </label>
                <label className="grid gap-1 text-sm">
                  {t('schedule.end')}
                  <input type="time" className={fieldClass} value={draft.end}
                    disabled={draft.date === ''}
                    onChange={(event) => patch(row.lesson_id, { end: event.target.value })} />
                </label>
              </div>
            )
          })}
        </Card>
      ))}

      {badTimes && <p role="alert" className="text-error">{t('schedule.badTimes')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!dirty || badTimes || save.isPending} onClick={() => void onSave()}>
          {save.isPending ? t('schedule.saving') : t('schedule.save')}
        </Button>
        <Button variant="secondary"
          disabled={dirty || scheduled === 0 || createCalls.isPending}
          onClick={() => void onCreateCalls()}>
          {t('schedule.createCalls')}
        </Button>
        <span role="status" className="text-sm">{message}</span>
      </div>
      {dirty && <p className="text-sm text-text-muted">{t('schedule.saveFirst')}</p>}
    </div>
  )
}
