import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import { assessmentSchema, type AssessmentValues } from './schemas'
import { FieldError, MutationError, areaClass, controlClass } from './shared'

export const emptyAssessment: AssessmentValues = {
  title: '',
  instructions: '',
  settings: {
    time_limit_minutes: '', max_attempts: '', pass_pct: '',
    shuffle_questions: false, shuffle_options: false, show_results: 'immediate',
    opens_at: '', closes_at: '',
  },
}

export function AssessmentForm({ initial, editable, pending, error, onSubmit }: {
  initial: AssessmentValues
  editable: boolean
  pending: boolean
  error: unknown
  onSubmit: (values: AssessmentValues) => void
}) {
  const { t } = useTranslation()
  const { register, handleSubmit, formState: { errors } } = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: initial,
  })
  const s = errors.settings
  return (
    <form className="grid gap-3" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
      <Input id="as-title" label={t('activitiesAuthoring.assessmentTitle')}
        disabled={!editable} error={errors.title?.message} {...register('title')} />
      <div className="grid gap-1.5">
        <label htmlFor="as-instructions" className="text-sm font-semibold">
          {t('activitiesAuthoring.instructions')}
        </label>
        <textarea id="as-instructions" className={areaClass} disabled={!editable}
          {...register('instructions')} />
      </div>
      <fieldset className="grid gap-3 min-w-0 rounded-control border border-border p-3 lg:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">{t('activitiesAuthoring.settings')}</legend>
        <Input id="as-time" label={t('activitiesAuthoring.timeLimit')} inputMode="numeric"
          disabled={!editable} error={s?.time_limit_minutes?.message}
          {...register('settings.time_limit_minutes')} />
        <Input id="as-attempts" label={t('activitiesAuthoring.maxAttempts')} inputMode="numeric"
          disabled={!editable} error={s?.max_attempts?.message}
          {...register('settings.max_attempts')} />
        <Input id="as-pass" label={t('activitiesAuthoring.passPct')} inputMode="numeric"
          disabled={!editable} error={s?.pass_pct?.message}
          {...register('settings.pass_pct')} />
        <Input id="as-opens" type="datetime-local" label={t('activitiesAuthoring.opensAt')}
          disabled={!editable} {...register('settings.opens_at')} />
        <Input id="as-closes" type="datetime-local" label={t('activitiesAuthoring.closesAt')}
          disabled={!editable} error={s?.closes_at?.message}
          {...register('settings.closes_at')} />
        <div className="grid gap-1.5">
          <label htmlFor="as-show" className="text-sm font-semibold">
            {t('activitiesAuthoring.showResults')}
          </label>
          <select id="as-show" className={controlClass} disabled={!editable}
            {...register('settings.show_results')}>
            <option value="immediate">{t('activitiesAuthoring.immediate')}</option>
            <option value="after_close">{t('activitiesAuthoring.afterClose')}</option>
            <option value="never">{t('activitiesAuthoring.never')}</option>
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" disabled={!editable} {...register('settings.shuffle_questions')} />
          {t('activitiesAuthoring.shuffleQuestions')}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" disabled={!editable} {...register('settings.shuffle_options')} />
          {t('activitiesAuthoring.shuffleOptions')}
        </label>
      </fieldset>
      <FieldError message={errors.settings?.root?.message} />
      <MutationError error={error} />
      {editable && (
        <Button type="submit" className="w-fit" disabled={pending}>
          {t('activitiesAuthoring.saveAssessment')}
        </Button>
      )}
    </form>
  )
}
