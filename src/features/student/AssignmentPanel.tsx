import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card } from '@/components/ui'
import {
  createSignedUrl,
  uploadSubmissionFile,
  useAssignmentInfo,
  useSubmitAssignment,
  type SubmissionFile,
  type UploadedSubmissionFile,
} from './activities-api'
import {
  displayFileName,
  formatActivityDate,
  gradeLabel,
  sanitizeFileName,
  scoreLabel,
  validateFile,
} from './activities-utils'

export type AssignmentPanelProps = {
  enrollmentId: string
  assignmentId: string
  timezone?: string
}

const MAX_FILES = 5

type FormValues = { text: string; link: string }

function SubmittedFiles({ files }: { files: SubmissionFile[] }) {
  const { t } = useTranslation()
  const [error, setError] = useState(false)
  async function open(path: string) {
    setError(false)
    try {
      window.open(await createSignedUrl(path), '_blank', 'noopener,noreferrer')
    } catch {
      setError(true)
    }
  }
  if (files.length === 0) return null
  return (
    <div>
      <p className="font-semibold">{t('activities.files')}</p>
      <ul className="grid gap-1">
        {files.map((f) => (
          <li key={f.path}>
            <button type="button" onClick={() => void open(f.path)}
              className="min-h-11 text-left text-brand underline focus-visible:outline-3">
              {displayFileName(f.name)}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-error">{t('activities.fileOpenError')}</p>}
    </div>
  )
}

export function AssignmentPanel({
  enrollmentId, assignmentId, timezone,
}: AssignmentPanelProps) {
  const { t } = useTranslation()
  const info = useAssignmentInfo(enrollmentId, assignmentId)
  const submit = useSubmitAssignment(enrollmentId, assignmentId)
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [replacing, setReplacing] = useState(false)

  const types = info.data?.submission_types
  const allowsText = types?.includes('text') ?? false
  const allowsLink = types?.includes('link') ?? false
  const allowsFile = types?.includes('file') ?? false

  const schema = useMemo(() => z.object({
    text: z.string().max(20000),
    link: z.string().max(2000).refine(
      (v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'invalid_link',
    ),
  }), [])
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text: '', link: '' },
  })

  if (info.isPending) return <Card aria-busy="true">{t('activities.loading')}</Card>
  if (info.isError || !info.data) {
    return (
      <Card role="alert">
        <p>{t('activities.loadError')}</p>
        <Button className="mt-3" onClick={() => void info.refetch()}>
          {t('activities.retry')}
        </Button>
      </Card>
    )
  }
  const data = info.data
  const sub = data.submission
  const due = formatActivityDate(data.due_at, timezone)
  const showForm = data.can_submit && (!sub || replacing)

  function pick(list: FileList | null) {
    setFileError(null)
    if (!list) return
    const next = [...files]
    for (const f of Array.from(list)) {
      const problem = validateFile(f)
      if (problem) { setFileError(t(`activities.errors.${problem}`)); continue }
      if (next.length >= MAX_FILES) {
        setFileError(t('activities.errors.too_many_files', { max: MAX_FILES }))
        break
      }
      next.push(f)
    }
    setFiles(next)
  }

  async function onSubmit(values: FormValues) {
    setFailed(false)
    const text = values.text.trim()
    const link = values.link.trim()
    if (!text && !link && files.length === 0) {
      setFailed(true)
      return
    }
    setBusy(true)
    try {
      const uploaded: UploadedSubmissionFile[] = []
      for (const f of files) {
        const renamed = new File([f], sanitizeFileName(f.name), { type: f.type })
        uploaded.push(await uploadSubmissionFile(data.storage_prefix, renamed))
      }
      await submit.mutateAsync({
        text: text || undefined,
        link: link || undefined,
        files: uploaded.map((u) => u.path),
      })
      setFiles([])
      form.reset()
      setReplacing(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const rubric = data.rubric
  const scores = sub?.rubric_scores ?? []

  return (
    <Card className="grid gap-4">
      <h2 className="text-xl font-bold">{data.title}</h2>
      {data.instructions && <p className="whitespace-pre-line">{data.instructions}</p>}
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-text-muted">{t('activities.maxScore')}</dt>
          <dd>{data.max_score}</dd>
        </div>
        {due && (
          <div>
            <dt className="text-sm text-text-muted">{t('activities.dueAt')}</dt>
            <dd>{due}</dd>
          </div>
        )}
        {data.allow_late && data.late_penalty_pct > 0 && (
          <div>
            <dt className="text-sm text-text-muted">{t('activities.latePenalty')}</dt>
            <dd>{data.late_penalty_pct}%</dd>
          </div>
        )}
      </dl>

      {rubric && (
        <div className="overflow-x-auto">
          <h3 className="font-semibold">{t('activities.rubric')}: {rubric.title}</h3>
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">{rubric.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2">{t('activities.criterion')}</th>
                <th scope="col" className="p-2">{t('activities.levels')}</th>
              </tr>
            </thead>
            <tbody>
              {rubric.criteria.map((c) => {
                const s = scores.find((x) => x.criterion_id === c.id)
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <th scope="row" className="p-2">{c.title}</th>
                    <td className="p-2">
                      <ul className="grid gap-1">
                        {c.levels.map((l) => (
                          <li key={l.id}
                            className={s?.level_id === l.id ? 'font-bold' : undefined}>
                            {l.label} ({l.points}): {l.descriptor}
                          </li>
                        ))}
                      </ul>
                      {s && s.comment && <p className="mt-1">{s.comment}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {sub && (
        <div className="grid gap-2 rounded-control border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={sub.status === 'graded' ? 'success' : 'info'}>
              {t(`activities.submissionStatus.${sub.status}`)}
            </Badge>
            {sub.is_late && <Badge status="warning">{t('activities.late')}</Badge>}
          </div>
          <p className="text-sm text-text-muted">
            {t('activities.submittedAt')}: {formatActivityDate(sub.submitted_at, timezone)}
          </p>
          {sub.text && <p className="whitespace-pre-line">{sub.text}</p>}
          {sub.link && (
            <a href={sub.link} target="_blank" rel="noopener noreferrer"
              className="text-brand underline">{sub.link}</a>
          )}
          <SubmittedFiles files={sub.files} />
          {sub.status === 'graded' && sub.score !== null && (
            <p className="text-lg font-semibold">
              {t('activities.score')}: {scoreLabel(sub.score, data.max_score)}
              {' · '}{t('activities.grade')}: {gradeLabel(
                (sub.score / data.max_score) * 20)}
            </p>
          )}
          {sub.feedback && (
            <p>{t('activities.feedback')}: {sub.feedback}</p>
          )}
          {data.can_submit && !replacing && (
            <Button variant="secondary" className="w-fit"
              onClick={() => setReplacing(true)}>
              {t('activities.resubmit')}
            </Button>
          )}
        </div>
      )}

      {!data.can_submit && data.reason && !sub && (
        <p role="status">{t(`activities.assignmentReasons.${data.reason}`)}</p>
      )}

      {showForm && (
        <form className="grid gap-4" noValidate
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
          {allowsText && (
            <div className="grid gap-1">
              <label htmlFor="asg-text" className="font-semibold">
                {t('activities.textAnswer')}
              </label>
              <textarea id="asg-text" rows={6}
                className="rounded-control border border-border bg-surface p-3"
                {...form.register('text')} />
            </div>
          )}
          {allowsLink && (
            <div className="grid gap-1">
              <label htmlFor="asg-link" className="font-semibold">
                {t('activities.linkAnswer')}
              </label>
              <input id="asg-link" type="url" inputMode="url"
                placeholder="https://"
                className="min-h-11 rounded-control border border-border bg-surface px-3"
                aria-invalid={!!form.formState.errors.link}
                {...form.register('link')} />
              {form.formState.errors.link && (
                <p role="alert" className="text-error">{t('activities.errors.invalid_link')}</p>
              )}
            </div>
          )}
          {allowsFile && (
            <div className="grid gap-2">
              <label htmlFor="asg-files" className="font-semibold">
                {t('activities.fileAnswer', { max: MAX_FILES })}
              </label>
              <input id="asg-files" type="file" multiple
                accept=".pdf,.doc,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip"
                onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
              {fileError && <p role="alert" className="text-error">{fileError}</p>}
              <ul className="grid gap-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <span>{f.name}</span>
                    <Button variant="ghost" aria-label={t('activities.removeFile', { name: f.name })}
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      {t('activities.remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {failed && <p role="alert" className="text-error">{t('activities.submitAssignmentError')}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('activities.sending') : t('activities.sendAssignment')}
            </Button>
            {replacing && (
              <Button variant="secondary" onClick={() => setReplacing(false)}>
                {t('activities.cancel')}
              </Button>
            )}
          </div>
        </form>
      )}
    </Card>
  )
}
