import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { openPlanFile, useLessonPlan, usePlanFiles, useSavePlan } from './planning-api'
import { emptyResource, itemSchema, kinds, type PlanFile, type PlanItem } from './planning-utils'
import { PlanImport } from './PlanImport'

type Kind = typeof kinds[number]
export const kindColors: Record<Kind, string> = {
  explicacion: '#8B93FF', practica: '#2FB79B', interactiva: '#E8A33D', evaluacion: '#E2789C', descanso: '#6B7699', otro: '#9AA3BF',
}
const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
const clock = (minutes: number) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const valid = (value: string | null | undefined): value is string => !!value && /^([01]\d|2[0-3]):[0-5]\d/.test(value)

/** La hora de cada bloque se deriva del inicio de la sesión y de los minutos anteriores. */
export function withTimes(items: PlanItem[], start: string): PlanItem[] {
  let offset = toMinutes(start)
  return items.map((item) => { const next = { ...item, starts_at: clock(offset) }; offset += item.minutes ?? 0; return next })
}
const field = 'min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3'

/** Editor del guion: línea de tiempo, tabla compacta y panel de detalle con guardado automático. */
export function ScriptEditor({ lessonId, tenantId, editable }: { lessonId: string; tenantId: string; editable: boolean }) {
  const { t } = useTranslation()
  const query = useLessonPlan(lessonId)
  const save = useSavePlan(lessonId)
  const files = usePlanFiles(lessonId, tenantId)
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [start, setStart] = useState('19:00')
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'error'>('idle')
  const [dragId, setDragId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (items !== null || !query.data) return
    const first = query.data.items[0]?.starts_at
    const base = valid(first) ? first.slice(0, 5) : '19:00'
    setStart(base); setItems(query.data.items)
  }, [query.data, items])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  function commit(next: PlanItem[], nextStart = start) {
    const timed = withTimes(next, nextStart)
    setItems(timed)
    if (!editable) return
    if (timer.current) window.clearTimeout(timer.current)
    if (!timed.every((item) => itemSchema.safeParse(item).success)) { setStatus('invalid'); return }
    setStatus('pending')
    timer.current = window.setTimeout(() => {
      setStatus('saving')
      save.mutateAsync(timed.map((item) => ({ ...item, resource: emptyResource(item.resource ?? '') })))
        .then(() => setStatus('saved')).catch(() => setStatus('error'))
    }, 700)
  }
  const list = items ?? []
  const current = list.find((item) => item.id === selected)
  const index = list.findIndex((item) => item.id === selected)
  const total = list.reduce((sum, item) => sum + (item.minutes ?? 0), 0)
  function update(change: Partial<PlanItem>) { if (current) commit(list.map((item) => item.id === current.id ? { ...item, ...change } : item)) }
  function insert(at: number, base?: PlanItem) {
    const item: PlanItem = base ? { ...base, id: crypto.randomUUID(), title: `${base.title} (copia)`.slice(0, 200) }
      : { id: crypto.randomUUID(), title: t('script.newBlock'), minutes: 10, kind: 'explicacion', notes: '', resource: null, starts_at: null }
    commit([...list.slice(0, at), item, ...list.slice(at)]); setSelected(item.id)
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= list.length) return
    const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item!); commit(next)
  }
  function remove() {
    if (!current || !window.confirm(t('script.confirmDelete'))) return
    commit(list.filter((item) => item.id !== current.id)); setSelected(null)
  }
  function onDrop(event: DragEvent, targetId: string) {
    event.preventDefault()
    if (dragId) move(list.findIndex((item) => item.id === dragId), list.findIndex((item) => item.id === targetId))
    setDragId(null)
  }
  async function changeFile(input: { file?: File; remove?: PlanFile }) { try { await files.mutateAsync(input) } catch { setStatus('error') } }

  if (query.isPending || items === null) return <p role="status">{t('planning.loading')}</p>
  if (query.isError) return <p role="alert">{t('planning.error')}</p>
  const statusText = { idle: '', pending: t('script.pending'), saving: t('script.saving'), saved: t('script.saved'), invalid: t('script.invalid'), error: t('planning.error') }[status]
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="grid gap-1 text-sm font-semibold">{t('script.start')}
        <input type="time" className={`${field} w-36`} value={start} disabled={!editable}
          onChange={(event) => { if (valid(event.target.value)) { setStart(event.target.value); commit(list, event.target.value) } }} /></label>
      <div className="flex flex-wrap items-center gap-3">
        <span role="status" aria-live="polite" className={`text-sm ${status === 'invalid' || status === 'error' ? 'text-error' : 'text-text-muted'}`}>{statusText}</span>
        {editable && <Button variant="secondary" onClick={() => setImporting((value) => !value)}>{t('script.import')}</Button>}
      </div>
    </div>
    {importing && <PlanImport onApply={(imported, replace) => { commit(replace ? imported : [...list, ...imported]); setImporting(false) }} />}

    <section aria-label={t('script.timeline')} className="grid gap-2 rounded-control border border-border bg-surface-elevated p-4">
      <div className="flex justify-between gap-2 text-sm text-text-muted tabular-nums">
        <span>{start}</span><span className="font-semibold text-text">{t('script.total', { minutes: total })}</span><span>{clock(toMinutes(start) + total)}</span>
      </div>
      <div className="flex h-9 gap-[3px]" aria-hidden="true">
        {list.map((item) => <button key={item.id} type="button" tabIndex={-1} title={item.title} onClick={() => setSelected(item.id)}
          className={`min-w-1 rounded-md ${item.id === selected ? 'outline outline-2 outline-offset-2 outline-text' : ''}`}
          style={{ flex: `${Math.max(1, item.minutes ?? 1)} 1 0`, backgroundColor: kindColors[item.kind] }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">{kinds.map((kind) => <li key={kind} className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: kindColors[kind] }} />{t(`planning.kinds.${kind}`)}</li>)}</ul>
    </section>

    <div className="flex flex-wrap items-start gap-5">
      <section className="min-w-0 flex-[999_1_32rem]">
        <div role="table" aria-label={t('script.blocks')} className="overflow-hidden rounded-control border border-border bg-surface-elevated">
          <div role="row" className="grid grid-cols-[1.5rem_3.5rem_minmax(0,1fr)_8rem_3.5rem] gap-3 border-b border-border px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-text-muted">
            <span role="columnheader" /><span role="columnheader">{t('script.time')}</span><span role="columnheader">{t('script.block')}</span>
            <span role="columnheader">{t('planning.type')}</span><span role="columnheader" className="text-right">{t('script.min')}</span>
          </div>
          {list.length === 0 && <p className="p-4 text-sm text-text-muted">{t('planning.empty')}</p>}
          {list.map((item) => <div key={item.id} role="row" aria-selected={item.id === selected}
            draggable={editable} onDragStart={() => setDragId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, item.id)}
            className={`grid grid-cols-[1.5rem_3.5rem_minmax(0,1fr)_8rem_3.5rem] items-center gap-3 border-b border-border px-4 ${item.id === selected ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--color-brand)]' : ''} ${dragId === item.id ? 'opacity-50' : ''}`}>
            <span role="cell" aria-hidden="true" className={`text-text-muted ${editable ? 'cursor-grab' : ''}`}>⋮⋮</span>
            <span role="cell" className="font-semibold tabular-nums">{item.starts_at?.slice(0, 5)}</span>
            <span role="cell" className="min-w-0"><button type="button" onClick={() => setSelected(item.id)} className="min-h-12 w-full truncate text-left">{item.title || t('sets.untitled')}</button></span>
            <span role="cell"><span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-xs">
              <span aria-hidden="true" className="size-2 rounded-sm" style={{ backgroundColor: kindColors[item.kind] }} />{t(`planning.kinds.${item.kind}`)}</span></span>
            <span role="cell" className="text-right tabular-nums">{item.minutes ?? '–'}</span>
          </div>)}
          {editable && <button type="button" onClick={() => insert(list.length)} className="min-h-12 w-full px-4 text-left text-sm text-text-muted hover:bg-surface">+ {t('script.addEnd')}</button>}
        </div>
        <p className="mt-2 text-sm text-text-muted">{t(editable ? 'script.hint' : 'script.readonly')}</p>
      </section>

      {current && <aside aria-label={t('script.detail')} className="grid min-w-0 max-w-md flex-[1_1_20rem] gap-4 rounded-control border border-brand bg-surface-elevated p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{t('script.blockN', { number: index + 1 })} · {current.starts_at?.slice(0, 5)} – {clock(toMinutes(current.starts_at ?? start) + (current.minutes ?? 0))}</span>
          <Button variant="secondary" aria-label={t('script.close')} onClick={() => setSelected(null)}>✕</Button>
        </div>
        <label className="grid gap-1 text-sm font-semibold">{t('script.name')}
          <input className={`${field} text-base`} maxLength={200} value={current.title} disabled={!editable} onChange={(event) => update({ title: event.target.value })} /></label>
        <fieldset className="grid gap-1.5"><legend className="text-sm font-semibold">{t('planning.type')}</legend>
          <div className="flex flex-wrap gap-1.5">{kinds.map((kind) => <button key={kind} type="button" aria-pressed={current.kind === kind} disabled={!editable} onClick={() => update({ kind })}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm ${current.kind === kind ? 'border-brand bg-brand-soft font-semibold' : 'border-border'}`}>
            <span aria-hidden="true" className="size-2 rounded-sm" style={{ backgroundColor: kindColors[kind] }} />{t(`planning.kinds.${kind}`)}</button>)}</div>
        </fieldset>
        <div className="flex gap-3">
          <label className="grid flex-1 gap-1 text-sm font-semibold">{t('script.minutes')}
            <input className={field} type="number" min={1} max={1440} value={current.minutes ?? ''} disabled={!editable}
              onChange={(event) => update({ minutes: event.target.value === '' ? null : Math.max(1, Math.min(1440, Number(event.target.value))) })} /></label>
          <div className="grid flex-1 gap-1 text-sm"><span className="font-semibold">{t('script.time')}</span><span className="flex min-h-11 items-center text-text-muted">{current.starts_at?.slice(0, 5)} · {t('script.auto')}</span></div>
        </div>
        <label className="grid gap-1 text-sm font-semibold">{t('planning.resource')}
          <input className={field} maxLength={120} value={current.resource ?? ''} disabled={!editable} onChange={(event) => update({ resource: event.target.value || null })} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t('script.notes')}
          <textarea className={`${field} min-h-28 py-2`} maxLength={5000} value={current.notes} disabled={!editable} onChange={(event) => update({ notes: event.target.value })} /></label>
        {editable && <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button variant="secondary" aria-label={t('planning.up')} disabled={index === 0} onClick={() => move(index, index - 1)}>↑</Button>
          <Button variant="secondary" aria-label={t('planning.down')} disabled={index === list.length - 1} onClick={() => move(index, index + 1)}>↓</Button>
          <Button variant="secondary" onClick={() => insert(index + 1, current)}>{t('script.duplicate')}</Button>
          <Button variant="secondary" onClick={() => insert(index + 1)}>+ {t('script.addBelow')}</Button>
          <Button variant="destructive" className="ml-auto" onClick={remove}>{t('planning.delete')}</Button>
        </div>}
      </aside>}
    </div>

    <section className="grid gap-2">
      <h3 className="font-semibold">{t('planning.files')}</h3>
      {query.data.files.length === 0 && <p className="text-sm text-text-muted">{t('script.noFiles')}</p>}
      <ul className="grid gap-1">{query.data.files.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-2">
        <button type="button" className="underline" onClick={() => void openPlanFile(file.storage_path).catch(() => setStatus('error'))}>{file.name}</button>
        {editable && <Button variant="secondary" onClick={() => void changeFile({ remove: file })}>{t('planning.removeFile')}</Button>}</li>)}</ul>
      {editable && <label className="grid gap-1 text-sm">{t('planning.upload')}
        <input className={field} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void changeFile({ file }) }} /></label>}
    </section>
  </div>
}
