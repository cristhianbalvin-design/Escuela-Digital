import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Skeleton } from '@/components/ui'
import {
  openResource, useDeleteResource, useLessonResources, useOfferingResourceMarks,
  useRenameResource, useReplaceResource, useSetResourceAudience, useSetResourceMark,
  useUploadResources,
} from './resources-api'
import {
  ALLOWED_EXTENSIONS, fileProblem, formatBytes, formatMarkDate, isPastDate, markProgress,
  MAX_NAME_LENGTH, MAX_RESOURCE_BYTES, renamedFile, stateOf, toggleMark,
  type Audience, type LessonResource, type ResourceMark,
} from './resources-utils'

/** Seguimiento por edición: casillas "Enviado" y "Usado en clase" (solo equipo docente). */
export type ResourceTracking = {
  offeringId: string
  closed: boolean
  pendingOnly: boolean
  sessionDate?: string | null
}

type Props = {
  lessonId: string
  editable: boolean
  /** Solo hacen falta para subir archivos (modo docente). */
  tenantId?: string
  versionId?: string
  tracking?: ResourceTracking
}

export function LessonResources({ lessonId, tenantId, versionId, editable, tracking }: Props) {
  const { t } = useTranslation()
  const list = useLessonResources(lessonId)
  const upload = useUploadResources({
    tenantId: tenantId ?? '', versionId: versionId ?? '', lessonId,
  })
  const remove = useDeleteResource(lessonId)
  const target = { tenantId: tenantId ?? '', versionId: versionId ?? '', lessonId }
  const rename = useRenameResource(lessonId)
  const setAudience = useSetResourceAudience(lessonId)
  const replace = useReplaceResource(target)
  const replaceInput = useRef<HTMLInputElement>(null)
  const [replaceTarget, setReplaceTarget] = useState<LessonResource | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [uploadAudience, setUploadAudience] = useState<Audience>('students')
  const marksQuery = useOfferingResourceMarks(tracking?.offeringId)
  const setMark = useSetResourceMark(tracking?.offeringId ?? '')
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  async function onPick(files: FileList | null) {
    setMessage('')
    if (!editable || !tenantId || !versionId) return
    const picked = Array.from(files ?? [])
    if (input.current) input.current.value = ''
    if (picked.length === 0) return
    for (const file of picked) {
      const problem = fileProblem(file)
      if (problem) {
        setMessage(t(`resources.problem.${problem}`, {
          name: file.name, max: Math.round(MAX_RESOURCE_BYTES / (1024 * 1024)),
        }))
        return
      }
    }
    try {
      await upload.mutateAsync({ files: picked, audience: uploadAudience })
      setMessage(t('resources.uploaded', { count: picked.length }))
    } catch {
      setMessage(t('resources.uploadError'))
    }
  }

  async function onReplace(files: FileList | null) {
    setMessage('')
    const file = files?.[0]
    const resource = replaceTarget
    if (replaceInput.current) replaceInput.current.value = ''
    setReplaceTarget(null)
    if (!file || !resource || !editable || !tenantId || !versionId) return
    const problem = fileProblem(file)
    if (problem) {
      setMessage(t(`resources.problem.${problem}`, {
        name: file.name, max: Math.round(MAX_RESOURCE_BYTES / (1024 * 1024)),
      }))
      return
    }
    try {
      await replace.mutateAsync({ resource, file })
      setMessage(t('resources.replaced', { name: file.name }))
    } catch {
      setMessage(t('resources.replaceError'))
    }
  }

  function saveRename(resource: LessonResource) {
    if (!renaming) return
    const name = renamedFile(resource.name, renaming.value)
    if (!name) return
    setMessage('')
    if (name === resource.name) {
      setRenaming(null)
      return
    }
    rename.mutate({ id: resource.id, name }, {
      onSuccess: () => setRenaming(null),
      onError: () => setMessage(t('resources.renameError')),
    })
  }

  async function onOpen(path: string) {
    setMessage('')
    try {
      await openResource(path)
    } catch {
      setMessage(t('resources.openError'))
    }
  }

  if (list.isPending) return <Skeleton className="h-10" />
  const items = list.data ?? []
  if (!editable && items.length === 0) return null
  const marks = new Map<string, ResourceMark>(
    (marksQuery.data ?? []).map((mark) => [mark.resource_id, mark]),
  )
  const forStudents = items.filter((item) => item.audience === 'students')
  const progress = markProgress(forStudents.map((item) => item.id), marks)
  const visible = tracking?.pendingOnly
    ? items.filter((item) => item.audience === 'teachers' || !stateOf(marks.get(item.id)).used)
    : items
  const overdue = !!tracking && isPastDate(tracking.sessionDate) && forStudents.length > 0 && !progress.done
  const staffView = editable || !!tracking

  function onToggle(resourceId: string, field: 'shared' | 'used', checked: boolean) {
    if (!tracking) return
    setMessage('')
    setMark.mutate(
      { resourceId, state: toggleMark(stateOf(marks.get(resourceId)), field, checked) },
      { onError: () => setMessage(t('resources.markError')) },
    )
  }

  return (
    <section className="grid gap-2" aria-label={t('resources.title')}>
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {t('resources.title')}
        {tracking && progress.total > 0 && (
          <span className="text-xs font-normal text-text-muted">
            {progress.done && '✓ '}
            {t('resources.progress', {
              shared: progress.shared, used: progress.used, total: progress.total,
            })}
          </span>
        )}
      </h4>
      {overdue && (
        <p className="text-sm text-warning">{t('resources.overdue')}</p>
      )}
      {tracking && marksQuery.isError && (
        <p role="alert" className="text-sm text-error">{t('resources.marksLoadError')}</p>
      )}
      {list.isError && <p role="alert" className="text-sm text-error">{t('resources.loadError')}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('resources.empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-text-muted">{t('resources.allUsed')}</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {visible.map((item) => {
            const mark = marks.get(item.id)
            const state = stateOf(mark)
            return (
            <li key={item.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-border px-3 py-2">
              {renaming?.id === item.id ? (
                <span className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-2">
                  <input type="text" autoFocus maxLength={MAX_NAME_LENGTH}
                    aria-label={t('resources.rename')}
                    className="min-w-0 flex-1 basis-40 rounded-control border border-border bg-transparent px-2 py-1"
                    value={renaming.value}
                    onChange={(event) => setRenaming({ id: item.id, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveRename(item)
                      if (event.key === 'Escape') setRenaming(null)
                    }} />
                  <Button variant="secondary" disabled={rename.isPending}
                    onClick={() => saveRename(item)}>{t('resources.saveName')}</Button>
                  <Button variant="secondary" onClick={() => setRenaming(null)}>
                    {t('resources.cancel')}
                  </Button>
                </span>
              ) : (
                <span className="min-w-0 flex-1 basis-56 break-words">
                  {item.name}
                  {item.size_bytes !== null && (
                    <span className="text-text-muted"> · {formatBytes(item.size_bytes)}</span>
                  )}
                  {staffView && item.audience === 'teachers' && (
                    <span className="ml-2 rounded-control border border-border px-2 py-0.5 text-xs">
                      {t('resources.teachersOnly')}
                    </span>
                  )}
                </span>
              )}
              {tracking && item.audience === 'students' && (
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <label className="flex w-36 items-center gap-2">
                    <input type="checkbox" className="size-4" checked={state.shared}
                      disabled={tracking.closed || marksQuery.isPending}
                      onChange={(event) => onToggle(item.id, 'shared', event.target.checked)} />
                    <span>
                      {t('resources.shared')}
                      {mark?.shared_at && (
                        <span className="text-text-muted"> {formatMarkDate(mark.shared_at)}</span>
                      )}
                    </span>
                  </label>
                  <label className="flex w-48 items-center gap-2">
                    <input type="checkbox" className="size-4" checked={state.used}
                      disabled={tracking.closed || marksQuery.isPending}
                      onChange={(event) => onToggle(item.id, 'used', event.target.checked)} />
                    <span>
                      {t('resources.used')}
                      {mark?.used_at && (
                        <span className="text-text-muted"> {formatMarkDate(mark.used_at)}</span>
                      )}
                    </span>
                  </label>
                </span>
              )}
              <span className="ml-auto flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void onOpen(item.storage_path)}>
                  {t('resources.download')}
                </Button>
                {editable && renaming?.id !== item.id && (
                  <>
                    <Button variant="secondary"
                      onClick={() => setRenaming({ id: item.id, value: item.name })}>
                      {t('resources.rename')}
                    </Button>
                    <Button variant="secondary" disabled={replace.isPending}
                      onClick={() => {
                        setReplaceTarget(item)
                        replaceInput.current?.click()
                      }}>
                      {replace.isPending && replaceTarget?.id === item.id
                        ? t('resources.uploading') : t('resources.replace')}
                    </Button>
                    <Button variant="secondary" disabled={setAudience.isPending}
                      onClick={() => setAudience.mutate({
                        id: item.id,
                        audience: item.audience === 'students' ? 'teachers' : 'students',
                      }, { onError: () => setMessage(t('resources.audienceError')) })}>
                      {item.audience === 'students'
                        ? t('resources.makeTeachersOnly') : t('resources.shareWithStudents')}
                    </Button>
                  </>
                )}
                {editable && (
                  <Button variant="destructive" disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t('resources.confirmDelete', { name: item.name }))) {
                        remove.mutate(item, {
                          onError: () => setMessage(t('resources.deleteError')),
                        })
                      }
                    }}>
                    {t('teacherCommon.delete')}
                  </Button>
                )}
              </span>
            </li>
            )
          })}
        </ul>
      )}
      {editable && (
        <div className="grid gap-1">
          <input ref={input} type="file" multiple className="sr-only"
            id={`resource-input-${lessonId}`}
            accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
            onChange={(event) => void onPick(event.target.files)} />
          <input ref={replaceInput} type="file" className="sr-only"
            id={`resource-replace-${lessonId}`} tabIndex={-1}
            accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
            onChange={(event) => void onReplace(event.target.files)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="w-fit" disabled={upload.isPending}
              onClick={() => input.current?.click()}>
              {upload.isPending ? t('resources.uploading') : t('resources.add')}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">{t('resources.uploadAs')}</span>
              <select value={uploadAudience}
                onChange={(event) => setUploadAudience(event.target.value as Audience)}
                className="rounded-control border border-border bg-transparent px-2 py-1">
                <option value="students">{t('resources.forStudents')}</option>
                <option value="teachers">{t('resources.teachersOnly')}</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-text-muted">
            {t('resources.hint', { max: Math.round(MAX_RESOURCE_BYTES / (1024 * 1024)) })}
          </p>
        </div>
      )}
      <span role="status" className="text-sm">{message}</span>
    </section>
  )
}
