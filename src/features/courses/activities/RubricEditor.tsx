import { useFieldArray, useForm, type Control, type UseFormRegister, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import { rubricSchema, type RubricValues } from './schemas'
import { FieldError, MutationError } from './shared'

export const emptyRubric: RubricValues = {
  title: '',
  criteria: [{ title: '', levels: [{ label: '', descriptor: '', points: 0 }] }],
}

function CriterionFields({ index, control, register, errors, editable, canRemove, onRemove }: {
  index: number
  control: Control<RubricValues>
  register: UseFormRegister<RubricValues>
  errors: FieldErrors<RubricValues>
  editable: boolean
  canRemove: boolean
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const levels = useFieldArray({ control, name: `criteria.${index}.levels` })
  const criterionErrors = errors.criteria?.[index]
  return (
    <fieldset className="grid gap-3 rounded-control border border-border p-3">
      <legend className="px-1 text-sm font-semibold">
        {t('activitiesAuthoring.criterion')} {index + 1}
      </legend>
      <Input id={`rb-c-${index}`} label={t('activitiesAuthoring.criterionTitle')}
        disabled={!editable} error={criterionErrors?.title?.message}
        {...register(`criteria.${index}.title`)} />
      {levels.fields.map((level, li) => (
        <div key={level.id} className={`grid gap-2 lg:items-end ${
          editable && levels.fields.length > 1
            ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,7rem)_auto]'
            : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,7rem)]'
        }`}>
          <Input id={`rb-c-${index}-l-${li}`} label={t('activitiesAuthoring.levelLabel')}
            disabled={!editable} error={criterionErrors?.levels?.[li]?.label?.message}
            {...register(`criteria.${index}.levels.${li}.label`)} />
          <Input id={`rb-c-${index}-d-${li}`} label={t('activitiesAuthoring.descriptor')}
            disabled={!editable} {...register(`criteria.${index}.levels.${li}.descriptor`)} />
          <Input id={`rb-c-${index}-p-${li}`} type="number" step="any"
            label={t('activitiesAuthoring.points')} disabled={!editable}
            error={criterionErrors?.levels?.[li]?.points?.message}
            {...register(`criteria.${index}.levels.${li}.points`, { valueAsNumber: true })} />
          {editable && levels.fields.length > 1 && (
            <Button variant="ghost" onClick={() => levels.remove(li)}>
              {t('activitiesAuthoring.removeLevel')}
            </Button>
          )}
        </div>
      ))}
      <FieldError message={criterionErrors?.levels?.message ?? criterionErrors?.levels?.root?.message} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary"
            onClick={() => levels.append({ label: '', descriptor: '', points: 0 })}>
            {t('activitiesAuthoring.addLevel')}
          </Button>
          {canRemove && (
            <Button variant="ghost" onClick={onRemove}>{t('activitiesAuthoring.removeCriterion')}</Button>
          )}
        </div>
      )}
    </fieldset>
  )
}

export function RubricEditor({ initial, editable, pending, error, onSubmit, onCancel }: {
  initial: RubricValues
  editable: boolean
  pending: boolean
  error: unknown
  onSubmit: (values: RubricValues) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { register, control, handleSubmit, formState: { errors } } = useForm<RubricValues>({
    resolver: zodResolver(rubricSchema),
    defaultValues: initial,
  })
  const criteria = useFieldArray({ control, name: 'criteria' })
  return (
    <form className="grid gap-3 rounded-control border border-border p-4" noValidate
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
      <Input id="rb-title" label={t('activitiesAuthoring.rubricTitle')} disabled={!editable}
        error={errors.title?.message} {...register('title')} />
      {criteria.fields.map((field, index) => (
        <CriterionFields key={field.id} index={index} control={control} register={register}
          errors={errors} editable={editable} canRemove={criteria.fields.length > 1}
          onRemove={() => criteria.remove(index)} />
      ))}
      <FieldError message={errors.criteria?.message ?? errors.criteria?.root?.message} />
      <MutationError error={error} />
      <div className="flex flex-wrap gap-2">
        {editable && (
          <>
            <Button variant="secondary"
              onClick={() => criteria.append({ title: '', levels: [{ label: '', descriptor: '', points: 0 }] })}>
              {t('activitiesAuthoring.addCriterion')}
            </Button>
            <Button type="submit" disabled={pending}>{t('activitiesAuthoring.saveRubric')}</Button>
          </>
        )}
        <Button variant="secondary" onClick={onCancel}>{t('activitiesAuthoring.cancel')}</Button>
      </div>
    </form>
  )
}
