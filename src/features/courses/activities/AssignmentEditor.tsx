import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import {
  isoToLocalInput, useDeleteActivity, useSaveAssignment, useSaveRubric,
  type ActivitiesData, type ActivityRubric,
} from './authoring-api'
import { RubricEditor, emptyRubric } from './RubricEditor'
import { assignmentSchema, type AssignmentValues } from './schemas'
import { FieldError, MutationError, areaClass, controlClass } from './shared'

const emptyAssignment: AssignmentValues = {
  title: '', instructions: '', rubric_id: '', submission_types: ['text'],
  due_at: '', allow_late: false, late_penalty_pct: 0, max_score: 20,
}

function AssignmentForm({ initial, rubrics, editable, pending, error, onSubmit }: {
  initial: AssignmentValues
  rubrics: ActivityRubric[]
  editable: boolean
  pending: boolean
  error: unknown
  onSubmit: (values: AssignmentValues) => void
}) {
  const { t } = useTranslation()
  const { register, handleSubmit, formState: { errors } } = useForm<AssignmentValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: initial,
  })
  return (
    <form className="grid gap-3" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
      <Input id="asg-title" label={t('activitiesAuthoring.assignmentTitle')} disabled={!editable}
        error={errors.title?.message} {...register('title')} />
      <div className="grid gap-1.5">
        <label htmlFor="asg-instr" className="text-sm font-semibold">
          {t('activitiesAuthoring.instructions')}
        </label>
        <textarea id="asg-instr" className={areaClass} disabled={!editable}
          {...register('instructions')} />
      </div>
      <fieldset className="grid gap-1">
        <legend className="text-sm font-semibold">{t('activitiesAuthoring.submissionTypes')}</legend>
        <div className="flex flex-wrap gap-4">
          {(['text', 'link', 'file'] as const).map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" value={type} disabled={!editable}
                {...register('submission_types')} />
              {t(`activitiesAuthoring.${type}`)}
            </label>
          ))}
        </div>
        <FieldError message={errors.submission_types?.message} />
      </fieldset>
      <div className="grid gap-3 lg:grid-cols-3">
        <Input id="asg-due" type="datetime-local" label={t('activitiesAuthoring.dueAt')}
          disabled={!editable} {...register('due_at')} />
        <Input id="asg-max" type="number" step="any" label={t('activitiesAuthoring.maxScore')}
          disabled={!editable} error={errors.max_score?.message}
          {...register('max_score', { valueAsNumber: true })} />
        <Input id="asg-pen" type="number" step="any" label={t('activitiesAuthoring.latePenalty')}
          disabled={!editable} error={errors.late_penalty_pct?.message}
          {...register('late_penalty_pct', { valueAsNumber: true })} />
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" disabled={!editable} {...register('allow_late')} />
        {t('activitiesAuthoring.allowLate')}
      </label>
      <div className="grid gap-1.5">
        <label htmlFor="asg-rubric" className="text-sm font-semibold">
          {t('activitiesAuthoring.rubric')}
        </label>
        <select id="asg-rubric" className={controlClass} disabled={!editable}
          {...register('rubric_id')}>
          <option value="">{t('activitiesAuthoring.noRubric')}</option>
          {rubrics.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </div>
      <MutationError error={error} />
      {editable && (
        <Button type="submit" className="w-fit" disabled={pending}>
          {t('activitiesAuthoring.saveAssignment')}
        </Button>
      )}
    </form>
  )
}

