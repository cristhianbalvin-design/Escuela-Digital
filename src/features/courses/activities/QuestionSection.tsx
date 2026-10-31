import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import {
  questionToForm, useDeleteActivity, useSaveQuestion, type ActivityAssessment,
} from './authoring-api'
import { QuestionForm } from './QuestionForm'
import { MutationError } from './shared'

type Editing = { id?: string } | null

export function QuestionSection({ tenantId, versionId, assessment, editable }: {
  tenantId: string
  versionId: string
  assessment: ActivityAssessment
  editable: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<Editing>(null)
  const save = useSaveQuestion(tenantId, versionId, assessment.id)
  const remove = useDeleteActivity(versionId, 'questions')
  const questions = assessment.questions
  const nextPosition = (questions.at(-1)?.position ?? 0) + 1
  const current = editing?.id ? questions.find((q) => q.id === editing.id) : undefined

  async function submit(values: Parameters<typeof save.mutateAsync>[0]['values']) {
    try {
      await save.mutateAsync({ id: editing?.id, position: nextPosition, values })
      setEditing(null)
    } catch {
      // El error se muestra con save.error.
    }
  }

  return (
    <section className="grid gap-3" aria-label={t('activitiesAuthoring.questions')}>
      <h4 className="font-semibold">{t('activitiesAuthoring.questions')}</h4>
      {questions.length === 0 && <p className="text-sm text-text-muted">{t('activitiesAuthoring.noQuestions')}</p>}
      <ol className="grid gap-2">
        {questions.map((q, i) => (
          <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3">
            <span>
              {i + 1}. {q.prompt}{' '}
              <span className="text-sm text-text-muted">
                ({t(`activitiesAuthoring.types.${q.type}`)} · {q.points})
              </span>
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" onClick={() => { save.reset(); setEditing({ id: q.id }) }}>
                {editable ? t('activitiesAuthoring.editQuestion') : t('activitiesAuthoring.viewQuestion')}
              </Button>
              {editable && (
                <Button variant="destructive" disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t('activitiesAuthoring.confirmDeleteQuestion'))) {
                      remove.mutate(q.id)
                    }
                  }}>
                  {t('teacherCommon.delete')}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ol>
      <MutationError error={remove.error} />
      {editing ? (
        <QuestionForm key={editing.id ?? 'new'} initial={current ? questionToForm(current) : undefined}
          editable={editable} isEdit={!!editing.id} pending={save.isPending} error={save.error}
          onSubmit={(values) => void submit(values)} onCancel={() => setEditing(null)} />
      ) : (
        editable && (
          <Button variant="secondary" className="w-fit"
            onClick={() => { save.reset(); setEditing({}) }}>
            {t('activitiesAuthoring.addQuestion')}
          </Button>
        )
      )}
    </section>
  )
}
