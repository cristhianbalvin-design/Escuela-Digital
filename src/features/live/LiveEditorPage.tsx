import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { useLessonPlan } from '@/features/planning/planning-api'
import { LiveActivityEditor } from './LiveActivityEditor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Editor de actividades de un registro de la guía, en pestaña propia; el permiso lo validan las RPC. */
export function LiveEditorPage() {
  const { t } = useTranslation()
  const { lessonId = '' } = useParams()
  const [search] = useSearchParams()
  const auth = useAuth()
  const raw = search.get('item')
  const planItemId = raw === 'none' ? null : raw && UUID.test(raw) ? raw : undefined
  const valid = UUID.test(lessonId)
  const plan = useLessonPlan(valid && auth.user ? lessonId : '')
  const row = planItemId ? plan.data?.items.find((item) => item.id === planItemId) : undefined
  return <main className="mx-auto min-h-screen max-w-4xl space-y-4 p-4 text-text sm:p-6">
    <header>
      <p className="text-sm text-text-muted">{planItemId === undefined ? t('live.allActivities') : t('live.editorFor')}</p>
      <h1 className="text-2xl font-bold">{planItemId === null ? t('live.unlinked') : row?.title ?? t('live.editorTitle')}</h1>
    </header>
    {auth.status === 'loading' && <p role="status">{t('live.loading')}</p>}
    {auth.status !== 'loading' && (!valid || !auth.user) && <p role="alert">{t('live.unavailable')}</p>}
    {auth.status !== 'loading' && valid && auth.user &&
      <LiveActivityEditor key={raw ?? 'all'} lessonId={lessonId} editable planItemId={planItemId} />}
  </main>
}