export function AssignmentEditor({ tenantId, versionId, data, editable }: {
  tenantId: string
  versionId: string
  data: ActivitiesData
  editable: boolean
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const [rubric, setRubric] = useState<string | 'new' | null>(null)
  const save = useSaveAssignment(tenantId, versionId)
  const remove = useDeleteActivity(versionId, 'assignments')
  const saveRubric = useSaveRubric(tenantId, versionId)
  const removeRubric = useDeleteActivity(versionId, 'rubrics')
  const assignment = data.assignments.find((a) => a.id === selected)
  const editingRubric = data.rubrics.find((r) => r.id === rubric)

  return (
    <section className="grid gap-4" aria-label={t('activitiesAuthoring.assignments')}>
      <h3 className="text-lg font-bold">{t('activitiesAuthoring.assignments')}</h3>
      {data.assignments.length === 0 && (
        <p className="text-sm text-text-muted">{t('activitiesAuthoring.noAssignments')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.assignments.map((a) => (
          <Button key={a.id} variant={a.id === selected ? 'primary' : 'secondary'}
            onClick={() => { save.reset(); setSelected(a.id) }}>{a.title}</Button>
        ))}
        {editable && (
          <Button variant="ghost" onClick={() => { save.reset(); setSelected('new') }}>
            {t('activitiesAuthoring.newAssignment')}
          </Button>
        )}
      </div>
      {(selected === 'new' || assignment) && (
        <div className="grid gap-3 rounded-card border border-border p-4">
          <AssignmentForm key={assignment?.id ?? 'new'}
            initial={assignment ? {
              title: assignment.title, instructions: assignment.instructions,
              rubric_id: assignment.rubric_id ?? '',
              submission_types: assignment.submission_types.filter(
                (x): x is 'text' | 'link' | 'file' => x === 'text' || x === 'link' || x === 'file'),
              due_at: isoToLocalInput(assignment.due_at), allow_late: assignment.allow_late,
              late_penalty_pct: assignment.late_penalty_pct, max_score: assignment.max_score,
            } : emptyAssignment}
            rubrics={data.rubrics} editable={editable} pending={save.isPending} error={save.error}
            onSubmit={(values) => void save.mutateAsync({ id: assignment?.id, values })
              .then(() => { if (!assignment) setSelected(null) }).catch(() => undefined)} />
          {assignment && editable && (
            <>
              <Button variant="destructive" className="w-fit" disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t('activitiesAuthoring.confirmDeleteAssignment'))) {
                    remove.mutate(assignment.id, { onSuccess: () => setSelected(null) })
                  }
                }}>
                {t('activitiesAuthoring.deleteAssignment')}
              </Button>
              <MutationError error={remove.error} />
            </>
          )}
        </div>
      )}

      <div className="grid gap-3">
        <h4 className="font-semibold">{t('activitiesAuthoring.rubrics')}</h4>
        {data.rubrics.length === 0 && (
          <p className="text-sm text-text-muted">{t('activitiesAuthoring.noRubrics')}</p>
        )}
        <ul className="grid gap-2">
          {data.rubrics.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3">
              <span>{r.title}</span>
              <span className="flex gap-2">
                <Button variant="secondary" onClick={() => { saveRubric.reset(); setRubric(r.id) }}>
                  {editable ? t('activitiesAuthoring.editRubric') : t('activitiesAuthoring.viewRubric')}
                </Button>
                {editable && (
                  <Button variant="destructive" disabled={removeRubric.isPending}
                    onClick={() => {
                      if (window.confirm(t('activitiesAuthoring.confirmDeleteRubric'))) {
                        removeRubric.mutate(r.id)
                      }
                    }}>
                    {t('teacherCommon.delete')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <MutationError error={removeRubric.error} />
        {editable && rubric === null && (
          <Button variant="secondary" className="w-fit"
            onClick={() => { saveRubric.reset(); setRubric('new') }}>
            {t('activitiesAuthoring.newRubric')}
          </Button>
        )}
        {(rubric === 'new' || editingRubric) && (
          <RubricEditor key={editingRubric?.id ?? 'new'}
            initial={editingRubric ? {
              title: editingRubric.title,
              criteria: editingRubric.criteria.map((c) => ({
                title: c.title,
                levels: c.levels.map((l) => ({
                  label: l.label, descriptor: l.descriptor, points: l.points,
                })),
              })),
            } : emptyRubric}
            editable={editable} pending={saveRubric.isPending} error={saveRubric.error}
            onSubmit={(values) => void saveRubric.mutateAsync({ id: editingRubric?.id, values })
              .then(() => setRubric(null)).catch(() => undefined)}
            onCancel={() => setRubric(null)} />
        )}
      </div>
    </section>
  )
}
