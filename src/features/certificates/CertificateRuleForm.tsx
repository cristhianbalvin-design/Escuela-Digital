import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from '@/components/ui'
import { useCompletionRules, useSaveCompletionRules } from './certificates-api'
import {
  assessmentsFromOutline, rulesToSave, type CompletionRules,
} from './certificates-utils'

const schema = z.object({
  min_progress_pct: z.number().min(0).max(100),
  min_final_grade: z.union([z.number().min(0).max(20), z.nan()]),
  min_attendance_pct: z.union([z.number().min(0).max(100), z.nan()]),
  show_grade: z.boolean(),
  auto_issue: z.boolean(),
  required_assessments: z.array(z.string()),
})

type Values = z.infer<typeof schema>

function valuesOf(rules: CompletionRules): Values {
  return {
    min_progress_pct: rules.min_progress_pct ?? 100,
    min_final_grade: rules.min_final_grade ?? Number.NaN,
    min_attendance_pct: rules.min_attendance_pct ?? Number.NaN,
    show_grade: rules.show_grade ?? false,
    auto_issue: rules.auto_issue ?? false,
    required_assessments: rules.required_assessments ?? [],
  }
}

export function CertificateRuleForm({
  offeringId, outline,
}: { offeringId: string; outline: unknown }) {
  const { t } = useTranslation()
  const rules = useCompletionRules(offeringId)
  const save = useSaveCompletionRules(offeringId)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf({}),
  })
  const { reset, control, setValue, register, handleSubmit, formState } = form
  const assessments = assessmentsFromOutline(outline)
  const selected = useWatch({ control, name: 'required_assessments' })

  useEffect(() => {
    if (rules.data) reset(valuesOf(rules.data))
  }, [rules.data, reset])

  function toggle(id: string, checked: boolean) {
    setValue(
      'required_assessments',
      checked ? [...selected, id] : selected.filter((value) => value !== id),
      { shouldDirty: true },
    )
  }

  async function submit(values: Values) {
    await save.mutateAsync(rulesToSave(values))
  }

  if (rules.isPending) return <Card role="status">{t('certificates.loading')}</Card>
  if (rules.isError) return <Card><p role="alert">{rules.error.message}</p></Card>

  return (
    <Card className="grid gap-4">
      <h2 className="text-lg font-bold">{t('certificates.rulesTitle')}</h2>
      <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => void handleSubmit(submit)(event)}>
        <Input id="cert-min-progress" type="number" min="0" max="100" step="1"
          label={t('certificates.minProgress')}
          error={formState.errors.min_progress_pct ? t('certificates.invalidProgress') : undefined}
          {...register('min_progress_pct', { valueAsNumber: true })} />
        <Input id="cert-min-grade" type="number" min="0" max="20" step="0.1"
          label={t('certificates.minGrade')}
          error={formState.errors.min_final_grade ? t('certificates.invalidGrade') : undefined}
          {...register('min_final_grade', { valueAsNumber: true })} />
        <Input id="cert-min-attendance" type="number" min="0" max="100" step="1"
          label={t('certificates.minAttendance')}
          error={formState.errors.min_attendance_pct ? t('certificates.invalidProgress') : undefined}
          {...register('min_attendance_pct', { valueAsNumber: true })} />
        <label className="flex min-h-11 items-center gap-3 lg:col-span-2">
          <input type="checkbox" className="size-5 accent-brand" {...register('show_grade')} />
          <span>{t('certificates.showGrade')}</span>
        </label>
        <label className="flex min-h-11 items-center gap-3 lg:col-span-2">
          <input type="checkbox" className="size-5 accent-brand" {...register('auto_issue')} />
          <span>{t('certificates.autoIssue')}</span>
        </label>
        <fieldset className="grid min-w-0 gap-2 lg:col-span-2">
          <legend className="font-semibold">{t('certificates.requiredAssessments')}</legend>
          {assessments.length === 0
            ? <p className="text-sm text-text-muted">{t('certificates.noAssessments')}</p>
            : assessments.map((assessment) => (
              <label key={assessment.id} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="size-5 accent-brand"
                  checked={selected.includes(assessment.id)}
                  onChange={(event) => toggle(assessment.id, event.target.checked)} />
                <span>{assessment.title}</span>
              </label>
            ))}
        </fieldset>
        <p className="text-sm text-text-muted lg:col-span-2">{t('certificates.rulesHint')}</p>
        {save.isError && <p role="alert" className="lg:col-span-2">{save.error.message}</p>}
        {save.isSuccess && !formState.isDirty &&
          <p role="status" className="lg:col-span-2">{t('certificates.rulesSaved')}</p>}
        <div className="lg:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('certificates.saving') : t('certificates.saveRules')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
