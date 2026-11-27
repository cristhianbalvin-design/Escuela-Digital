import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { SafeMarkdown } from './SafeMarkdown'
import { SheetView, type ShownResource } from './SheetView'
import { downloadSheetFile } from './sheet-files'
import { formatBytes, type SheetOutput, type TeacherKey } from './sheet-utils'
import { usePublishSheet, useSessionPublication, useSetProjectorPrompt } from './live-teacher-api'
import { useBlockSheet } from './sheet-hooks'

const card = 'grid gap-3 rounded-control border border-border bg-surface p-4'
const privateOrder: TeacherKey[] = ['intro', 'prep', 'errors', 'contingency', 'expected', 'solution', 'rubric', 'closing']

function resourcesFor(sheet: SheetOutput, audience: 'students' | 'teacher'): ShownResource[] {
  return sheet.resources.map((resource, idx) => ({ ...resource, idx })).filter((resource) => resource.audience === audience)
}

/** Parte pública de la ficha en «Dictar»: publicación, pasos, prompts, recursos de alumnos y entregable. */
export function SheetTeachMain({ lessonId, itemId, session, onProject }: {
  lessonId: string; itemId: string; session: { id: string; code: string } | null; onProject?: () => void
}) {
  const { t, i18n } = useTranslation()
  const { sheet, isPending, isError } = useBlockSheet(lessonId, itemId)
  const publication = useSessionPublication(session?.id)
  const publish = usePublishSheet(session?.id ?? '', session?.code ?? '')
  const [error, setError] = useState(false)
  const focus = useSetProjectorPrompt(session?.id ?? '', session?.code ?? '')
  const [projected, setProjected] = useState<string | null>(null)
  const [focusError, setFocusError] = useState(false)
  async function project(promptId: string | null) {
    setFocusError(false)
    try { await focus.mutateAsync(promptId); setProjected(promptId); onProject?.() } catch { setFocusError(true) }
  }
  const publishedId = publication.data?.item_id ?? null
  const isPublished = publishedId === itemId
  async function change(next: string | null) {
    setError(false)
    try { await publish.mutateAsync(next); setProjected(null) } catch { setError(true) }
  }
  if (isPending) return <p role="status" className="text-sm">{t('sheet.loading')}</p>
  if (isError) return <p role="alert" className="text-sm text-error">{t('sheet.loadError')}</p>
  if (!sheet) return null
  const download = async (resource: ShownResource) => { const file = sheet.resources[resource.idx ?? -1]?.file; if (file) await downloadSheetFile(file) }
  const publishedAt = isPublished && publication.data?.published_at
    ? new Date(publication.data.published_at).toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }) : ''
  return <>
    <section aria-label={t('sheet.cockpitTitle')} className={`flex flex-wrap items-center gap-3 rounded-control border p-4 ${isPublished ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-border bg-surface'}`}>
      <div className="min-w-0 flex-[1_1_18rem]">
        <p className="font-bold" role="status" aria-live="polite">
          {!session ? t('sheet.publishNoClass') : isPublished ? t('dictar.publishedAt', { time: publishedAt }) : publishedId ? t('sheet.otherPublished') : t('sheet.notPublished')}</p>
        <p className="text-sm opacity-90">{t('sheet.publishHint')}</p>
      </div>
      {session && (isPublished
        ? <Button variant="secondary" className="min-h-11" disabled={publish.isPending} onClick={() => void change(null)}>{t('sheet.unpublish')}</Button>
        : <Button className="min-h-11" disabled={publish.isPending} onClick={() => void change(itemId)}>{t('sheet.publish')}</Button>)}
      {error && <p role="alert" className="basis-full text-sm text-error">{t('sheet.publishError')}</p>}
      {session && isPublished && <div className="flex basis-full flex-wrap items-center gap-2 border-t border-emerald-200 pt-3">
        <span className="text-sm font-semibold">{t('projectorSheet.onProjector')}</span>
        <Button variant={projected === null ? 'primary' : 'secondary'} className="min-h-11" aria-pressed={projected === null} disabled={focus.isPending} onClick={() => void project(null)}>{t('projectorSheet.showSheet')}</Button>
        {sheet.prompts.map((prompt) => <Button key={prompt.id} variant={projected === prompt.id ? 'primary' : 'secondary'} className="min-h-11" aria-pressed={projected === prompt.id}
          disabled={focus.isPending} onClick={() => void project(prompt.id)}>{t('projectorSheet.showPrompt', { title: prompt.title })}</Button>)}
        {focusError && <p role="alert" className="basis-full text-sm text-error">{t('projectorSheet.focusError')}</p>}
      </div>}
    </section>
    <section aria-label={t('dictar.stepsTitle')} className={card}>
      <h2 className="text-lg font-bold">{t('dictar.stepsTitle')}</h2>
      <SheetView sheet={sheet} sections={['tool', 'context', 'steps']} />
    </section>
    {sheet.prompts.length > 0 && <section aria-label={t('dictar.promptsTitle')} className={card}>
      <h2 className="text-lg font-bold">{t('dictar.promptsTitle')}</h2>
      <SheetView sheet={sheet} sections={['prompts']} />
    </section>}
    <section aria-label={t('dictar.resourcesTitle')} className={card}>
      <h2 className="text-lg font-bold">{t('dictar.resourcesTitle')}</h2>
      <SheetView sheet={{ ...sheet, resources: resourcesFor(sheet, 'students') }} sections={['resources', 'deliverable']} onDownload={download} />
    </section>
  </>
}

