import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentStepIndex, elapsedSeconds, formatClock } from './block-state'
import type { LiveRpcOutput } from './live-contract'
import { SafeMarkdown } from './SafeMarkdown'

type Data = NonNullable<LiveRpcOutput<'get_projector_sheet'>>

/** Vista de aula de la ficha publicada: legible desde el fondo del salón. Nunca muestra la parte privada. */
export function ProjectorSheet({ data, receivedAt, code, qr }: { data: Data; receivedAt: number; code: string; qr: string }) {
  const { t } = useTranslation()
  const { sheet, block } = data
  const [now, setNow] = useState(() => Date.now())
  const running = block?.state === 'active'
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  const offset = Date.parse(data.server_now) - receivedAt
  const seconds = block ? elapsedSeconds({ item_id: sheet.item_id, ...block }, running ? Math.max(now, receivedAt) : now, offset) : 0
  const planned = sheet.minutes ? sheet.minutes * 60 : null
  const left = planned !== null ? planned - seconds : null
  const focus = data.focus_prompt ? sheet.prompts.find((prompt) => prompt.id === data.focus_prompt) : undefined
  const stepNow = currentStepIndex(sheet.steps, seconds, !!block)
  const tool = sheet.tool_kind === 'external' ? [sheet.tool_name, sheet.tool_feature].filter(Boolean).join(' · ') : ''
  const ready = sheet.resources.filter((resource) => resource.status === 'ready')

  const corner = <div className="flex items-center gap-4">
    <div className="text-right">
      <p className="text-lg text-text-muted">{window.location.host}/clase</p>
      <p className="font-mono text-4xl font-black tracking-widest text-brand">{code}</p>
    </div>
    {qr && <img src={qr} alt={t('live.qrAlt', { code })} className="size-28 rounded-control bg-white p-1.5" />}
  </div>
  const clock = planned !== null && <div className="text-right">
    <p role="timer" aria-live="off" className={`text-7xl font-black tabular-nums leading-none ${left !== null && left < 0 ? 'text-red-400' : ''}`}>
      {left !== null && left < 0 ? `+${formatClock(-left)}` : formatClock(left ?? 0)}</p>
    <p className="mt-1 text-xl text-text-muted">{!block ? t('projectorSheet.notStarted', { minutes: sheet.minutes }) : left !== null && left < 0 ? t('projectorSheet.over') : t('projectorSheet.left')}</p>
  </div>

  if (focus) return <section className="flex min-h-[calc(100vh-5rem)] flex-col gap-8">
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div><p className="text-2xl font-semibold text-text-muted">{sheet.title}</p><h1 className="mt-2 text-5xl font-bold">{focus.title}</h1></div>
      <div className="flex items-start gap-8">{clock}{corner}</div>
    </header>
    <pre className="flex-1 whitespace-pre-wrap break-words rounded-control border border-border bg-surface-elevated p-8 font-sans text-3xl leading-relaxed">{focus.text}</pre>
    <p className="text-xl text-text-muted">{t('projectorSheet.copyHint')}</p>
  </section>

  return <section className="flex min-h-[calc(100vh-5rem)] flex-col gap-8">
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-5xl font-bold leading-tight">{sheet.title}</h1>
        {sheet.objective.trim() && <p className="mt-3 text-2xl text-text-muted">{sheet.objective}</p>}
      </div>
      {corner}
    </header>
    <div className="grid flex-1 gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid content-start gap-4">
        {tool && <p className="text-2xl"><span className="text-text-muted">{t('projectorSheet.tool')}: </span><span className="font-bold">{tool}</span></p>}
        {sheet.steps.length > 0 && <ol className="grid gap-3">{sheet.steps.map((step, index) => {
          const isNow = index === stepNow; const done = stepNow > index
          return <li key={index} className={`flex items-start gap-5 rounded-control border p-5 ${isNow ? 'border-brand bg-brand-soft' : 'border-border'} ${done ? 'opacity-60' : ''}`}>
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-full text-2xl font-black ${isNow ? 'bg-brand text-white' : 'bg-surface-elevated'}`}>{done ? '✓' : index + 1}</span>
            <span className="flex-1 text-2xl leading-snug">{step.text}</span>
            {step.minutes !== null && <span className="shrink-0 text-xl text-text-muted tabular-nums">{t('sheet.minutesShort', { count: step.minutes })}</span>}
          </li>
        })}</ol>}
      </div>
      <aside className="grid content-start gap-8">
        {clock}
        {ready.length > 0 && <div className="grid gap-2 rounded-control border border-border p-5">
          <p className="text-xl font-bold">{t('projectorSheet.resources')}</p>
          <ul className="grid gap-1 text-xl">{ready.map((resource) => <li key={resource.idx}>{resource.name}</li>)}</ul>
          <p className="text-lg text-text-muted">{t('projectorSheet.resourcesHint', { code })}</p>
        </div>}
        {sheet.deliverable_md.trim() && <div className="grid gap-2 rounded-control border border-border p-5">
          <p className="text-xl font-bold">{t('projectorSheet.deliverable')}</p>
          <div className="text-xl leading-relaxed"><SafeMarkdown source={sheet.deliverable_md} /></div>
        </div>}
      </aside>
    </div>
  </section>
}
