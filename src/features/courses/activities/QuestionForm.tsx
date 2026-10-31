import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import { questionSchema, type QuestionValues } from './schemas'
import { FieldError, MutationError, areaClass, controlClass } from './shared'

export const emptyQuestion: QuestionValues = {
  type: 'single', prompt: '', points: 1, feedback_ok: '', feedback_bad: '',
  options: [{ label: '' }, { label: '' }], correct: [], trueFalse: true,
  accepted: [{ value: '' }],
}

const TYPES = ['single', 'multiple', 'true_false', 'short', 'essay'] as const

export function QuestionForm({ initial, editable, isEdit, pending, error, onSubmit, onCancel }: {
  initial?: QuestionValues
  editable: boolean
  isEdit: boolean
  pending: boolean
  error: unknown
  onSubmit: (values: QuestionValues) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { register, control, handleSubmit, setValue, getValues, formState: { errors } } =
    useForm<QuestionValues>({
      resolver: zodResolver(questionSchema),
      defaultValues: initial ?? emptyQuestion,
    })
  const options = useFieldArray({ control, name: 'options' })
  const accepted = useFieldArray({ control, name: 'accepted' })
  const type = useWatch({ control, name: 'type' })
  const correct = useWatch({ control, name: 'correct' })
  const disabled = !editable

  function toggle(index: number, checked: boolean) {
    const current = getValues('correct')
    setValue('correct', type === 'single' ? [index]
      : checked ? [...current, index] : current.filter((i) => i !== index), { shouldDirty: true })
  }
  function removeOption(index: number) {
    setValue('correct', getValues('correct').filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i)))
    options.remove(index)
  }

  return (
    <form className="grid gap-3 rounded-control border border-border p-4" noValidate
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
      <div className="grid gap-1.5">
        <label htmlFor="q-type" className="text-sm font-semibold">
          {t('activitiesAuthoring.questionType')}
        </label>
        <select id="q-type" className={controlClass} disabled={disabled || isEdit}
          {...register('type')}>
          {TYPES.map((item) => (
            <option key={item} value={item}>{t(`activitiesAuthoring.types.${item}`)}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="q-prompt" className="text-sm font-semibold">
          {t('activitiesAuthoring.prompt')}
        </label>
        <textarea id="q-prompt" className={areaClass} disabled={disabled}
          aria-invalid={!!errors.prompt} {...register('prompt')} />
        <FieldError message={errors.prompt?.message} />
      </div>
      <Input id="q-points" type="number" step="any" label={t('activitiesAuthoring.points')}
        disabled={disabled} error={errors.points?.message}
        {...register('points', { valueAsNumber: true })} />

      {(type === 'single' || type === 'multiple') && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{t('activitiesAuthoring.options')}</legend>
          {options.fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input id={`q-option-${index}`}
                  label={t('activitiesAuthoring.option', { number: index + 1 })}
                  disabled={disabled} {...register(`options.${index}.label`)} />
              </div>
              <label className="flex min-h-11 items-center gap-2">
                <input type={type === 'single' ? 'radio' : 'checkbox'} name="q-correct"
                  disabled={disabled} checked={correct.includes(index)}
                  aria-label={t('activitiesAuthoring.markCorrect', { number: index + 1 })}
                  onChange={(e) => toggle(index, e.target.checked)} />
                {t('activitiesAuthoring.correctAnswer')}
              </label>
              {!disabled && options.fields.length > 2 && (
                <Button variant="ghost" onClick={() => removeOption(index)}>
                  {t('activitiesAuthoring.removeOption')}
                </Button>
              )}
            </div>
          ))}
          {!disabled && (
            <Button variant="secondary" className="w-fit"
              onClick={() => options.append({ label: '' })}>
              {t('activitiesAuthoring.addOption')}
            </Button>
          )}
          <FieldError message={errors.options?.message ?? errors.options?.root?.message} />
          <FieldError message={errors.correct?.message} />
        </fieldset>
      )}

      {type === 'true_false' && (
        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold">{t('activitiesAuthoring.correctAnswer')}</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" disabled={disabled} {...register('trueFalse')} />
            {t('activitiesAuthoring.trueIsCorrect')}
          </label>
        </fieldset>
      )}

      {type === 'short' && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{t('activitiesAuthoring.acceptedAnswers')}</legend>
          {accepted.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input id={`q-accepted-${index}`}
                  label={t('activitiesAuthoring.acceptedAnswer', { number: index + 1 })}
                  disabled={disabled} {...register(`accepted.${index}.value`)} />
              </div>
              {!disabled && accepted.fields.length > 1 && (
                <Button variant="ghost" onClick={() => accepted.remove(index)}>
                  {t('activitiesAuthoring.removeOption')}
                </Button>
              )}
            </div>
          ))}
          {!disabled && (
            <Button variant="secondary" className="w-fit"
              onClick={() => accepted.append({ value: '' })}>
              {t('activitiesAuthoring.addAcceptedAnswer')}
            </Button>
          )}
          <FieldError message={errors.accepted?.message ?? errors.accepted?.root?.message} />
        </fieldset>
      )}

      <Input id="q-fok" label={t('activitiesAuthoring.feedbackOk')} disabled={disabled}
        {...register('feedback_ok')} />
      <Input id="q-fbad" label={t('activitiesAuthoring.feedbackBad')} disabled={disabled}
        {...register('feedback_bad')} />
      <MutationError error={error} />
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button type="submit" disabled={pending}>{t('activitiesAuthoring.saveQuestion')}</Button>
        )}
        <Button variant="secondary" onClick={onCancel}>{t('activitiesAuthoring.cancel')}</Button>
      </div>
    </form>
  )
}