/** Parte privada de la ficha: solo el docente la ve, siempre a la vista en la columna derecha. */
export function SheetPrivateAside({ lessonId, itemId }: { lessonId: string; itemId: string }) {
  const { t } = useTranslation()
  const { sheet } = useBlockSheet(lessonId, itemId)
  if (!sheet) return null
  const filled = privateOrder.filter((key) => sheet.teacher[key]?.trim())
  const files = resourcesFor(sheet, 'teacher').filter((resource) => resource.file)
  return <section aria-label={t('dictar.private')} className="grid gap-3 rounded-control border border-amber-300 bg-amber-50 p-4 text-amber-950">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-bold">{t('dictar.private')}</h2>
      <span className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-bold uppercase">{t('dictar.privateTag')}</span>
    </div>
    {filled.length === 0 && files.length === 0 && <p className="text-sm">{t('dictar.privateEmpty')}</p>}
    {filled.map((key) => <div key={key} className="grid gap-1">
      <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">{t(`sheet.teacher.${key}`)}</h3>
      <div className="text-sm leading-relaxed"><SafeMarkdown source={sheet.teacher[key] ?? ''} /></div>
    </div>)}
    {files.length > 0 && <div className="grid gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">{t('dictar.teacherFiles')}</h3>
      {files.map((resource) => <PrivateDownload key={resource.idx} label={resource.name} size={resource.file!.size}
        run={async () => { const file = sheet.resources[resource.idx ?? -1]?.file; if (file) await downloadSheetFile(file) }} />)}
    </div>}
  </section>
}

function PrivateDownload({ label, size, run }: { label: string; size: number; run: () => Promise<void> }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  async function click() {
    setState('busy')
    try { await run(); setState('idle') } catch { setState('failed') }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={state === 'busy'} onClick={() => void click()} aria-label={t('sheet.downloadAria', { name: label })}
      className="min-h-11 rounded-control border border-amber-400 bg-white px-3 text-left text-sm font-semibold hover:bg-amber-100 disabled:opacity-60">
      {state === 'busy' ? t('sheet.downloading') : `${t('sheet.download')} · ${label}`}</button>
    <span className="text-xs">{formatBytes(size)}</span>
    {state === 'failed' && <span role="alert" className="text-sm text-error">{t('sheet.downloadFailed')}</span>}
  </div>
}
