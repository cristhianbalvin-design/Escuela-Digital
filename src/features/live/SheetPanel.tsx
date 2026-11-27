import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { SafeMarkdown } from './SafeMarkdown'
import { SheetView } from './SheetView'
import type { SheetOutput, SheetSection, TeacherKey } from './sheet-utils'
import { useLessonSheets, usePublishSheet, useSessionPublication } from './live-teacher-api'

const tabs = ['script', 'run', 'prompts', 'resources', 'expected', 'contingency'] as const
type Tab = typeof tabs[number]
const runSections: SheetSection[] = ['tool', 'objective', 'context', 'steps', 'deliverable']
const tabGroups: Record<'script' | 'expected' | 'contingency', TeacherKey[]> = {
  script: ['prep', 'intro', 'closing'], expected: ['expected', 'solution', 'rubric'], contingency: ['errors', 'contingency'],
}

function PrivateText({ sheet, keys }: { sheet: SheetOutput; keys: TeacherKey[] }) {
  const { t } = useTranslation()
  return <div className="grid gap-4">{keys.map((key) => {
    const value = sheet.teacher[key]
    return <section key={key} className="grid gap-1 rounded-control border border-dashed border-border p-3">
      <h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t(`sheet.teacher.${key}`)} · {t('sheet.privateTag')}</h4>
      {value && value.trim() ? <SafeMarkdown source={value} /> : <p className="text-sm text-text-muted">{t('sheet.notFilled')}</p>}
    </section>
  })}</div>
}

/** Ficha del bloque dentro de «Dictar»: pestañas de ejecución para el docente y control de publicación. */
export function SheetPanel({ lessonId, itemId, session }: { lessonId: string; itemId: string; session: { id: string; code: string } | null }) {
  const { t } = useTranslation()
  const sheets = useLessonSheets(lessonId)
  const publication = useSessionPublication(session?.id)
  const publish = usePublishSheet(session?.id ?? '', session?.code ?? '')
  const [tab, setTab] = useState<Tab>('script')
  const [error, setError] = useState(false)
  const sheet = sheets.data?.find((item) => item.item_id === itemId)
  const publishedId = publication.data?.item_id ?? null
  const isPublished = publishedId === itemId
  async function change(next: string | null) {
    setError(false)
    try { await publish.mutateAsync(next) } catch { setError(true) }
  }
  if (sheets.isPending) return <p role="status" className="p-2 text-sm">{t('sheet.loading')}</p>
  if (sheets.isError) return <p role="alert" className="p-2 text-sm text-error">{t('sheet.loadError')}</p>
  if (!sheet) return <p className="p-2 text-sm text-text-muted">{t('sheet.none')}</p>
  return <div className="grid gap-3 p-2">
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-3">
      <p className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
        {!session ? t('sheet.publishNoClass') : isPublished ? t('sheet.publishedNow') : publishedId ? t('sheet.otherPublished') : t('sheet.notPublished')}</p>
      {session && (isPublished
        ? <Button variant="secondary" className="min-h-11" disabled={publish.isPending} onClick={() => void change(null)}>{t('sheet.unpublish')}</Button>
        : <Button className="min-h-11" disabled={publish.isPending} onClick={() => void change(itemId)}>{t('sheet.publish')}</Button>)}
      <p className="basis-full text-xs text-text-muted">{t('sheet.publishHint')}</p>
      {error && <p role="alert" className="basis-full text-sm text-error">{t('sheet.publishError')}</p>}
    </div>
    <div role="tablist" aria-label={t('sheet.tabs')} className="flex flex-wrap gap-1">{tabs.map((name) => <button key={name} type="button" role="tab" id={`sheet-tab-${name}`}
      aria-selected={tab === name} aria-controls="sheet-tabpanel" onClick={() => setTab(name)}
      className={`min-h-11 rounded-control border px-3 text-sm ${tab === name ? 'border-brand bg-brand-soft font-semibold' : 'border-border'}`}>{t(`sheet.tab.${name}`)}</button>)}</div>
    <div role="tabpanel" id="sheet-tabpanel" aria-labelledby={`sheet-tab-${tab}`} className="max-h-[50vh] overflow-y-auto">
      {tab === 'run' && <SheetView sheet={sheet} sections={runSections} />}
      {tab === 'prompts' && <SheetView sheet={sheet} sections={['prompts']} />}
      {tab === 'resources' && <SheetView sheet={sheet} sections={['resources']} showAudience />}
      {(tab === 'script' || tab === 'expected' || tab === 'contingency') && <PrivateText sheet={sheet} keys={tabGroups[tab]} />}
    </div>
  </div>
}
