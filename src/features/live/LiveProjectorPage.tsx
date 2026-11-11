import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { isLiveCode } from './live-utils'
import { useProjectorState } from './live-api'
import { LiveResults } from './LiveResults'

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
          </div>
          {run.show_results ? <LiveResults run={run} large /> :
            <p className="text-center text-2xl">{run.status === 'open' ? t('live.collecting') : t('live.responsesClosed')}</p>}
        </section>}
    </div>
  </main>
}
