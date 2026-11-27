import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useLessonSheets, useSaveSheet } from './live-teacher-api'
import {
  cleanSheet, isEmptySheet, newPromptId, sheetFromOutput, sheetInputSchema, teacherKeys, toolKinds,
  type SheetInput, type SheetResource, type SheetStep, type TeacherKey, type ToolKind,
} from './sheet-utils'

const field = 'min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3'
const area = `${field} py-2`
type Status = 'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'error' | 'waiting'

/** Editor de la ficha de actividad de un bloque: herramienta, parte del alumno y parte privada del docente. */
type EditorProps = { lessonId: string; itemId: string; editable: boolean; ready: boolean }

/** Carga la ficha del bloque y monta el formulario con ese contenido inicial (el padre lo remonta al cambiar de bloque). */
export function SheetEditor(props: EditorProps) {
  const { t } = useTranslation()
  const query = useLessonSheets(props.lessonId)
  if (query.isPending) return <p role="status" className="text-sm">{t('sheet.loading')}</p>
  if (query.isError) return <p role="alert" className="text-sm text-error">{t('sheet.loadError')}</p>
  const found = query.data.find((sheet) => sheet.item_id === props.itemId)
  return <SheetForm {...props} initial={sheetFromOutput(found)} hadSheet={!!found} />
}

