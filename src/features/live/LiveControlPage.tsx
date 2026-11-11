import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { LiveControlPanel } from './LiveControlPanel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Panel docente en una pestaña propia; el permiso lo validan las RPC. */
export function LiveControlPage() {
  const { t } = useTranslation()
  const { offeringId = '', lessonId = '' } = useParams()
  const [search] = useSearchParams()
  const auth = useAuth()
  const item = search.get('item')
  const valid = UUID.test(offeringId) && UUID.test(lessonId)
  return <main className="mx-auto min-h-screen max-w-5xl space-y-4 p-4 text-text sm:p-6">
    <h1 className="text-2xl font-bold">{t('live.classTitle')}</h1>
    {auth.status === 'loading' && <p role="status">{t('live.loading')}</p>}
    {auth.status !== 'loading' && (!valid || !auth.user) && <p role="alert">{t('live.unavailable')}</p>}
    {auth.status !== 'loading' && valid && auth.user &&
      <LiveControlPanel key={item ?? 'all'} offeringId={offeringId} lessonId={lessonId}
        launchPlanItemId={item && UUID.test(item) ? item : null} />}
  </main>
}
