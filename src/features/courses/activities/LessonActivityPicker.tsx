import { useTranslation } from 'react-i18next'
import { useActivities, useLinkLessonActivity } from './authoring-api'
import { MutationError, controlClass } from './shared'

export function LessonActivityPicker({ versionId, lessonId, lessonTitle, type, value, editable }: {
  versionId: string
  lessonId: string
  lessonTitle: string
  type: 'quiz' | 'assignment'
  value: string | null
  editable: boolean
}) {
  const { t } = useTranslation()
  const query = useActivities(versionId)
  const link = useLinkLessonActivity(versionId)
  const choices = type === 'quiz' ? query.data?.assessments ?? [] : query.data?.assignments ?? []
  const id = `lesson-activity-${lessonId}`
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {type === 'quiz' ? t('activitiesAuthoring.linkedAssessment') : t('activitiesAuthoring.linkedAssignment')}
      </label>
      <select id={id} className={controlClass} value={value ?? ''}
        disabled={!editable || query.isPending || link.isPending}
        onChange={(e) => {
          const activityId = e.target.value || null
          const picked = choices.find((item) => item.id === activityId)
          const provisional = lessonTitle === t('teacherCourses.newLesson')
          link.mutate({ lessonId, type, activityId, newTitle: picked && provisional ? picked.title : undefined })
        }}>
        <option value="">{t('activitiesAuthoring.selectActivity')}</option>
        {choices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      {!value && <p className="text-sm text-text-muted">{t('activitiesAuthoring.activityRequired')}</p>}
      <MutationError error={link.error} />
    </div>
  )
}
