import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import {
  useDeleteActivity, useSaveGradeItem, type ActivitiesData,
} from './authoring-api'
import { weightSchema, type WeightValues } from './schemas'
import { MutationError } from './shared'

type Item = ActivitiesData['gradeItems'][number]

function WeightRow({ item, tenantId, versionId, editable }: {
  item?: Item
  tenantId: string
  versionId: string
  editable: boolean
}) {
  const { t } = useTranslation()
  const save = useSaveGradeItem(tenantId, versionId)
  const remove = useDeleteActivity(versionId, 'grade_items')
  const { register, handleSubmit, reset, formState: { errors } } = useForm<WeightValues>({
    resolver: zodResolver(weightSchema),
    defaultValues: {
      title: item?.title ?? '', weight: item?.weight ?? 0, max_score: item?.max_score ?? 20,
    },
  })
  const key = item?.id ?? 'new'
  async function onSubmit(values: WeightValues) {
    try {
      await save.mutateAsync({ id: item?.id, ...values })
      if (!item) reset()
    } catch {
      // Se muestra con save.error.
    }
  }
  return (
    <form noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="grid gap-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
      <Input id={`gw-title-${key}`} label={item ? t('activitiesAuthoring.gradeItem') : t('activitiesAuthoring.manualItemTitle')}
        disabled={!editable || (item && item.source_type !== 'manual')}
        error={errors.title?.message} {...register('title')} />
      <Input id={`gw-weight-${key}`} type="number" step="any" label={t('activitiesAuthoring.weight')}
        disabled={!editable} error={errors.weight?.message}
        {...register('weight', { valueAsNumber: true })} />
      <Input id={`gw-max-${key}`} type="number" step="any" label={t('activitiesAuthoring.maxScore')}
        disabled={!editable} error={errors.max_score?.message}
        {...register('max_score', { valueAsNumber: true })} />
      {editable && (
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {item ? t('teacherCommon.save') : t('activitiesAuthoring.addManualItem')}
          </Button>
          {item?.source_type === 'manual' && (
            <Button variant="destructive" disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('activitiesAuthoring.confirmDeleteManualItem'))) {
                  remove.mutate(item.id)
                }
              }}>
              {t('teacherCommon.delete')}
            </Button>
          )}
        </div>
      )}
      <div className="lg:col-span-4"><MutationError error={save.error ?? remove.error} /></div>
    </form>
  )
}

export function GradeWeightsPanel({ tenantId, versionId, data, editable }: {
  tenantId: string
  versionId: string
  data: ActivitiesData
  editable: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const total = data.gradeItems.reduce((sum, item) => sum + item.weight, 0)
  return (
    <section className="grid gap-3" aria-label={t('activitiesAuthoring.gradeWeights')}>
      <h3 className="text-lg font-bold">{t('activitiesAuthoring.gradeWeights')}</h3>
      <p className="text-sm text-text-muted">
        {t('activitiesAuthoring.totalWeight', { weight: total })} {t('activitiesAuthoring.weightHint')}
      </p>
      {data.gradeItems.length === 0 && (
        <p className="text-sm text-text-muted">{t('activitiesAuthoring.noGradeItems')}</p>
      )}
      <div className="grid gap-3">
        {data.gradeItems.map((item) => (
          <WeightRow key={`${item.id}:${item.updated_at}`} item={item}
            tenantId={tenantId} versionId={versionId} editable={editable} />
        ))}
      </div>
      {editable && (open
        ? <WeightRow tenantId={tenantId} versionId={versionId} editable />
        : <Button variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
          {t('activitiesAuthoring.newManualItem')}
        </Button>)}
    </section>
  )
}
