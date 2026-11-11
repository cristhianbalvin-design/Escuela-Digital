import { useTranslation } from 'react-i18next'
import type { LiveRpcOutput } from './live-contract'

type Run = NonNullable<LiveRpcOutput<'get_projector_state'>['run']>
type Results = NonNullable<Run['results']>
type Bar = Extract<Results['rows'][number], { count: number; percent: number }>

function isChoice(row: Results['rows'][number]): row is Extract<Bar, { id: string }> {
  return 'id' in row
}
function isScale(row: Results['rows'][number]): row is Extract<Bar, { value: number }> {
  return 'value' in row
}
function isTerm(row: Results['rows'][number]): row is Extract<Results['rows'][number], { term: string }> {
  return 'term' in row
}

export function LiveResults({ run, large = false }: { run: Run; large?: boolean }) {
  const { t } = useTranslation()
  const results = run.results
  if (!run.show_results || !results) return null

  if (run.type === 'wordcloud') {
    const terms = results.rows.filter(isTerm)
    const max = Math.max(1, ...terms.map((row) => row.count))
    return <section aria-label={t('live.results')} className="space-y-4">
      <h2 className="font-semibold">{t('live.results')}</h2>
      {terms.length === 0 ? <p>{t('live.noResults')}</p> :
        <div className="flex flex-wrap items-center justify-center gap-4 py-6">
          {terms.map((row) => <span key={row.term} className="font-bold text-brand"
            style={{ fontSize: `${1 + 2 * row.count / max}rem` }}
            aria-label={t('live.termCount', { term: row.term, count: row.count })}>
            {row.term}
          </span>)}
        </div>}
    </section>
  }

  if (run.type === 'open') {
    return <section aria-label={t('live.results')} className="space-y-4">
      <h2 className="font-semibold">{t('live.results')}</h2>
      {results.responses.length === 0 ? <p>{t('live.noResults')}</p> :
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.responses.map((response) => <li key={response.id}
            className="rounded-card border border-border bg-surface-elevated p-4 break-words">
            {String(response.answer)}
          </li>)}
        </ul>}
    </section>
  }

  const rows = results.rows.filter((row) => isChoice(row) || isScale(row))
  const labels = run.type === 'scale' && 'labels' in run.config && run.config.labels !== null && typeof run.config.labels === 'object'
    ? run.config.labels as Record<string, string> : {}
  return <section aria-label={t('live.results')} className="space-y-4">
    <h2 className="font-semibold">{t('live.results')}</h2>
    {rows.length === 0 ? <p>{t('live.noResults')}</p> :
      <ul className="space-y-4">{rows.map((row) => {
        const label = isChoice(row) ? row.label : `${row.value}${labels[String(row.value)] ? ` · ${labels[String(row.value)]}` : ''}`
        return <li key={isChoice(row) ? row.id : row.value}>
          <div className={`mb-1 flex justify-between gap-3 font-medium ${large ? 'text-xl' : ''}`}>
            <span>{label}</span><span>{row.count} · {row.percent}%</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-brand-soft" role="meter"
            aria-label={label} aria-valuenow={row.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, row.percent)}%` }} />
          </div>
        </li>
      })}</ul>}
    {run.type === 'scale' && results.average !== null &&
      <p className="text-lg font-semibold">{t('live.average')}: {results.average.toFixed(1)}</p>}
  </section>
}
