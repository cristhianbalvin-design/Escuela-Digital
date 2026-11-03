import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton, useToast } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import type { Lesson, Module } from './api'
import { useCourse, useCourseAction } from './api'
import { LessonContent } from './LessonContent'
import { LessonResources } from '@/features/resources'
import { ActivitiesPanel } from './activities/ActivitiesPanel'
import { LessonActivityPicker } from './activities/LessonActivityPicker'
import { readableError } from './schemas'

function between(before: number | undefined, after: number | undefined): number | null {
  const position = before === undefined
    ? after === undefined ? 1 : after / 2
    : after === undefined ? before + 1 : (before + after) / 2
  const rounded = Math.round(position * 10000) / 10000
  if (rounded < 0 || rounded === before || rounded === after) return null
  return rounded
}

function readingText(content: Lesson['content']): string | null {
  if (
    content && typeof content === 'object' && !Array.isArray(content) &&
    Object.keys(content).length === 1 && typeof content.text === 'string'
  ) return content.text
  return null
}

export function CourseBuilderPage() {
  const { search } = useLocation()
  const { t } = useTranslation()
  const notify = useToast()
  const { courseId } = useParams()
  const tenantId = useTenantAccess().active?.tenant_id
  const userId = useAuth().user?.id
  const query = useCourse(tenantId, courseId, userId)
  const mutation = useCourseAction(tenantId, courseId)
  const [versionId, setVersionId] = useState('')
  const [notice, setNotice] = useState('')
  const [contentMode, setContentMode] = useState(false)
  const data = query.data
  const version = data?.versions.find((item) => item.id === versionId) ?? data?.versions[0]
  const modules = (data?.modules ?? []).filter((item) => item.version_id === version?.id)
  const editable = !!data?.canEdit && version?.status === 'draft'
  // Edición de contenido (textos y archivos) en una versión publicada, sin versión nueva.
  const liveEditable = !!data?.canEdit && version?.status === 'published'
  const contentEditable = liveEditable && contentMode

  async function run(action: Parameters<typeof mutation.mutateAsync>[0]) {
    setNotice('')
    try {
      await mutation.mutateAsync(action)
      const message = t('teacherCommon.saved')
      setNotice(message)
      notify(message)
    } catch (error) {
      const message = readableError(error)
      setNotice(message)
      notify(message)
    }
  }

  async function moveModule(module: Module, index: number, direction: -1 | 1) {
    const position = direction === -1
      ? between(modules[index - 2]?.position, modules[index - 1]?.position)
      : between(modules[index + 1]?.position, modules[index + 2]?.position)
    if (position === null) {
      const message = t('teacherCourses.positionError')
      setNotice(message)
      notify(message)
      return
    }
    await run({ kind: 'moveModule', id: module.id, position })
  }

  async function moveLesson(
    lesson: Lesson, siblings: Lesson[], index: number, direction: -1 | 1,
  ) {
    const position = direction === -1
      ? between(siblings[index - 2]?.position, siblings[index - 1]?.position)
      : between(siblings[index + 1]?.position, siblings[index + 2]?.position)
    if (position === null) {
      const message = t('teacherCourses.positionError')
      setNotice(message)
      notify(message)
      return
    }
    await run({ kind: 'moveLesson', id: lesson.id, position })
  }

  if (!supabase || !tenantId) return <EmptyState title={t('teacherCommon.connect')} />
  if (query.isPending) return <Skeleton className="h-64" />
  if (query.isError || !data || !version) {
    return (
      <Card>
        <p role="alert">{readableError(query.error)}</p>
        <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }

  return (
    <section className="grid gap-5">
      <Link to={{ pathname: '/docente/cursos', search }} className="min-h-11 text-brand underline">
        {t('teacherCommon.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{version.title}</h1>
          <Badge status={version.status === 'draft' ? 'warning' : 'success'}>
            {version.status === 'draft' ? t('teacherCommon.draft') : t('teacherCommon.published')}
          </Badge>
        </div>
        {editable ? (
          <Button disabled={mutation.isPending} onClick={() => void run({
            kind: 'publish', versionId: version.id,
          })}>{t('teacherCourses.publish')}</Button>
        ) : data.canEdit && version.status !== 'draft' ? (
          <div className="flex flex-wrap gap-2">
            {liveEditable && (
              <Button variant={contentMode ? 'primary' : 'secondary'}
                onClick={() => setContentMode((current) => !current)}>
                {contentMode ? t('teacherCourses.stopEditContent') : t('teacherCourses.editContent')}
              </Button>
            )}
            <Button variant="secondary" disabled={mutation.isPending ||
              data.versions.some((item) => item.status === 'draft')}
              onClick={() => void run({ kind: 'draft', versionId: version.id })}>
              {t('teacherCourses.newDraft')}
            </Button>
          </div>
        ) : null}
      </div>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="course-version">
        {t('teacherCourses.chooseVersion')}
        <select id="course-version" value={version.id}
          onChange={(event) => setVersionId(event.target.value)}
          className="min-h-11 rounded-control border border-border bg-surface px-3 focus-visible:outline-3">
          {data.versions.map((item) => (
            <option key={item.id} value={item.id}>
              {t('teacherCourses.version', { number: item.version_number })} · {item.status}
            </option>
          ))}
        </select>
      </label>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {contentEditable && (
        <p role="note" className="rounded-control border border-border p-3 text-sm">
          {t('teacherCourses.editContentHint')}
        </p>
      )}
      <Card className="grid gap-4">
        <h2 className="text-lg font-bold">{t('teacherCourses.publishChecklist')}</h2>
        <p>{modules.some((module) => data.lessons.some((lesson) => lesson.module_id === module.id))
          ? t('teacherCourses.checkReady')
          : t('teacherCourses.checkMissing')}</p>
      </Card>
      {modules.length === 0 && <EmptyState title={t('teacherCourses.noModules')} />}
      <div className="grid gap-4">
        {modules.map((module, index) => {
          const siblings = data.lessons.filter((lesson) => lesson.module_id === module.id)
          return (
            <ModuleEditor key={`${module.id}:${module.title}`} module={module}
              lessons={siblings} editable={editable} contentEditable={contentEditable}
              pending={mutation.isPending}
              onRename={(title) => void run({ kind: 'renameModule', id: module.id, title })}
              onDelete={() => void run({
                kind: 'deleteModule', id: module.id, versionId: version.id,
              })}
              onMove={(direction) => void moveModule(module, index, direction)}
              canUp={index > 0} canDown={index < modules.length - 1}
              onAddLesson={(lessonType) => void run({
                kind: 'addLesson', versionId: version.id, moduleId: module.id,
                title: t('teacherCourses.newLesson'),
                position: (siblings.at(-1)?.position ?? 0) + 1,
                lessonType,
              })}
              onSaveLesson={(lesson, title, content) => void run({
                kind: 'saveLesson', id: lesson.id, title, content,
              })}
              onDeleteLesson={(lesson) => void run({ kind: 'deleteLesson', id: lesson.id })}
              onMoveLesson={(lesson, lessonIndex, direction) =>
                void moveLesson(lesson, siblings, lessonIndex, direction)}
            />
          )
        })}
      </div>
      {editable && (
        <Button disabled={mutation.isPending} onClick={() => void run({
          kind: 'addModule', versionId: version.id,
          title: t('teacherCourses.newModule'),
          position: (modules.at(-1)?.position ?? 0) + 1,
        })}>{t('teacherCourses.addModule')}</Button>
      )}
      <ActivitiesPanel tenantId={tenantId} versionId={version.id} editable={editable} />
    </section>
  )
}

function ModuleEditor({
  module, lessons, editable, contentEditable, pending, onRename, onDelete, onMove,
  canUp, canDown, onAddLesson, onSaveLesson, onDeleteLesson, onMoveLesson,
}: {
  module: Module
  lessons: Lesson[]
  editable: boolean
  contentEditable: boolean
  pending: boolean
  onRename: (title: string) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
  canUp: boolean
  canDown: boolean
  onAddLesson: (lessonType: 'reading' | 'quiz' | 'assignment') => void
  onSaveLesson: (lesson: Lesson, title: string, content: Lesson['content']) => void
  onDeleteLesson: (lesson: Lesson) => void
  onMoveLesson: (lesson: Lesson, index: number, direction: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(module.title)
  return (
    <Card className="grid gap-4">
      <h2 className="font-bold">{module.title}</h2>
      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t('teacherCourses.moduleTitle')} value={title}
            onChange={(event) => setTitle(event.target.value)} />
          <Button disabled={pending || !title.trim()} onClick={() => onRename(title.trim())}>
            {t('teacherCommon.save')}
          </Button>
          <Button variant="secondary" disabled={pending || !canUp}
            onClick={() => onMove(-1)} aria-label={t('teacherCommon.up')}>↑</Button>
          <Button variant="secondary" disabled={pending || !canDown}
            onClick={() => onMove(1)} aria-label={t('teacherCommon.down')}>↓</Button>
          <Button variant="destructive" disabled={pending}
            onClick={() => {
              if (window.confirm(t('teacherCourses.confirmDeleteModule'))) onDelete()
            }}>{t('teacherCommon.delete')}</Button>
        </div>
      )}
      <div className="grid gap-3">
        {lessons.map((lesson, index) => (
          <LessonEditor key={`${lesson.id}:${lesson.title}`} lesson={lesson}
            versionId={module.version_id}
            editable={editable} contentEditable={contentEditable} pending={pending}
            canUp={index > 0} canDown={index < lessons.length - 1}
            onSave={(newTitle, content) => onSaveLesson(lesson, newTitle, content)}
            onDelete={() => onDeleteLesson(lesson)}
            onMove={(direction) => onMoveLesson(lesson, index, direction)}
          />
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => onAddLesson('reading')}>
            {t('teacherCourses.addLesson')}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => onAddLesson('quiz')}>
            {t('activitiesAuthoring.addQuizLesson')}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => onAddLesson('assignment')}>
            {t('activitiesAuthoring.addAssignmentLesson')}
          </Button>
        </div>
      )}
    </Card>
  )
}

