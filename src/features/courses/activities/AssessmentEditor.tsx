import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import {
  formFromSettings, useDeleteActivity, useSaveAssessment, type ActivitiesData,
} from './authoring-api'
import { AssessmentForm, emptyAssessment } from './AssessmentForm'
import { QuestionSection } from './QuestionSection'
import { MutationError } from './shared'

export function AssessmentEditor({ tenantId, versionId, data, editable }: {
  tenantId: string
  versionId: string
  data: ActivitiesData
  editable: boolean
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const save = useSaveAssessment(tenantId, versionId)
  const remove = useDeleteActivity(versionId, 'assessments')
  const assessment = data.assessments.find((a) => a.id === selected)

  return (
    <section className="grid gap-3" aria-label={t('activitiesAuthoring.assessments')}>
      <h3 className="text-lg font-bold">{t('activitiesAuthoring.assessments')}</h3>
      {data.assessments.length === 0 && (
        <p className="text-sm text-text-muted">{t('activitiesAuthoring.noAssessments')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.assessments.map((a) => (
          <Button key={a.id} variant={a.id === selected ? 'primary' : 'secondary'}
            onClick={() => { save.reset(); setSelected(a.id) }}>
            {a.title}
          </Button>
        ))}
        {editable && (
          <Button variant="ghost" onClick={() => { save.reset(); setSelected('new') }}>
            {t('activitiesAuthoring.newAssessment')}
          </Button>
        )}
      </div>

      {(selected === 'new' || assessment) && (
        <div className="grid gap-4 rounded-card border border-border p-4">
          <AssessmentForm key={assessment?.id ?? 'new'}
            initial={assessment
              ? {
                title: assessment.title, instructions: assessment.instructions,
                settings: formFromSettings(assessment.settings),
              }
              : emptyAssessment}
            editable={editable} pending={save.isPending} error={save.error}
            onSubmit={(values) => void save.mutateAsync({ id: assessment?.id, values })
              .then((id) => setSelected(id)).catch(() => undefined)} />
          {assessment && (
            <>
              <QuestionSection tenantId={tenantId} versionId={versionId}
                assessment={assessment} editable={editable} />
              {editable && (
                <>
                  <Button variant="destructive" className="w-fit" disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t('activitiesAuthoring.confirmDeleteAssessment'))) {
                        remove.mutate(assessment.id, { onSuccess: () => setSelected(null) })
                      }
                    }}>
                    {t('activitiesAuthoring.deleteAssessment')}
                  </Button>
                  <MutationError error={remove.error} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
