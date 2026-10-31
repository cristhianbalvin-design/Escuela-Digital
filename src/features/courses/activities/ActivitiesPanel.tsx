import { useTranslation } from 'react-i18next'
import { Button, Card, Skeleton } from '@/components/ui'
import { useActivities } from './authoring-api'
import { AssessmentEditor } from './AssessmentEditor'
import { AssignmentEditor } from './AssignmentEditor'
import { GradeWeightsPanel } from './GradeWeightsPanel'
import { errorText } from './shared'

export function ActivitiesPanel({ tenantId, versionId, editable }: {
  tenantId: string
  versionId: string
  editable: boolean
}) {
  const { t } = useTranslation()
  const query = useActivities(versionId)
  if (query.isPending) return <Skeleton className="h-40" />
  if (query.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{errorText(query.error) ?? t('activitiesAuthoring.loadError')}</p>
        <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }
  return (
    <Card className="grid gap-8">
      <h2 className="text-xl font-bold">{t('activitiesAuthoring.title')}</h2>
      {!editable && <p className="text-sm text-text-muted">{t('activitiesAuthoring.readOnly')}</p>}
      <AssessmentEditor tenantId={tenantId} versionId={versionId} data={query.data} editable={editable} />
      <AssignmentEditor tenantId={tenantId} versionId={versionId} data={query.data} editable={editable} />
      <GradeWeightsPanel tenantId={tenantId} versionId={versionId} data={query.data} editable={editable} />
    </Card>
  )
}
