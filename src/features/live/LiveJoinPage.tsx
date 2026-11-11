import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { supabase } from '@/lib/supabase'
import { answerSchema, isLiveCode, liveActivitySchema } from './live-utils'
import { liveRpc, useLiveState } from './live-api'
import { LiveResults } from './LiveResults'
import { CompareRound, QuizRound } from './LiveSpecial'
import type { LiveRpcOutput } from './live-contract'

const storageKey = (code: string) => `live:participant:${code}`
function readToken(code: string): string | null {
  try { return sessionStorage.getItem(storageKey(code)) ?? localStorage.getItem(storageKey(code)) } catch { return null }
}
function saveToken(code: string, token: string) {
  try { sessionStorage.setItem(storageKey(code), token) } catch { /* private browsing */ }
  try { localStorage.setItem(storageKey(code), token) } catch { /* private browsing */ }
}
function clearToken(code: string) {
  try { sessionStorage.removeItem(storageKey(code)) } catch { /* private browsing */ }
  try { localStorage.removeItem(storageKey(code)) } catch { /* private browsing */ }
}

type Run = NonNullable<LiveRpcOutput<'get_live_state'>['run']>
function LiveAnswer({ run, code, token, mine, onSaved }: {
  run: Run; code: string; token: string; mine: string | string[] | number | null; onSaved: () => void
}) {
  const { t } = useTranslation()
  const [answer, setAnswer] = useState<string | string[] | number>(mine ?? (run.type === 'wordcloud' ? [''] : run.type === 'poll_multi' ? [] : run.type === 'scale' ? NaN : ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [sent, setSent] = useState(false)
  const config = liveActivitySchema.parse({ type: run.type, config: run.config })
  const preparedAnswer = config.type === 'wordcloud' && Array.isArray(answer)
    ? answer.map((word) => word.trim()).filter(Boolean) : answer
  const valid = answerSchema(config).safeParse(preparedAnswer).success
  const canSubmit = run.status === 'open' && !run.paused && valid && !busy

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true); setError('')
    try {
      await liveRpc('submit_live_response', {
        p_code: code, p_token: token, p_run_id: run.id,
        p_answer: preparedAnswer,
      })
      setSent(true)
      onSaved()
      setEditing(false)
    } catch { setError(t('live.submitError')) }
    finally { setBusy(false) }
  }

  const selected = Array.isArray(answer) ? answer : []
  if ((mine !== null || sent) && run.status === 'open' && !editing) return <div className="space-y-3 rounded-card border border-border bg-brand-soft p-6 text-center" role="status">
    <h3 className="text-xl font-bold">{t('live.thanks')}</h3>
    <p>{t('live.waitingTeacher')}</p>
    {run.paused && <p>{t('live.responsesPaused')}</p>}
    {!run.paused && <Button variant="secondary" onClick={() => setEditing(true)}>{t('live.editAnswer')}</Button>}
  </div>
  return <form onSubmit={(event) => void submit(event)} className="space-y-5">
    {run.paused && <p role="status" className="font-semibold text-brand">{t('live.responsesPaused')}</p>}
    {(config.type === 'poll_single' || config.type === 'vote' || config.type === 'poll_multi') &&
      <fieldset className="space-y-3">
        <legend className="sr-only">{run.title}</legend>
        {config.config.options.map((option) => {
          const checked = config.type === 'poll_multi' ? selected.includes(option.id) : answer === option.id
          return <label key={option.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control border p-4 text-lg ${checked ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
            <input type={config.type === 'poll_multi' ? 'checkbox' : 'radio'} name="live-answer"
              checked={checked} disabled={run.status !== 'open' || run.paused || (config.type === 'poll_multi' && !checked && selected.length >= (config.config.max_choices ?? config.config.options.length))}
              onChange={() => setAnswer(config.type === 'poll_multi'
                ? checked ? selected.filter((id) => id !== option.id) : [...selected, option.id]
                : option.id)} />
            {option.label}
          </label>
        })}
        {config.type === 'poll_multi' && <p className="text-sm text-text-muted">
          {t('live.maxChoices', { count: config.config.max_choices ?? config.config.options.length })}
        </p>}
      </fieldset>}
    {config.type === 'wordcloud' && <fieldset className="space-y-3">
      <legend className="font-medium">{t('live.words')}</legend>
      {Array.from({ length: config.config.max_answers }, (_, index) =>
        <Input key={index} label={t('live.wordNumber', { number: index + 1 })}
          maxLength={30} disabled={run.status !== 'open' || run.paused}
          value={selected[index] ?? ''} onChange={(event) => {
            const next = [...selected]; next[index] = event.target.value; setAnswer(next)
          }} />)}
      <p className="text-sm text-text-muted">{t('live.wordLimit')}</p>
    </fieldset>}
    {config.type === 'open' && <div className="space-y-2">
      <label htmlFor="live-open" className="font-medium">{t('live.yourAnswer')}</label>
      <textarea id="live-open" className="min-h-36 w-full min-w-0 rounded-control border border-border bg-surface p-3 text-text"
        maxLength={280} disabled={run.status !== 'open' || run.paused} value={typeof answer === 'string' ? answer : ''}
        onChange={(event) => setAnswer(event.target.value)} />
      <p className="text-sm text-text-muted">{t('live.characterLimit', { count: typeof answer === 'string' ? answer.length : 0 })}</p>
    </div>}
    {config.type === 'scale' && <fieldset className="space-y-3">
      <legend className="font-medium">{t('live.chooseScale')}</legend>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: config.config.scale_max - config.config.scale_min + 1 }, (_, i) => config.config.scale_min + i)
          .map((value) => <label key={value} className={`flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-control border p-2 ${answer === value ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
            <input className="sr-only" type="radio" name="live-scale" checked={answer === value}
              disabled={run.status !== 'open' || run.paused} onChange={() => setAnswer(value)} />
            <span className="text-xl font-bold">{value}</span>
            {config.config.labels?.[String(value)] && <span className="text-center text-xs">{config.config.labels[String(value)]}</span>}
          </label>)}
      </div>
    </fieldset>}
    {mine !== null && <p role="status" className="font-semibold text-brand">{t('live.sent')}</p>}
    {error && <p role="alert" className="text-error">{error}</p>}
    {run.status === 'open' && <Button type="submit" className="min-h-14 w-full text-base" disabled={!canSubmit}>
      {busy ? t('live.sending') : mine === null ? t('live.send') : t('live.updateAnswer')}
    </Button>}
    {run.status === 'closed' && <p>{t('live.responsesClosed')}</p>}
  </form>
}

export function LiveJoinPage() {
  const { t } = useTranslation()
  const { code: rawCode } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const code = (rawCode ?? '').trim().toUpperCase()
  const [codeInput, setCodeInput] = useState('')
  const [token, setToken] = useState<string | null>(() => code ? readToken(code) : null)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [needs, setNeeds] = useState({ name: false, company: false })
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const state = useLiveState(code, token)

  useEffect(() => { setToken(code ? readToken(code) : null); setNeeds({ name: false, company: false }); setJoinError('') }, [code])
  useEffect(() => {
    if (!code || !isLiveCode(code) || token || !supabase || auth.status === 'loading') return
    let active = true
    setJoining(true)
    const metadata = auth.user?.user_metadata as Record<string, unknown> | undefined
    const suggestedName = typeof metadata?.full_name === 'string' ? metadata.full_name : auth.user?.email ?? null
    const suggestedCompany = typeof metadata?.company === 'string' ? metadata.company : null
    void liveRpc('join_live_session', { p_code: code, p_name: suggestedName, p_company: suggestedCompany })
      .then((joined) => { if (active) { saveToken(code, joined.token); setToken(joined.token) } })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : ''
        if (message.includes('Nombre requerido')) setNeeds((old) => ({ ...old, name: true }))
        else if (message.includes('Empresa requerida')) setNeeds((old) => ({ ...old, company: true }))
        else setJoinError(t('live.joinError'))
      }).finally(() => { if (active) setJoining(false) })
    return () => { active = false }
  }, [code, token, t, auth.status, auth.user])
  useEffect(() => {
    if (state.error && token) { clearToken(code); setToken(null) }
  }, [state.error, token, code])

  async function join(event: FormEvent) {
    event.preventDefault(); setJoining(true); setJoinError('')
    try {
      const joined = await liveRpc('join_live_session', { p_code: code, p_name: name.trim() || null, p_company: company.trim() || null })
      saveToken(code, joined.token); setToken(joined.token)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('Nombre requerido')) setNeeds((old) => ({ ...old, name: true }))
      else if (message.includes('Empresa requerida')) setNeeds((old) => ({ ...old, company: true }))
      else setJoinError(t('live.joinError'))
    } finally { setJoining(false) }
  }

  if (!rawCode) return <main className="mx-auto grid min-h-screen max-w-lg content-center p-4">
    <Card className="space-y-5"><h1 className="text-3xl font-bold">{t('live.joinTitle')}</h1>
      <form onSubmit={(event) => { event.preventDefault(); if (isLiveCode(codeInput)) navigate(`/clase/${codeInput}`) }} className="space-y-4">
        <Input label={t('live.code')} value={codeInput} maxLength={6} autoComplete="off"
          className="min-h-16 text-center text-2xl tracking-widest uppercase"
          onChange={(event) => setCodeInput(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6))} />
        <Button type="submit" className="min-h-14 w-full" disabled={!isLiveCode(codeInput)}>{t('live.enter')}</Button>
      </form></Card>
  </main>

  if (!isLiveCode(code)) return <main className="mx-auto max-w-lg p-5" role="alert">{t('live.invalidCode')}</main>
  const data = state.data
  const run = data?.run
  return <main className="mx-auto min-h-screen max-w-2xl space-y-5 p-4 text-text sm:p-6">
    <header className="flex items-center justify-between gap-3"><h1 className="text-xl font-bold">{t('live.classTitle')}</h1>
      <span className="font-mono text-lg font-bold tracking-widest">{code}</span></header>
    <div aria-live="polite" className="sr-only">{data?.session.status === 'ended' ? t('live.ended') : run && (run.status === 'open' || run.show_results) ? run.title : t('live.waiting')}</div>
    {!supabase && <Card role="alert">{t('live.unavailable')}</Card>}
    {joinError && <Card role="alert">{joinError}</Card>}
    {!token && (needs.name || needs.company) && <Card className="space-y-4">
      <h2 className="text-xl font-semibold">{t('live.yourDetails')}</h2>
      <form onSubmit={(event) => void join(event)} className="space-y-4">
        {needs.name && <Input label={t('live.name')} value={name} maxLength={200} required onChange={(event) => setName(event.target.value)} />}
        {needs.company && <Input label={t('live.company')} value={company} maxLength={200} required onChange={(event) => setCompany(event.target.value)} />}
        <Button type="submit" className="min-h-14 w-full" disabled={joining}>{t('live.enter')}</Button>
      </form></Card>}
    {(joining || state.isLoading) && !data && <Card role="status">{t('live.loading')}</Card>}
    {data?.session.status === 'ended' && <Card><h2 className="text-2xl font-bold">{t('live.ended')}</h2></Card>}
    {data?.session.status === 'active' && (!run || (run.status === 'closed' && !run.show_results && !run.reveal && !run.show_ranking && !(run.type === 'compare' && data.my_response !== null))) && <Card role="status" aria-live="polite">{t('live.waiting')}</Card>}
    {data?.session.status === 'active' && run && (run.status === 'open' || run.show_results || run.reveal || run.show_ranking || (run.type === 'compare' && data.my_response !== null)) && <Card className="space-y-6">
      <div><p className="text-sm font-semibold uppercase text-text-muted">{t(`live.types.${run.type}`)}</p>
        <h2 className="mt-1 text-2xl font-bold">{run.title}</h2>
        {typeof run.config.help === 'string' && <p className="mt-2 text-text-muted">{run.config.help}</p>}</div>
      {token && run.type === 'quiz' && <QuizRound key={run.id} run={run} code={code} token={token} mine={data.my_response} ranking={data.ranking} myRank={data.my_rank}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['live', 'student', code, token] })} />}
      {token && run.type === 'compare' && <CompareRound key={run.id} run={run} code={code} token={token} mine={data.my_response}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['live', 'student', code, token] })} />}
      {token && run.status === 'open' && run.type !== 'quiz' && run.type !== 'compare' && <LiveAnswer key={run.id} run={run} code={code} token={token} mine={data.my_response as string | string[] | number | null}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['live', 'student', code, token] })} />}
      {run.show_results && run.type !== 'quiz' && run.type !== 'compare' && <LiveResults run={run} />}
    </Card>}
  </main>
}
