import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { supabase } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Las rutas antiguas /sesion/... llevan a la pantalla de la sesión dentro del curso. */
function LegacySessionRedirect() {
  const { t } = useTranslation()
  const { lessonId = '' } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const client = supabase
    if (auth.status === 'loading' || !client) return
    if (!auth.user || !UUID.test(lessonId)) { setFailed(true); return }
    let active = true
    void (async () => {
      const { data: lesson } = await client.from('lessons').select('version_id').eq('id', lessonId).maybeSingle()
      const { data: version } = lesson ? await client.from('course_versions').select('course_id').eq('id', lesson.version_id).maybeSingle() : { data: null }
      if (!active) return
      if (version?.course_id) navigate(`/docente/cursos/${version.course_id}/sesiones/${lessonId}?tab=guion`, { replace: true })
      else setFailed(true)
    })()
    return () => { active = false }
  }, [auth.status, auth.user, lessonId, navigate])
  return <main className="p-8" role={failed ? 'alert' : 'status'}>{failed ? t('live.unavailable') : t('live.loading')}</main>
}

export const SessionPreparePage = LegacySessionRedirect
export const ActivityEditorPage = LegacySessionRedirect
