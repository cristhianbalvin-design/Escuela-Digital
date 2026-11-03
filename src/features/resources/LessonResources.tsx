import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Skeleton } from '@/components/ui'
import {
  openResource, useDeleteResource, useLessonResources, useUploadResources,
} from './resources-api'
import {
  ALLOWED_EXTENSIONS, fileProblem, formatBytes, MAX_RESOURCE_BYTES,
} from './resources-utils'

type Props = {
  lessonId: string
  editable: boolean
  /** Solo hacen falta para subir archivos (modo docente). */
  tenantId?: string
  versionId?: string
}

export function LessonResources({ lessonId, tenantId, versionId, editable }: Props) {
  const { t } = useTranslation()
  const list = useLessonResources(lessonId)
  const upload = useUploadResources({
    tenantId: tenantId ?? '', versionId: versionId ?? '', lessonId,
  })
  const remove = useDeleteResource(lessonId)
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
      await upload.mutateAsync(picked)
      setMessage(t('resources.uploaded', { count: picked.length }))
    } catch {
      setMessage(t('resources.uploadError'))
    }
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

  return (
    <section className="grid gap-2" aria-label={t('resources.title')}>
      <h4 className="text-sm font-semibold">{t('resources.title')}</h4>
      {list.isError && <p role="alert" className="text-sm text-error">{t('resources.loadError')}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('resources.empty')}</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {items.map((item) => (
            <li key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2">
              <span className="min-w-0 break-words">
                {item.name}
                {item.size_bytes !== null && (
                  <span className="text-text-muted"> · {formatBytes(item.size_bytes)}</span>
                )}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" onClick={() => void onOpen(item.storage_path)}>
                  {t('resources.download')}
                </Button>
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
          ))}
        </ul>
      )}
      {editable && (
        <div className="grid gap-1">
          <input ref={input} type="file" multiple className="sr-only"
            id={`resource-input-${lessonId}`}
            accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
            onChange={(event) => void onPick(event.target.files)} />
          <Button variant="secondary" className="w-fit" disabled={upload.isPending}
            onClick={() => input.current?.click()}>
            {upload.isPending ? t('resources.uploading') : t('resources.add')}
          </Button>
          <p className="text-xs text-text-muted">
            {t('resources.hint', { max: Math.round(MAX_RESOURCE_BYTES / (1024 * 1024)) })}
          </p>
        </div>
      )}
      <span role="status" className="text-sm">{message}</span>
    </section>
  )
}
