import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth'
import { useLessonPlan } from '@/features/planning/planning-api'
import type { LiveRpcInput } from './live-contract'
import { liveTypes, type LiveType } from './live-utils'
import { useLiveActivities, useSaveLiveActivities } from './live-teacher-api'
import { LiveActivityEditor } from './LiveActivityEditor'
import { SessionNav } from './SessionNav'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Item = LiveRpcInput<'save_live_activities'>['p_items'][number]

function useGate(lessonId: string) {
  const auth = useAuth()
  const valid = UUID.test(lessonId)
  return { loading: auth.status === 'loading', allowed: valid && !!auth.user, lessonId: valid && auth.user ? lessonId : '' }
}

/** Momento 1 · Preparar: el guion a la izquierda y las actividades del bloque elegido a la derecha. */
export function SessionPreparePage() {
  const { t } = useTranslation()
  const { lessonId: rawLesson = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const gate = useGate(rawLesson)
  const plan = useLessonPlan(gate.lessonId)
  const activities = useLiveActivities(gate.lessonId)
  const save = useSaveLiveActivities(gate.lessonId)
  const [message, setMessage] = useState('')
  const offeringId = search.get('edicion') && UUID.test(search.get('edicion')!) ? search.get('edicion')! : ''
  const blocks = plan.data?.items ?? []
  const all = activities.data ?? []
  const count = (id: string) => all.filter((item) => item.plan_item_id === id).length
  const wanted = search.get('bloque')
  const selected = blocks.find((block) => block.id === wanted) ?? blocks.find((block) => count(block.id) > 0) ?? blocks[0]
  const mine = selected ? all.filter((item) => item.plan_item_id === selected.id).sort((a, b) => a.position - b.position) : []
  const tail = `${selected ? `bloque=${selected.id}` : ''}${offeringId ? `&edicion=${offeringId}` : ''}`

  function pick(id: string) {
    const next = new URLSearchParams(search); next.set('bloque', id); setSearch(next, { replace: true })
  }
  async function persist(next: typeof all) {
    setMessage('')
    const items: Item[] = next.map((item) => ({ id: item.id, title: item.title, type: item.type, config: item.config, plan_item_id: item.plan_item_id }))
    try { await save.mutateAsync(items) } catch { setMessage(t('live.deleteBlocked')) }
  }
  function move(id: string, offset: number) {
    const ordered = [...all].sort((a, b) => a.position - b.position)
    const peers = mine.map((item) => item.id)
    const target = peers[peers.indexOf(id) + offset]
    if (!target) return
    const a = ordered.findIndex((item) => item.id === id); const b = ordered.findIndex((item) => item.id === target)
    ;[ordered[a], ordered[b]] = [ordered[b]!, ordered[a]!]
    void persist(ordered)
  }
  function remove(id: string) {
    if (!window.confirm(t('live.confirmDeleteActivity'))) return
    void persist([...all].sort((a, b) => a.position - b.position).filter((item) => item.id !== id))
  }

  if (gate.loading) return <main className="p-8" role="status">{t('live.loading')}</main>
  if (!gate.allowed) return <main className="p-8" role="alert">{t('live.unavailable')}</main>
  return <main className="min-h-screen text-text">
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-4 sm:px-8">
      <h1 className="min-w-0 flex-1 text-2xl font-bold">{t('live.prepareTitle')}</h1>
      <SessionNav lessonId={gate.lessonId} offeringId={offeringId} current="prepare" />
    </header>
    {plan.isPending || activities.isPending ? <p className="p-8" role="status">{t('live.loading')}</p>
      : plan.isError || activities.isError ? <p className="p-8" role="alert">{t('live.editorError')}</p>
      : blocks.length === 0 ? <p className="p-8">{t('live.prepareEmpty')}</p>
      : <div className="flex flex-wrap items-start">
        <aside className="min-w-0 max-w-md flex-[1_1_22rem] border-border p-4 sm:p-6 lg:border-r">
          <p className="mb-3 text-sm text-text-muted">{t('live.prepareHint')}</p>
          <ol className="grid gap-1.5">
            {blocks.map((block) => {
              const active = block.id === selected?.id
              const n = count(block.id)
              return <li key={block.id}>
                <button type="button" aria-pressed={active} onClick={() => pick(block.id)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-control border p-3 text-left ${active ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-surface-elevated'}`}>
                  <span className="w-12 shrink-0 text-sm tabular-nums text-text-muted">{block.starts_at?.slice(0, 5) ?? ''}</span>
                  <span className={`w-1 shrink-0 self-stretch rounded ${n > 0 ? 'bg-brand' : 'bg-border'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{block.title}</span>
                    <span className="block text-xs text-text-muted">{t(`planning.kinds.${block.kind}`)}{block.minutes ? ` · ${block.minutes} min` : ''}</span>
                  </span>
                  {n > 0 && <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold">{n}</span>}
                </button>
              </li>
            })}
          </ol>
        </aside>
        {selected && <section className="min-w-0 flex-[999_1_32rem] p-4 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {selected.starts_at?.slice(0, 5)}{selected.minutes ? ` · ${selected.minutes} min` : ''} · {t(`planning.kinds.${selected.kind}`)}</p>
              <h2 className="mt-1 text-3xl font-bold">{selected.title}</h2>
              {selected.notes && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-text-muted">{selected.notes}</p>}
            </div>
            {offeringId && mine.length > 0 && <a className="inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-white"
              href={`/clase-control/${offeringId}/${gate.lessonId}?item=${selected.id}`}>{t('live.teachBlock')}</a>}
          </div>

          <h3 className="mt-8 font-semibold">{t('live.blockActivities')} <span className="font-normal text-text-muted">· {mine.length}{mine.length > 1 ? ` · ${t('live.blockOrder')}` : ''}</span></h3>
          {mine.length === 0 && <p className="mt-2 text-sm text-text-muted">{t('live.blockEmpty')}</p>}
          <ol className="mt-3 grid gap-2">
            {mine.map((item, index) => <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface-elevated p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-control border border-border text-sm font-semibold">{index + 1}</span>
              <span className="min-w-0 flex-[1_1_16rem]">
                <span className="block font-medium">{item.title}</span>
                <span className="block text-sm text-text-muted">{item.type === 'quiz' && item.config.formative === true ? t('live.classify') : t(`live.types.${item.type}`)}</span>
              </span>
              <span className="flex shrink-0 flex-wrap gap-2">
                <Button variant="secondary" aria-label={t('live.moveUp')} disabled={index === 0 || save.isPending} onClick={() => move(item.id, -1)}>↑</Button>
                <Button variant="secondary" aria-label={t('live.moveDown')} disabled={index === mine.length - 1 || save.isPending} onClick={() => move(item.id, 1)}>↓</Button>
                <Link className="inline-flex min-h-11 items-center rounded-control border border-border px-4" to={`/sesion/${gate.lessonId}/actividad/${item.id}?${tail}`}>{t('live.edit')}</Link>
                <Button variant="destructive" disabled={save.isPending} onClick={() => remove(item.id)}>{t('live.deleteActivity')}</Button>
              </span>
            </li>)}
          </ol>
          {message && <p role="alert" className="mt-2">{message}</p>}

          <h3 className="mt-10 font-semibold">{t('live.addToBlock')}</h3>
          <p className="text-sm text-text-muted">{t('live.addToBlockHint')}</p>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-2.5">
            {liveTypes.map((type) => <Link key={type} to={`/sesion/${gate.lessonId}/actividad/nueva?tipo=${type}&${tail}`}
              className="grid min-h-24 content-start gap-1 rounded-control border border-border bg-surface-elevated p-3.5 hover:border-brand">
              <span className="font-semibold">{t(`live.types.${type}`)}</span>
              <span className="text-sm text-text-muted">{t(`live.typeDesc.${type}`)}</span>
            </Link>)}
            <Link to={`/sesion/${gate.lessonId}/actividad/nueva?tipo=quiz&modo=clasificar&${tail}`}
              className="grid min-h-24 content-start gap-1 rounded-control border border-border bg-surface-elevated p-3.5 hover:border-brand">
              <span className="font-semibold">{t('live.classify')}</span>
              <span className="text-sm text-text-muted">{t('live.typeDesc.classify')}</span>
            </Link>
          </div>
        </section>}
      </div>}
  </main>
}

/** Momento 2 · Editar: una sola actividad, con el editor propio de su tipo. */
export function ActivityEditorPage() {
  const { t } = useTranslation()
  const { lessonId: rawLesson = '', activityId = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const gate = useGate(rawLesson)
  const activities = useLiveActivities(gate.lessonId)
  const plan = useLessonPlan(gate.lessonId)
  const [newId] = useState(() => crypto.randomUUID())
  const isNew = activityId === 'nueva'
  const requested = search.get('tipo')
  const classify = requested === 'quiz' && search.get('modo') === 'clasificar'
  const type: LiveType | undefined = liveTypes.find((value) => value === requested)
  const block = search.get('bloque') && UUID.test(search.get('bloque')!) ? search.get('bloque')! : null
  const offering = search.get('edicion') && UUID.test(search.get('edicion')!) ? search.get('edicion')! : ''
  const back = `/sesion/${gate.lessonId}?${block ? `bloque=${block}` : ''}${offering ? `&edicion=${offering}` : ''}`
  const existing = activities.data?.find((item) => item.id === activityId)
  const shownType = isNew ? type : existing?.type
  const blockTitle = plan.data?.items.find((item) => item.id === (existing?.plan_item_id ?? block))?.title
  const valid = isNew ? !!type : UUID.test(activityId)

  if (gate.loading) return <main className="p-8" role="status">{t('live.loading')}</main>
  if (!gate.allowed || !valid) return <main className="p-8" role="alert">{t('live.unavailable')}</main>
  return <main className="min-h-screen text-text">
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-3 sm:px-8">
      <Link className="inline-flex min-h-11 items-center rounded-control border border-border px-4" to={back}>{t('live.backToScript')}</Link>
      <div className="min-w-0 flex-1">
        {blockTitle && <p className="text-sm text-text-muted">{blockTitle}</p>}
        <h1 className="text-xl font-bold">{shownType ? t('live.editorOf', { type: classify || (existing?.type === 'quiz' && existing.config.formative === true) ? t('live.classify') : t(`live.types.${shownType}`) }) : t('live.newActivity')}</h1>
      </div>
    </header>
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      {!isNew && activities.isSuccess && !existing ? <p role="alert">{t('live.unavailable')}</p>
        : <LiveActivityEditor key={isNew ? newId : activityId} lessonId={gate.lessonId} editable
          only={isNew && type ? { id: newId, create: { type, planItemId: block, config: classify ? { options: [['auto', 'AUTOMATIZACIÓN'], ['ia', 'IA'], ['agente', 'AGENTE IA'], ['humano', 'HUMANO / SUPERVISIÓN HUMANA']].map(([id, label]) => ({ id, label })), correct: 'auto', explanation: '', seconds: 20, concept: '', formative: true } : undefined } } : { id: activityId }}
          onSaved={() => navigate(back)} />}
    </div>
  </main>
}
