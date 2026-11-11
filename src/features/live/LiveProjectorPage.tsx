import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { isLiveCode } from './live-utils'
import { useProjectorState } from './live-api'
import { LiveResults } from './LiveResults'
import { CompareResults, QuizDistribution, RankingList, useRoundCountdown } from './LiveSpecial'

type Run = NonNullable<ReturnType<typeof useProjectorState>['data']>['run']
function SpecialProjector({ run, ranking }: { run: NonNullable<Run>; ranking: NonNullable<ReturnType<typeof useProjectorState>['data']>['ranking'] }) {
  const { t } = useTranslation()
  const config = run.config as { options: { id: string; label: string; real_name?: string }[]; seconds?: number; correct?: string; explanation?: string; description?: string }
  const remaining = useRoundCountdown(run, config.seconds ?? 5)
  if (run.type === 'quiz') return <div className="mx-auto max-w-5xl space-y-8">
    <p role="timer" className="text-center text-6xl font-black">{run.paused ? t('live.responsesPaused') : `${remaining}s`}</p>
    <div className="grid gap-4 md:grid-cols-2">{config.options.map((option, index) => <div key={option.id} className={`rounded-control border p-5 text-2xl ${run.reveal && option.id === config.correct ? 'border-green-500 bg-green-900/30' : 'border-border'}`}><span className="mr-3 text-brand">{String.fromCharCode(65 + index)}</span>{option.label}{run.reveal && option.id === config.correct ? ' ✓' : ''}</div>)}</div>
    {run.show_results && <QuizDistribution run={run} />}
    {run.reveal && config.explanation && <p className="text-center text-2xl">{config.explanation}</p>}
    {run.show_ranking && <RankingList entries={ranking ?? []} />}
  </div>
  return <div className="mx-auto max-w-5xl space-y-7">
    {config.description && <p className="whitespace-pre-line text-center text-2xl">{config.description}</p>}
    <div className="grid gap-3 md:grid-cols-3">{config.options.map((option) => <div key={option.id} className="rounded-control border border-border p-4 text-center text-2xl font-bold transition-colors duration-500">{option.label}{run.reveal && option.real_name && <span className="block text-lg text-brand">↓ {option.real_name}</span>}</div>)}</div>
    {run.show_results && <CompareResults run={run} />}
  </div>
}

export function LiveProjectorPage() {
  const { t } = useTranslation()
  const { code: rawCode } = useParams()
  const code = (rawCode ?? '').toUpperCase()
  const state = useProjectorState(code)
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState(false)

  useEffect(() => {
    if (!isLiveCode(code)) return
    let active = true
    const url = new URL(`/clase/${code}${window.location.search}`, window.location.origin).href
    void import('qrcode').then((module) => module.toDataURL(url, { width: 320, margin: 1 }))
      .then((image) => { if (active) setQr(image) })
      .catch(() => { if (active) setQrError(true) })
    return () => { active = false }
  }, [code])

  const run = state.data?.run
  const darkTokens = {
    '--surface': '#131a2e', '--surface-elevated': '#1b2440', '--border': '#2a3556',
    '--text': '#f1f5f9', '--text-muted': '#a3aecb', '--brand-primary': '#818cf8',
    '--brand-soft': '#1b2440',
  } as CSSProperties
  return <main style={darkTokens} className="min-h-screen bg-surface text-text p-6 md:p-10">
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div><p className="text-xl font-semibold">{t('live.joinAt')}</p>
          <p className="font-mono text-5xl font-black tracking-widest text-brand md:text-7xl">{code}</p>
          <p className="mt-2 text-sm text-text-muted">{window.location.host}/clase/{code}</p>
        </div>
        {qr && <img src={qr} alt={t('live.qrAlt', { code })} className="h-40 w-40 rounded-control bg-white p-2 md:h-52 md:w-52" />}
        {qrError && <p role="status">{t('live.qrError')}</p>}
      </header>
      <div aria-live="polite" className="sr-only">{state.data?.session.status === 'ended' ? t('live.ended') : run ? run.title : t('live.waiting')}</div>
      {!isLiveCode(code) ? <p role="alert">{t('live.invalidCode')}</p> :
        state.isLoading ? <p role="status" className="text-2xl">{t('live.loading')}</p> :
        state.error ? <p role="alert" className="text-2xl">{t('live.projectorError')}</p> :
        state.data?.session.status === 'ended' ? <h1 className="m-auto text-center text-5xl font-bold">{t('live.ended')}</h1> :
        !run ? <h1 className="m-auto text-center text-4xl font-bold">{t('live.waiting')}</h1> :
        <section className="space-y-10">
          <div className="text-center"><p className="text-xl font-semibold uppercase text-text-muted">{t(`live.types.${run.type}`)}</p>
            <h1 className="mx-auto mt-3 max-w-5xl text-4xl font-bold leading-tight md:text-6xl">{run.title}</h1>
            {typeof run.config.help === 'string' && <p className="mx-auto mt-4 max-w-4xl text-xl text-text-muted">{run.config.help}</p>}
          </div>
          {(run.type === 'quiz' || run.type === 'compare') ? <SpecialProjector key={run.id} run={run} ranking={state.data?.ranking} /> : run.show_results ? <LiveResults run={run} large /> :
            <p className="text-center text-2xl">{run.status === 'open' ? t(run.paused ? 'live.responsesPaused' : 'live.collecting') : t('live.responsesClosed')}</p>}
        </section>}
    </div>
  </main>
}
