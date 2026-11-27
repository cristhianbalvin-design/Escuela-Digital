import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeMarkdown } from './SafeMarkdown'
import { allSections, copyText, safeHttps, type SheetInput, type SheetSection } from './sheet-utils'

type Shown = Pick<SheetInput, 'tool_kind' | 'tool_name' | 'tool_url' | 'tool_feature' | 'objective' | 'context_md' | 'steps' | 'prompts' | 'resources' | 'deliverable_md'>

const linkStyle = 'inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-white'
function CopyPromptButton({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  async function copy() {
    const ok = await copyText(text)
    setState(ok ? 'done' : 'failed')
    window.setTimeout(() => setState('idle'), 2500)
  }
  return <span className="inline-flex items-center gap-2">
    <button type="button" onClick={() => void copy()} aria-label={t('sheet.copyAria', { title })}
      className="min-h-11 rounded-control border border-brand px-3 text-sm font-semibold text-brand hover:bg-brand-soft">{t('sheet.copy')}</button>
    <span role="status" aria-live="polite" className={`text-sm ${state === 'failed' ? 'text-error' : 'text-text-muted'}`}>
      {state === 'done' ? t('sheet.copied') : state === 'failed' ? t('sheet.copyFailed') : ''}</span>
  </span>
}

function Empty() { const { t } = useTranslation(); return <p className="text-sm text-text-muted">{t('sheet.notFilled')}</p> }

/** Vista de lectura de la ficha: la usan el docente (por secciones) y el alumno (completa). */
export function SheetView({ sheet, sections = allSections, showAudience = false }: { sheet: Shown; sections?: SheetSection[]; showAudience?: boolean }) {
  const { t } = useTranslation()
  const show = (section: SheetSection) => sections.includes(section)
  const url = safeHttps(sheet.tool_url)
  const promptById = new Map(sheet.prompts.map((prompt) => [prompt.id, prompt]))
  return <div className="grid gap-4">
    {show('tool') && <section className="grid gap-2" aria-label={t('sheet.tool')}>
      <h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.tool')}</h4>
      {sheet.tool_kind === 'none' && <p className="text-sm text-text-muted">{t('sheet.toolNone')}</p>}
      {sheet.tool_kind === 'native' && <p>{t('sheet.toolNativeShown')}</p>}
      {sheet.tool_kind === 'external' && <>
        <p><span className="font-semibold">{sheet.tool_name ?? t('sheet.toolExternal')}</span>{sheet.tool_feature ? ` · ${sheet.tool_feature}` : ''}</p>
        {url ? <a className={`${linkStyle} w-fit`} href={url} target="_blank" rel="noopener noreferrer">{t('sheet.openTool', { tool: sheet.tool_name ?? t('sheet.toolExternal') })}</a>
          : <p className="text-sm text-text-muted">{t('sheet.noUrl')}</p>}
        <p className="text-sm text-text-muted">{t('sheet.externalNote')}</p>
      </>}
    </section>}
    {show('objective') && sheet.objective.trim() !== '' && <section className="grid gap-1"><h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.objective')}</h4><p>{sheet.objective}</p></section>}
    {show('context') && sheet.context_md.trim() !== '' && <section className="grid gap-1"><h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.context')}</h4><SafeMarkdown source={sheet.context_md} /></section>}
    {show('steps') && <section className="grid gap-2"><h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.steps')}</h4>
      {sheet.steps.length === 0 ? <Empty /> : <ol className="grid list-decimal gap-3 pl-6">{sheet.steps.map((step, index) => {
        const prompt = step.prompt_id ? promptById.get(step.prompt_id) : undefined
        return <li key={index} className="pl-1"><span>{step.text}</span>
          {step.minutes !== null && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums">{t('sheet.minutesShort', { count: step.minutes })}</span>}
          {prompt && <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">{t('sheet.usePrompt', { title: prompt.title })}<CopyPromptButton title={prompt.title} text={prompt.text} /></span>}
        </li>
      })}</ol>}
    </section>}
    {show('prompts') && <section className="grid gap-2"><h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.prompts')}</h4>
      {sheet.prompts.length === 0 ? <Empty /> : sheet.prompts.map((prompt, index) => <article key={prompt.id} className="grid gap-2 rounded-control border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">{index + 1}. {prompt.title}</h5><CopyPromptButton title={prompt.title} text={prompt.text} /></div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-elevated p-3 text-sm">{prompt.text}</pre>
      </article>)}
    </section>}
    {show('resources') && <section className="grid gap-2"><h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.resources')}</h4>
      {sheet.resources.length === 0 ? <Empty /> : <ul className="grid gap-1">{sheet.resources.map((resource, index) => <li key={index} className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{resource.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resource.status === 'ready' ? 'bg-brand-soft' : 'border border-border'}`}>{t(`sheet.resourceStatus.${resource.status}`)}</span>
        {showAudience && <span className="text-xs text-text-muted">{t(`sheet.audience.${resource.audience}`)}</span>}
      </li>)}</ul>}
      <p className="text-sm text-text-muted">{t('sheet.resourcesNote')}</p>
    </section>}
    {show('deliverable') && sheet.deliverable_md.trim() !== '' && <section className="grid gap-1"><h4 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sheet.deliverable')}</h4><SafeMarkdown source={sheet.deliverable_md} /></section>}
  </div>
}