function SheetForm({ lessonId, itemId, editable, ready, initial, hadSheet }: EditorProps & { initial: SheetInput; hadSheet: boolean }) {
  const { t } = useTranslation()
  const save = useSaveSheet(lessonId)
  const [draft, setDraft] = useState<SheetInput>(initial)
  const [status, setStatus] = useState<Status>('idle')
  const timer = useRef<number | null>(null)
  const queued = useRef<{ payload: SheetInput | null } | null>(null)
  const existed = useRef(hadSheet)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  function flush() {
    const job = queued.current
    if (!job) return
    if (!ready) { setStatus('waiting'); return }
    queued.current = null
    setStatus('saving')
    save.mutateAsync({ itemId, sheet: job.payload })
      .then(() => { existed.current = job.payload !== null; setStatus('saved') })
      .catch(() => setStatus('error'))
  }
  useEffect(() => { if (ready && queued.current) flush() }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit(next: SheetInput) {
    setDraft(next)
    if (!editable) return
    if (timer.current) window.clearTimeout(timer.current)
    const cleaned = cleanSheet(next)
    if (isEmptySheet(cleaned)) {
      if (!existed.current) { queued.current = null; setStatus('idle'); return }
      queued.current = { payload: null }
    } else if (!sheetInputSchema.safeParse(cleaned).success) { queued.current = null; setStatus('invalid'); return }
    else queued.current = { payload: cleaned }
    setStatus('pending')
    timer.current = window.setTimeout(flush, 800)
  }

  const update = (change: Partial<SheetInput>) => commit({ ...draft, ...change })
  const setTeacher = (key: TeacherKey, value: string) => update({ teacher: { ...draft.teacher, [key]: value } })
  const patchStep = (index: number, change: Partial<SheetStep>) => update({ steps: draft.steps.map((step, i) => i === index ? { ...step, ...change } : step) })
  const patchResource = (index: number, change: Partial<SheetResource>) => update({ resources: draft.resources.map((item, i) => i === index ? { ...item, ...change } : item) })
  const urlInvalid = !!draft.tool_url?.trim() && !/^https:\/\/[^\s<>"']+$/.test(draft.tool_url.trim())
  const statusText = { idle: '', pending: t('script.pending'), saving: t('script.saving'), saved: t('script.saved'), invalid: t('sheet.invalid'), error: t('sheet.saveError'), waiting: t('sheet.waitingBlock') }[status]
  const group = 'grid gap-3 rounded-control border border-border p-3'

  return <section aria-label={t('sheet.editorTitle')} className="grid gap-3 border-t border-border pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{t('sheet.editorTitle')}</h3>
      <span role="status" aria-live="polite" className={`text-sm ${status === 'invalid' || status === 'error' ? 'text-error' : 'text-text-muted'}`}>{statusText}</span>
    </div>
    <p className="text-sm text-text-muted">{t('sheet.editorHint')}</p>

    <fieldset className={group}><legend className="px-1 text-sm font-semibold">{t('sheet.tool')}</legend>
      <div className="grid gap-2">{toolKinds.map((kind: ToolKind) => <label key={kind} className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 ${draft.tool_kind === kind ? 'border-brand bg-brand-soft' : 'border-border'}`}>
        <input type="radio" name={`tool-kind-${itemId}`} className="mt-1" checked={draft.tool_kind === kind} disabled={!editable} onChange={() => update({ tool_kind: kind })} />
        <span><span className="block font-semibold">{t(`sheet.toolKind.${kind}`)}</span><span className="block text-sm text-text-muted">{t(`sheet.toolKindHelp.${kind}`)}</span></span></label>)}</div>
      {draft.tool_kind === 'external' && <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">{t('sheet.toolName')}<input className={field} maxLength={80} value={draft.tool_name ?? ''} disabled={!editable} onChange={(e) => update({ tool_name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t('sheet.toolUrl')}<input className={field} type="url" inputMode="url" maxLength={500} placeholder="https://" value={draft.tool_url ?? ''} disabled={!editable}
          aria-invalid={urlInvalid} onChange={(e) => update({ tool_url: e.target.value })} />
          {urlInvalid && <span role="alert" className="text-sm font-normal text-error">{t('sheet.urlInvalid')}</span>}</label>
        <label className="grid gap-1 text-sm font-semibold">{t('sheet.toolFeature')}<input className={field} maxLength={120} value={draft.tool_feature ?? ''} disabled={!editable} onChange={(e) => update({ tool_feature: e.target.value })} /></label>
      </div>}
    </fieldset>

    <fieldset className={group}><legend className="px-1 text-sm font-semibold">{t('sheet.studentPart')}</legend>
      <p className="text-sm text-text-muted">{t('sheet.studentPartHint')}</p>
      <label className="grid gap-1 text-sm font-semibold">{t('sheet.objective')}<textarea className={`${area} min-h-16`} maxLength={600} value={draft.objective} disabled={!editable} onChange={(e) => update({ objective: e.target.value })} /></label>
      <label className="grid gap-1 text-sm font-semibold">{t('sheet.context')}<textarea className={`${area} min-h-24`} maxLength={6000} value={draft.context_md} disabled={!editable} onChange={(e) => update({ context_md: e.target.value })} /></label>

      <div className="grid gap-2"><h4 className="text-sm font-semibold">{t('sheet.steps')}</h4>
        {draft.steps.map((step, index) => <div key={index} className="grid gap-2 rounded-control border border-border bg-surface p-2">
          <label className="grid gap-1 text-sm">{t('sheet.stepN', { number: index + 1 })}<textarea className={`${area} min-h-16`} maxLength={1000} value={step.text} disabled={!editable} onChange={(e) => patchStep(index, { text: e.target.value })} /></label>
          <div className="flex flex-wrap gap-2">
            <label className="grid flex-1 gap-1 text-sm">{t('sheet.stepMinutes')}<input className={field} type="number" min={1} max={240} value={step.minutes ?? ''} disabled={!editable}
              onChange={(e) => patchStep(index, { minutes: e.target.value === '' ? null : Math.max(1, Math.min(240, Number(e.target.value))) })} /></label>
            <label className="grid flex-[2] gap-1 text-sm">{t('sheet.stepPrompt')}<select className={field} value={step.prompt_id ?? ''} disabled={!editable} onChange={(e) => patchStep(index, { prompt_id: e.target.value || null })}>
              <option value="">{t('sheet.noPrompt')}</option>{draft.prompts.map((prompt, i) => <option key={prompt.id} value={prompt.id}>{prompt.title.trim() || t('sheet.promptN', { number: i + 1 })}</option>)}</select></label>
          </div>
          {editable && <Button variant="secondary" className="w-fit" onClick={() => update({ steps: draft.steps.filter((_, i) => i !== index) })}>{t('sheet.removeStep')}</Button>}
        </div>)}
        {editable && <Button variant="secondary" className="w-fit" disabled={draft.steps.length >= 20} onClick={() => update({ steps: [...draft.steps, { text: '', minutes: null, prompt_id: null }] })}>+ {t('sheet.addStep')}</Button>}
      </div>

      <div className="grid gap-2"><h4 className="text-sm font-semibold">{t('sheet.prompts')}</h4>
        {draft.prompts.map((prompt, index) => <div key={prompt.id} className="grid gap-2 rounded-control border border-border bg-surface p-2">
          <label className="grid gap-1 text-sm">{t('sheet.promptTitle', { number: index + 1 })}<input className={field} maxLength={120} value={prompt.title} disabled={!editable}
            onChange={(e) => update({ prompts: draft.prompts.map((item, i) => i === index ? { ...item, title: e.target.value } : item) })} /></label>
          <label className="grid gap-1 text-sm">{t('sheet.promptText')}<textarea className={`${area} min-h-28 font-mono text-sm`} maxLength={6000} value={prompt.text} disabled={!editable}
            onChange={(e) => update({ prompts: draft.prompts.map((item, i) => i === index ? { ...item, text: e.target.value } : item) })} /></label>
          {editable && <Button variant="secondary" className="w-fit" onClick={() => update({ prompts: draft.prompts.filter((_, i) => i !== index), steps: draft.steps.map((step) => step.prompt_id === prompt.id ? { ...step, prompt_id: null } : step) })}>{t('sheet.removePrompt')}</Button>}
        </div>)}
        {editable && <Button variant="secondary" className="w-fit" disabled={draft.prompts.length >= 10} onClick={() => update({ prompts: [...draft.prompts, { id: newPromptId(), title: '', text: '' }] })}>+ {t('sheet.addPrompt')}</Button>}
      </div>

      <div className="grid gap-2"><h4 className="text-sm font-semibold">{t('sheet.resources')}</h4>
        <p className="text-sm text-text-muted">{t('sheet.resourcesEditHint')}</p>
        {draft.resources.map((resource, index) => <div key={index} className="grid gap-2 rounded-control border border-border bg-surface p-2">
          <label className="grid gap-1 text-sm">{t('sheet.resourceName')}<input className={field} maxLength={150} value={resource.name} disabled={!editable} onChange={(e) => patchResource(index, { name: e.target.value })} /></label>
          <div className="flex flex-wrap gap-2">
            <label className="grid flex-1 gap-1 text-sm">{t('sheet.resourceAudience')}<select className={field} value={resource.audience} disabled={!editable}
              onChange={(e) => patchResource(index, { audience: e.target.value === 'teacher' ? 'teacher' : 'students' })}><option value="students">{t('sheet.audience.students')}</option><option value="teacher">{t('sheet.audience.teacher')}</option></select></label>
            <label className="grid flex-1 gap-1 text-sm">{t('sheet.resourceState')}<select className={field} value={resource.status} disabled={!editable}
              onChange={(e) => patchResource(index, { status: e.target.value === 'ready' ? 'ready' : 'pending' })}><option value="pending">{t('sheet.resourceStatus.pending')}</option><option value="ready">{t('sheet.resourceStatus.ready')}</option></select></label>
          </div>
          {editable && <Button variant="secondary" className="w-fit" onClick={() => update({ resources: draft.resources.filter((_, i) => i !== index) })}>{t('sheet.removeResource')}</Button>}
        </div>)}
        {editable && <Button variant="secondary" className="w-fit" disabled={draft.resources.length >= 15} onClick={() => update({ resources: [...draft.resources, { name: '', audience: 'students', status: 'pending' }] })}>+ {t('sheet.addResource')}</Button>}
      </div>

      <label className="grid gap-1 text-sm font-semibold">{t('sheet.deliverable')}<textarea className={`${area} min-h-20`} maxLength={3000} value={draft.deliverable_md} disabled={!editable} onChange={(e) => update({ deliverable_md: e.target.value })} /></label>
    </fieldset>

    <fieldset className={`${group} border-dashed`}><legend className="px-1 text-sm font-semibold">{t('sheet.teacherPart')}</legend>
      <p className="text-sm text-text-muted">{t('sheet.teacherPartHint')}</p>
      {teacherKeys.map((key) => <label key={key} className="grid gap-1 text-sm font-semibold">{t(`sheet.teacher.${key}`)}
        <textarea className={`${area} min-h-20`} maxLength={6000} value={draft.teacher[key] ?? ''} disabled={!editable} onChange={(e) => setTeacher(key, e.target.value)} /></label>)}
    </fieldset>
  </section>
}
