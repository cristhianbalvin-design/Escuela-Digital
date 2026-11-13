import { useTranslation } from 'react-i18next'
import { SafeMarkdown } from './SafeMarkdown'

type Option = { id: string; label: string; content?: string }
const letters = 'ABCDEFGHIJKLMNOPQRST'

/** Aproximación de lo que verá el alumno en su celular mientras se edita. */
export function ActivityPreview({ item }: { item: { title: string; type: string; config: Record<string, unknown> } }) {
  const { t } = useTranslation()
  const config = item.config
  const options = Array.isArray(config.options) ? config.options as Option[] : []
  const text = (key: string) => typeof config[key] === 'string' ? config[key] as string : ''
  const number = (key: string, fallback: number) => typeof config[key] === 'number' ? config[key] as number : fallback
  const min = number('scale_min', 1); const max = Math.min(number('scale_max', 5), min + 20)
  const labels = config.labels && typeof config.labels === 'object' ? config.labels as Record<string, string> : {}
  const criteria = Array.isArray(config.criteria) ? config.criteria as { id: string; label: string }[] : []
  return <aside aria-label={t('live.preview.title')} className="grid gap-2 lg:sticky lg:top-4">
    <p className="text-sm font-semibold text-text-muted">{t('live.preview.title')}</p>
    <div className="mx-auto grid w-full max-w-xs gap-3 rounded-[2rem] border-2 border-border bg-white p-4 text-sm text-slate-900">
      {item.type === 'quiz' && <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{t('live.types.quiz')}</span>
        <span className="flex size-11 items-center justify-center rounded-full border-[3px] border-indigo-600 text-sm font-bold">{number('seconds', 20)}</span>
      </div>}
      {text('context') && <div className="max-h-40 overflow-auto rounded-xl bg-slate-100 p-2 text-xs"><SafeMarkdown source={text('context')} /></div>}
      <p className="text-lg font-semibold leading-snug">{item.title || t('live.preview.untitled')}</p>
      {text('help') && <p className="text-xs text-slate-600">{text('help')}</p>}
      {item.type === 'compare' ? <>
        {text('description') && <p className="text-xs text-slate-700">{text('description')}</p>}
        <div className="flex flex-wrap gap-1.5">{options.map((option, index) => <span key={option.id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${index === 0 ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'border-slate-300'}`}>{option.label}</span>)}</div>
        <div className="max-h-48 overflow-auto rounded-xl border border-slate-200 p-2 text-xs">{options[0]?.content ? <SafeMarkdown source={options[0].content} /> : t('live.preview.noContent')}</div>
        <p className="text-xs text-slate-600">{t('live.preview.criteria', { count: criteria.length, max: number('scale_max', 5) })}</p>
      </> : options.length > 0 ? <ul className="grid gap-2">{options.map((option, index) => <li key={option.id} className="flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-300 p-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-xs font-bold">{letters[index]}</span>
        <span className="min-w-0 break-words">{option.label || '…'}</span>
      </li>)}</ul>
        : item.type === 'opportunity' ? <ul className="grid gap-1.5 text-xs">{(['area', 'processQuestion', 'taskQuestion', 'problemsQuestion', 'opportunityQuestion', 'solutionQuestion', 'impactQuestion', 'easeQuestion'] as const).map((key) => <li key={key} className="rounded-lg border border-slate-300 p-2">{t(`live.opp.${key}`)}</li>)}</ul>
        : item.type === 'wordcloud' ? <div className="grid gap-2">{Array.from({ length: Math.min(number('max_answers', 3), 5) }, (_, index) => <div key={index} className="h-10 rounded-xl border border-slate-300" />)}</div>
        : item.type === 'open' ? <div className="h-24 rounded-xl border border-slate-300" />
        : item.type === 'scale' ? <div className="grid grid-cols-5 gap-1.5">{Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index).map((value) => <div key={value} className="grid min-h-12 place-items-center rounded-xl border border-slate-300 p-1 text-center">
          <span className="font-bold">{value}</span>{labels[String(value)] && <span className="text-[10px] leading-tight">{labels[String(value)]}</span>}</div>)}</div>
        : null}
      <div className="grid min-h-11 place-items-center rounded-xl bg-indigo-600 font-semibold text-white">{t('live.send')}</div>
    </div>
    <p className="text-center text-xs text-text-muted">{t('live.preview.hint')}</p>
  </aside>
}
