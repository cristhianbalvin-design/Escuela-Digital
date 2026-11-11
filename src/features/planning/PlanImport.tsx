import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { emptyResource, itemSchema, kinds, parsePlanRows, parsePlanTable, type PlanItem, type PlanTableResult } from './planning-utils'

const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-2'
export function PlanImport({ onApply }: { onApply: (items: PlanItem[], replace: boolean) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(''); const [preview, setPreview] = useState<PlanTableResult | null>(null)
  const [useSchedule, setUseSchedule] = useState(true); const [error, setError] = useState(''); const [sessionMinutes, setSessionMinutes] = useState('')
  function show(result: PlanTableResult) {
    if (result.rows.length + result.ignored.length > 500) { setError(t('planning.importTooMany')); setPreview(null); return }
    setPreview(result); setUseSchedule(result.hasSchedule); setError('')
  }
  async function upload(file: File) {
    setPreview(null); setError('')
    if (file.size > 2 * 1024 * 1024 || file.size === 0) { setError(t('planning.importSize')); return }
    try {
      if (/\.csv$/i.test(file.name)) show(parsePlanTable(await file.text()))
      else if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser')
        const rows = await readSheet(file, 1)
        show(parsePlanRows(rows.map((row) => row.map((cell) => cell === null ? '' : cell instanceof Date ? `${String(cell.getUTCHours()).padStart(2, '0')}:${String(cell.getUTCMinutes()).padStart(2, '0')}` : String(cell)))))
      } else setError(t('planning.importFormat'))
    } catch { setError(t('planning.importFileError')) }
  }
  function update(index: number, changes: Partial<PlanItem>) {
    if (!preview) return
    setPreview({ ...preview, rows: preview.rows.map((row, i) => i === index ? { ...row, item: { ...row.item, ...changes } } : row) })
  }
  const valid = preview?.rows.length && preview.rows.every(({ item }) => itemSchema.safeParse({ ...item, starts_at: useSchedule ? item.starts_at : null }).success)
  const total = preview?.rows.reduce((sum, row) => sum + (Number.isFinite(row.item.minutes) ? row.item.minutes ?? 0 : 0), 0) ?? 0
  return <section className="grid gap-3 rounded-control border border-border p-3"><h5 className="font-semibold">{t('planning.importTitle')}</h5>
    <label>{t('planning.importLabel')}<textarea className={field} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('planning.importPlaceholder')} /></label>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => show(parsePlanTable(text))}>{t('planning.preview')}</Button><label className="grid gap-1">{t('planning.importUpload')}<input className={field} type="file" accept=".xlsx,.csv" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file) }} /></label></div>
    {error && <p role="alert">{error}</p>}
    {preview && <><p>{t('planning.ignoredRows', { rows: preview.ignored.join(', ') || '—' })}</p>
      {preview.hasSchedule && <label className="flex items-center gap-2"><input type="checkbox" checked={useSchedule} onChange={(e) => setUseSchedule(e.target.checked)} />{useSchedule ? t('planning.useTableTime') : t('planning.useSessionTime')}</label>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr>{['row', 'activity', 'minutes', 'type', 'notes', 'resource', 'startTime'].map((key) => <th key={key} scope="col" className="p-1">{t(`planning.${key}`)}</th>)}</tr></thead><tbody>{preview.rows.map(({ line, item }, index) => {
        const validation = itemSchema.safeParse({ ...item, starts_at: useSchedule ? item.starts_at : null }); const invalid = !validation.success
        const errorFor = (key: string) => !validation.success && validation.error.issues.some((issue) => issue.path[0] === key)
        return <tr key={item.id} className={invalid ? 'border border-border bg-surface-elevated' : ''}><td className="p-1">{line}{invalid && <span className="block text-sm">{t('planning.rowInvalid')}</span>}</td>
          <td className="p-1"><input aria-label={`${t('planning.activity')} ${line}`} aria-invalid={errorFor('title')} className={field} value={item.title} onChange={(e) => update(index, { title: e.target.value })} /></td>
          <td className="p-1"><input aria-label={`${t('planning.minutes')} ${line}`} aria-invalid={errorFor('minutes')} className={field} type="number" min="1" max="1440" value={item.minutes === null || Number.isNaN(item.minutes) ? '' : item.minutes} onChange={(e) => update(index, { minutes: e.target.value ? Number(e.target.value) : null })} /></td>
          <td className="p-1"><select aria-label={`${t('planning.type')} ${line}`} className={field} value={item.kind} onChange={(e) => { const kind = kinds.find((k) => k === e.target.value); if (kind) update(index, { kind }) }}>{kinds.map((kind) => <option key={kind} value={kind}>{t(`planning.kinds.${kind}`)}</option>)}</select></td>
          <td className="p-1"><textarea aria-label={`${t('planning.notes')} ${line}`} aria-invalid={errorFor('notes')} className={field} value={item.notes} onChange={(e) => update(index, { notes: e.target.value })} /></td>
          <td className="p-1"><input aria-label={`${t('planning.resource')} ${line}`} aria-invalid={errorFor('resource')} className={field} value={item.resource ?? ''} onChange={(e) => update(index, { resource: e.target.value || null })} /></td>
          <td className="p-1"><input aria-label={`${t('planning.startTime')} ${line}`} aria-invalid={errorFor('starts_at')} className={field} type="text" placeholder="HH:MM" value={item.starts_at ?? ''} disabled={!useSchedule} onChange={(e) => update(index, { starts_at: e.target.value || null })} /></td></tr>
      })}</tbody></table></div>
      <label>{t('planning.sessionMinutes')}<input className={field} type="number" min="1" value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} /></label><p>{t('planning.importTotal', { total })}{sessionMinutes ? ` / ${sessionMinutes} min` : ` · ${t('planning.sessionUnknown')}`}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={!valid} onClick={() => { onApply(preview.rows.map(({ item }) => ({ ...item, resource: emptyResource(item.resource ?? ''), starts_at: useSchedule ? item.starts_at : null })), false); setPreview(null) }}>{t('planning.importAdd')}</Button><Button variant="secondary" disabled={!valid} onClick={() => { onApply(preview.rows.map(({ item }) => ({ ...item, resource: emptyResource(item.resource ?? ''), starts_at: useSchedule ? item.starts_at : null })), true); setPreview(null) }}>{t('planning.importReplace')}</Button></div></>}
  </section>
}
