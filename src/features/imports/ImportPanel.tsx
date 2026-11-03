import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'
import { useOfferingDimensions } from '@/features/offerings/grading/dimensions-api'
import { useImportParticipants, type ImportResult } from './import-api'
import {
  buildPreview, buildTemplate, MAX_IMPORT_ROWS, parseCsv,
  type ImportDimension, type ParsedImport,
} from './import-utils'

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function ImportPanel({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const dimensionsQuery = useOfferingDimensions(offeringId)
  const run = useImportParticipants(offeringId)
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [error, setError] = useState('')

  const dimensions: ImportDimension[] = (dimensionsQuery.data?.dimensions ?? [])
    .map((d) => ({ id: d.id, name: d.name, kind: d.kind }))

  async function onFile(file: File | undefined) {
    setResults(null)
    setError('')
    setParsed(null)
    if (!file) return
    setFileName(file.name)
    if (file.size > 1_000_000) { setError(t('import.tooBig')); return }
    const next = buildPreview(parseCsv(await file.text()), dimensions)
    if (next.rows.length > MAX_IMPORT_ROWS) { setError(t('import.tooMany', { max: MAX_IMPORT_ROWS })); return }
    setParsed(next)
  }

  const valid = parsed?.rows.filter((row) => row.errors.length === 0) ?? []
  const invalid = parsed?.rows.filter((row) => row.errors.length > 0) ?? []

  function describeError(code: string): string {
    if (code === 'email') return t('import.errEmail')
    if (code === 'duplicate') return t('import.errDuplicate')
    if (code === 'duplicateName') return t('import.errDuplicateName')
    if (code === 'identity') return t('import.errIdentity')
    if (code.startsWith('score:')) return t('import.errScore', { name: code.slice(6) })
    return code
  }

  async function start() {
    setError('')
    setProgress(0)
    try {
      setResults(await run.mutateAsync({ rows: valid, onProgress: setProgress }))
      setParsed(null)
      setFileName('')
      if (input.current) input.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('import.failed'))
    }
  }

  const failed = results?.filter((r) => r.status === 'error') ?? []
  const okCount = (results?.length ?? 0) - failed.length

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="text-lg font-bold">{t('import.title')}</h2>
        <p className="text-sm text-text-muted">{t('import.hint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => download('plantilla-participantes.csv', buildTemplate(dimensions))}>
          {t('import.template')}
        </Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border px-4 font-semibold">
          {t('import.choose')}
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        {fileName && <span className="self-center text-sm">{fileName}</span>}
      </div>
      {error && <p role="alert">{error}</p>}
      {parsed?.problem === 'empty' && <p role="alert">{t('import.empty')}</p>}
      {parsed?.problem === 'noEmail' && <p role="alert">{t('import.noEmail')}</p>}
      {parsed && !parsed.problem && (
        <div className="grid gap-3">
          <p aria-live="polite">{t('import.summary', { valid: valid.length, invalid: invalid.length })}</p>
          {parsed.ignoredColumns.length > 0 && (
            <p className="text-sm text-text-muted">{t('import.ignored', { columns: parsed.ignoredColumns.join(', ') })}</p>
          )}
          {invalid.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {invalid.slice(0, 20).map((row) => (
                <li key={row.line}>{t('import.line', { line: row.line })}: {row.errors.map(describeError).join('; ')}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-text-muted">{t('import.noEmailNote')}</p>
          <Button className="w-fit" disabled={valid.length === 0 || run.isPending} onClick={() => void start()}>
            {run.isPending ? t('import.running', { done: progress, total: valid.length })
              : t('import.run', { count: valid.length })}
          </Button>
        </div>
      )}
      {results && (
        <div className="grid gap-2" aria-live="polite">
          <p className="font-semibold">{t('import.done', { ok: okCount, failed: failed.length })}</p>
          {failed.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {failed.map((r) => <li key={r.email}>{r.email}: {r.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