function activityId(lesson: Lesson): string | null {
  const c = lesson.content
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  const value = lesson.type === 'quiz' ? c.assessment_id : c.assignment_id
  return typeof value === 'string' ? value : null
}

function LessonEditor({
  lesson, versionId, editable, contentEditable, pending, canUp, canDown, onSave, onDelete, onMove,
}: {
  lesson: Lesson
  versionId: string
  editable: boolean
  contentEditable: boolean
  pending: boolean
  canUp: boolean
  canDown: boolean
  onSave: (title: string, content: Lesson['content']) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(lesson.title)
  const initialText = readingText(lesson.content)
  const [text, setText] = useState(initialText ?? '')
  const canEditContent = (editable || contentEditable)
    && lesson.type === 'reading' && initialText !== null

  return (
    <div className="grid gap-3 rounded-control border border-border p-4">
      <h3 className="font-semibold">{lesson.title}</h3>
      {lesson.type === 'quiz' || lesson.type === 'assignment' ? (
        <>
          {editable && (
            <>
              <Input label={t('teacherCourses.lessonTitle')} value={title}
                onChange={(event) => setTitle(event.target.value)} />
              <Button className="w-fit" disabled={pending || !title.trim()}
                onClick={() => onSave(title.trim(), lesson.content)}>
                {t('teacherCommon.save')}
              </Button>
            </>
          )}
          <LessonActivityPicker versionId={versionId} lessonId={lesson.id} lessonTitle={lesson.title}
            type={lesson.type} value={activityId(lesson)} editable={editable} />
        </>
      ) : canEditContent ? (
        <>
          <Input label={t('teacherCourses.lessonTitle')} value={title}
            onChange={(event) => setTitle(event.target.value)} />
          <label className="grid gap-1 text-sm font-semibold" htmlFor={`content-${lesson.id}`}>
            {t('teacherCourses.content')}
          </label>
          {/* TODO: sustituir el textarea por TipTap cuando exista el editor enriquecido. */}
          <textarea id={`content-${lesson.id}`} value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-32 rounded-control border border-border bg-surface p-3 focus-visible:outline-3" />
          <Button disabled={pending || !title.trim()}
            onClick={() => onSave(title.trim(), { text })}>{t('teacherCommon.save')}</Button>
        </>
      ) : (
        <LessonContent content={lesson.content} />
      )}
      <LessonResources lessonId={lesson.id} tenantId={lesson.tenant_id}
        versionId={lesson.version_id} editable={editable || contentEditable} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending || !canUp}
            onClick={() => onMove(-1)} aria-label={t('teacherCommon.up')}>↑</Button>
          <Button variant="secondary" disabled={pending || !canDown}
            onClick={() => onMove(1)} aria-label={t('teacherCommon.down')}>↓</Button>
          <Button variant="destructive" disabled={pending}
            onClick={() => {
              if (window.confirm(t('teacherCourses.confirmDeleteLesson'))) onDelete()
            }}>{t('teacherCommon.delete')}</Button>
        </div>
      )}
    </div>
  )
}
