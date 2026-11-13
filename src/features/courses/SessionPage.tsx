import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Skeleton, useToast } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { ScriptEditor } from '@/features/planning/ScriptEditor'
import { SessionScript } from '@/features/live/LiveSetPages'
import { LessonResources } from '@/features/resources'
import { useCourse, useCourseAction } from './api'
import { LessonEditor } from './CourseBuilderPage'
import { readableError } from './schemas'

type Tab = 'contenido' | 'guion'

/** Una sesión del curso: contenido para alumnos y guion de la clase, en pestañas. */
export function SessionPage() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const [params, setParams] = useSearchParams()
  const notify = useToast()
  const { courseId = '', lessonId = '' } = useParams()
  const tenantId = useTenantAccess().active?.tenant_id
  const userId = useAuth().user?.id
  const query = useCourse(tenantId, courseId, userId)
  const mutation = useCourseAction(tenantId, courseId)
  const [contentMode, setContentMode] = useState(false)
  const [editBlocks, setEditBlocks] = useState(false)
  const tab: Tab = params.get('tab') === 'contenido' ? 'contenido' : 'guion'
  const data = query.data
  const lesson = data?.lessons.find((item) => item.id === lessonId)
  const version = data?.versions.find((item) => item.id === lesson?.version_id)
  const modules = (data?.modules ?? []).filter((item) => item.version_id === version?.id)
  const module = modules.find((item) => item.id === lesson?.module_id)
  const ordered = modules.flatMap((item) => (data?.lessons ?? []).filter((candidate) => candidate.module_id === item.id))
  const index = ordered.findIndex((item) => item.id === lessonId)
  const previous = ordered[index - 1]; const next = ordered[index + 1]
  const editable = !!data?.canEdit && version?.status === 'draft'
  const liveEditable = !!data?.canEdit && version?.status === 'published'
  const contentEditable = liveEditable && contentMode
  const courseBase = `/docente/cursos/${courseId}`

  function setTab(value: Tab) { const nextParams = new URLSearchParams(params); nextParams.set('tab', value); setParams(nextParams, { replace: true }) }
  async function run(action: Parameters<typeof mutation.mutateAsync>[0]) {
    try { await mutation.mutateAsync(action); notify(t('teacherCommon.saved')) }
    catch (error) { notify(readableError(error)) }
  }

  if (query.isPending) return <Skeleton className="h-64" />
  if (query.isError) return <Card><p role="alert">{readableError(query.error)}</p></Card>
  if (!data || !lesson || !version) return <EmptyState title={t('sessions.notFound')} />
  const tabClass = (value: Tab) => `min-h-12 border-b-[3px] px-4 ${tab === value ? 'border-brand font-semibold' : 'border-transparent text-text-muted'}`
  const link = (target: string) => ({ pathname: `${courseBase}/sesiones/${target}`, search })
  return <section className="grid gap-5">
    <nav aria-label={t('sessions.breadcrumb')} className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
      <Link className="underline" to={{ pathname: courseBase, search }}>{version.title}</Link><span aria-hidden="true">/</span>
      <span>{module?.title}</span><span aria-hidden="true">/</span><span className="text-text">{t('sessions.number', { number: index + 1 })}</span>
    </nav>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-muted">{module?.title} · {t('sessions.number', { number: index + 1 })}</p>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">{lesson.title}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {previous && <Link className="inline-flex min-h-11 items-center rounded-control border border-border px-4" to={link(previous.id)}>← {t('sessions.previous')}</Link>}
        {next && <Link className="inline-flex min-h-11 items-center rounded-control border border-border px-4" to={link(next.id)}>{t('sessions.number', { number: index + 2 })} →</Link>}
      </div>
    </div>
    <div role="tablist" aria-label={t('sessions.parts')} className="flex flex-wrap gap-1 border-b border-border">
      <button type="button" role="tab" aria-selected={tab === 'contenido'} className={tabClass('contenido')} onClick={() => setTab('contenido')}>{t('sessions.tabContent')}</button>
      <button type="button" role="tab" aria-selected={tab === 'guion'} className={tabClass('guion')} onClick={() => setTab('guion')}>{t('sessions.tabScript')}</button>
    </div>

    {tab === 'contenido' ? <div className="grid gap-4">
      {liveEditable && <Button className="w-fit" variant={contentMode ? 'primary' : 'secondary'} onClick={() => setContentMode((value) => !value)}>
        {contentMode ? t('teacherCourses.stopEditContent') : t('teacherCourses.editContent')}</Button>}
      <LessonEditor key={`${lesson.id}:${lesson.title}`} lesson={lesson} versionId={lesson.version_id}
        editable={editable} contentEditable={contentEditable} pending={mutation.isPending}
        canUp={false} canDown={false}
        onSave={(title, content) => void run({ kind: 'saveLesson', id: lesson.id, title, content })}
        onDelete={() => void run({ kind: 'deleteLesson', id: lesson.id })}
        onMove={() => undefined} />
      {lesson.type !== 'reading' && <LessonResources lessonId={lesson.id} tenantId={lesson.tenant_id} versionId={lesson.version_id} editable={editable || contentEditable} />}
    </div> : <div className="grid gap-4">
      {data.canEdit && <Button className="w-fit" variant={editBlocks ? 'primary' : 'secondary'} onClick={() => setEditBlocks((value) => !value)}>
        {editBlocks ? t('sessions.doneBlocks') : t('sessions.editBlocks')}</Button>}
      {editBlocks
        ? <ScriptEditor lessonId={lesson.id} tenantId={lesson.tenant_id} editable={data.canEdit} />
        : <SessionScript lessonId={lesson.id} base={`${courseBase}/sesiones/${lesson.id}`} editable={data.canEdit} />}
    </div>}
  </section>
}
