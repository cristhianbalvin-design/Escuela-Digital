import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useLessonPlan } from '@/features/planning/planning-api'
import type { LiveRpcInput, LiveRpcOutput, LiveSetKind } from './live-contract'
import type { LiveType } from './live-utils'
import { LiveActivityEditor } from './LiveActivityEditor'
import { useDeleteLiveSet, useLiveActivities, useLiveSets, useSaveLiveActivities, useSaveLiveSet } from './live-teacher-api'

type Sets = LiveRpcOutput<'get_live_sets'>
type Item = LiveRpcInput<'save_live_activities'>['p_items'][number]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Qué preguntas admite cada tipo de actividad. */
export const kindQuestions: Record<LiveSetKind, LiveType[]> = {
  survey: ['poll_single', 'poll_multi', 'wordcloud', 'scale', 'open', 'vote'],
  static_quiz: ['quiz'], dynamic_quiz: ['quiz'], compare: ['compare'], opportunity: ['opportunity'],
}
const single = (kind: LiveSetKind) => kind === 'compare' || kind === 'opportunity'
export const kindReady = (kind: LiveSetKind) => kind !== 'static_quiz'

function useBase() {
  const { courseId = '', lessonId = '' } = useParams()
  const { search } = useLocation()
  return { lessonId, base: `/docente/cursos/${courseId}/sesiones/${lessonId}`, search }
}
function setLabel(t: (key: string, options?: Record<string, unknown>) => string, set: Sets[number]) {
  const kind = set.kind === 'dynamic_quiz' && set.settings.formative ? t('sets.kinds.dynamic_formative') : t(`sets.kinds.${set.kind}`)
  return single(set.kind) ? kind : `${kind} · ${t('sets.questions', { count: set.question_count })}`
}

/** Guion de la sesión: una fila por bloque, con sus actividades como tarjetas compactas. */
export function SessionScript({ lessonId, base, editable }: { lessonId: string; base: string; editable: boolean }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const plan = useLessonPlan(lessonId)
  const sets = useLiveSets(lessonId)
  if (plan.isPending || sets.isPending) return <Skeleton className="h-64" />
  if (plan.isError || sets.isError) return <p role="alert">{t('planning.error')}</p>
  const blocks = plan.data.items
  const totalMinutes = blocks.reduce((sum, block) => sum + (block.minutes ?? 0), 0)
  const questions = sets.data.reduce((sum, set) => sum + set.question_count, 0)
  const unlinked = sets.data.filter((set) => !set.plan_item_id || !blocks.some((block) => block.id === set.plan_item_id))
  const card = (set: Sets[number]) => <Link key={set.id} to={{ pathname: `${base}/actividades/${set.id}`, search }}
    className="inline-flex min-h-12 flex-col justify-center rounded-control border border-border bg-surface-elevated px-3.5 py-1 hover:border-brand">
    <span className="text-sm font-semibold">{set.title}</span><span className="text-xs text-text-muted">{setLabel(t, set)}</span></Link>
  const add = (blockId: string | null, title: string) => <Link to={{ pathname: `${base}/actividades/nueva`, search: `${search ? `${search}&` : '?'}bloque=${blockId ?? ''}` }}
    aria-label={t('sets.addTo', { title })} className="inline-flex min-h-12 items-center rounded-control border border-dashed border-border px-3.5 text-sm text-text-muted hover:border-brand">+ {t('sets.add')}</Link>
  return <div className="grid gap-3">
    <p className="text-sm text-text-muted">{t('sets.summary', { blocks: blocks.length, minutes: totalMinutes, activities: sets.data.length, questions })}</p>
    {blocks.length === 0 && <EmptyState title={t('sets.noBlocks')} />}
    <ol className="grid gap-2">{blocks.map((block) => {
      const mine = sets.data.filter((set) => set.plan_item_id === block.id)
      return <li key={block.id} className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-3">
        <span className="w-12 shrink-0 font-semibold tabular-nums">{block.starts_at?.slice(0, 5) ?? ''}</span>
        <span aria-hidden="true" className={`h-9 w-1 shrink-0 rounded ${mine.length ? 'bg-brand' : 'bg-border'}`} />
        <span className="min-w-0 flex-[1_1_15rem]">
          <span className="block font-semibold">{block.title}</span>
          <span className="block text-sm text-text-muted">{t(`planning.kinds.${block.kind}`)}{block.minutes ? ` · ${block.minutes} min` : ''}{block.resource ? ` · ${block.resource}` : ''}</span>
        </span>
        <span className="flex min-w-0 flex-[2_1_20rem] flex-wrap justify-end gap-2">{mine.map(card)}{editable && add(block.id, block.title)}</span>
      </li>
    })}</ol>
    {unlinked.length > 0 && <div className="grid gap-2"><p className="font-semibold">{t('sets.unlinked')}</p><div className="flex flex-wrap gap-2">{unlinked.map(card)}</div></div>}
  </div>
}

/** Elegir el tipo de una actividad nueva para un bloque. */
export function NewActivityPage() {
  const { t } = useTranslation()
  const { lessonId, base, search } = useBase()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const plan = useLessonPlan(lessonId)
  const saveSet = useSaveLiveSet(lessonId)
  const [error, setError] = useState('')
  const blockId = params.get('bloque') && UUID.test(params.get('bloque')!) ? params.get('bloque')! : null
  const block = plan.data?.items.find((item) => item.id === blockId)
  const kinds: { kind: LiveSetKind; formative?: boolean; group: 'multi' | 'special' }[] = [
    { kind: 'survey', group: 'multi' }, { kind: 'static_quiz', group: 'multi' }, { kind: 'dynamic_quiz', group: 'multi' },
    { kind: 'dynamic_quiz', formative: true, group: 'multi' }, { kind: 'compare', group: 'special' }, { kind: 'opportunity', group: 'special' },
  ]
  async function create(kind: LiveSetKind, formative?: boolean) {
    setError('')
    try {
      const title = t(formative ? 'sets.kinds.dynamic_formative' : `sets.kinds.${kind}`)
      const result = await saveSet.mutateAsync({ plan_item_id: blockId, title, kind, settings: formative ? { formative: true } : {} })
      navigate({ pathname: `${base}/actividades/${result.id}`, search: single(kind) ? `${search ? `${search}&` : '?'}crear=1` : search })
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('sets.error')) }
  }
  const back = { pathname: base, search }
  return <section className="grid gap-5">
    <Link className="w-fit underline" to={back}>← {t('sets.backToScript')}</Link>
    <div><h1 className="font-heading text-2xl font-bold">{t('sets.newTitle')}</h1>
      <p className="text-text-muted">{block ? t('sets.forBlock', { title: block.title }) : t('sets.newHint')}</p></div>
    {(['multi', 'special'] as const).map((group) => <div key={group} className="grid gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t(`sets.group.${group}`)}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-3">{kinds.filter((item) => item.group === group).map((item) => {
        const key = item.formative ? 'dynamic_formative' : item.kind
        const ready = kindReady(item.kind)
        return <button key={key} type="button" disabled={!ready || saveSet.isPending} onClick={() => void create(item.kind, item.formative)}
          className="grid content-start gap-2 rounded-control border border-border bg-surface-elevated p-4 text-left enabled:hover:border-brand disabled:opacity-60">
          <span className="text-lg font-semibold">{t(`sets.kinds.${key}`)}{!ready && ` · ${t('sets.soon')}`}</span>
          <span className="text-sm">{t(`sets.desc.${key}`)}</span>
          <span className="text-xs text-text-muted">{t(`sets.pace.${key}`)}</span>
        </button>
      })}</div>
    </div>)}
    {error && <p role="alert">{error}</p>}
  </section>
}

/** Detalle de una actividad: sus preguntas en orden y sus ajustes. */
export function ActivityPage() {
  const { t } = useTranslation()
  const { lessonId, base, search } = useBase()
  const { setId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const plan = useLessonPlan(lessonId)
  const sets = useLiveSets(lessonId)
  const activities = useLiveActivities(lessonId)
  const saveSet = useSaveLiveSet(lessonId)
  const deleteSet = useDeleteLiveSet(lessonId)
  const saveQuestions = useSaveLiveActivities(lessonId)
  const [title, setTitle] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const set = sets.data?.find((item) => item.id === setId)
  const all = [...(activities.data ?? [])].sort((a, b) => a.position - b.position)
  const questions = all.filter((item) => item.set_id === setId)
  const back = { pathname: base, search }
  const question = (id: string, extra = '') => ({ pathname: `${base}/actividades/${setId}/preguntas/${id}`, search: `${search ? `${search}&` : '?'}${extra}`.replace(/[?&]$/, '') })

  if (sets.isPending || activities.isPending) return <Skeleton className="h-64" />
  if (!set) return <EmptyState title={t('sets.notFound')} />
  if (single(set.kind) && questions.length === 0 && params.get('crear') === '1') {
    return <QuestionEditor lessonId={lessonId} setId={set.id} planItemId={set.plan_item_id} type={set.kind as LiveType} onDone={() => navigate({ pathname: `${base}/actividades/${setId}`, search })} />
  }
  const blocks = plan.data?.items ?? []
  const allowed = kindQuestions[set.kind]
  const blockTitle = blocks.find((block) => block.id === set.plan_item_id)?.title

  async function update(change: Partial<LiveRpcInput<'save_live_set'>['p_set']>) {
    if (!set) return
    setMessage('')
    try { await saveSet.mutateAsync({ id: set.id, plan_item_id: set.plan_item_id, title: set.title, kind: set.kind, settings: set.settings, ...change }); setMessage(t('teacherCommon.saved')) }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : t('sets.error')) }
  }
  async function persist(next: typeof all) {
    setMessage('')
    const items: Item[] = next.map((item) => ({ id: item.id, title: item.title, type: item.type, config: item.config, set_id: item.set_id, plan_item_id: item.plan_item_id }))
    try { await saveQuestions.mutateAsync(items) } catch { setMessage(t('live.deleteBlocked')) }
  }
  function move(id: string, offset: number) {
    const ids = questions.map((item) => item.id)
    const target = ids[ids.indexOf(id) + offset]
    if (!target) return
    const copy = [...all]
    const a = copy.findIndex((item) => item.id === id); const b = copy.findIndex((item) => item.id === target)
    ;[copy[a], copy[b]] = [copy[b]!, copy[a]!]
    void persist(copy)
  }
  function remove(id: string) {
    if (window.confirm(t('live.confirmDeleteActivity'))) void persist(all.filter((item) => item.id !== id))
  }
  async function removeSet() {
    if (!set || !window.confirm(t('sets.confirmDelete'))) return
    try { await deleteSet.mutateAsync(set.id); navigate(back) }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : t('sets.error')) }
  }
  const field = 'min-h-11 w-full rounded-control border border-border bg-surface px-3'
  return <section className="grid gap-5">
    <nav aria-label={t('sessions.breadcrumb')} className="flex flex-wrap gap-2 text-sm text-text-muted">
      <Link className="underline" to={back}>{t('sets.backToScript')}</Link>
      {blockTitle && <><span aria-hidden="true">/</span><span>{blockTitle}</span></>}
    </nav>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-muted">{setLabel(t, set)}</p>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">{set.title}</h1>
      </div>
    </div>
    <div className="flex flex-wrap items-start gap-6">
      <div className="grid min-w-0 flex-[999_1_32rem] gap-3">
        <h2 className="font-semibold">{t(single(set.kind) ? 'sets.content' : 'sets.questionList')}</h2>
        {questions.length === 0 && <p className="text-sm text-text-muted">{t('sets.noQuestions')}</p>}
        <ol className="grid gap-2">{questions.map((item, index) => <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface-elevated p-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-control border border-border text-sm font-semibold">{index + 1}</span>
          <span className="min-w-0 flex-[1_1_16rem]"><span className="block font-medium">{item.title || t('sets.untitled')}</span>
            <span className="block text-sm text-text-muted">{t(`live.types.${item.type}`)}</span></span>
          <span className="flex shrink-0 flex-wrap gap-2">
            {!single(set.kind) && <><Button variant="secondary" aria-label={t('live.moveUp')} disabled={index === 0 || saveQuestions.isPending} onClick={() => move(item.id, -1)}>↑</Button>
              <Button variant="secondary" aria-label={t('live.moveDown')} disabled={index === questions.length - 1 || saveQuestions.isPending} onClick={() => move(item.id, 1)}>↓</Button></>}
            <Link className="inline-flex min-h-11 items-center rounded-control border border-border px-4" to={question(item.id)}>{t('live.edit')}</Link>
            {!single(set.kind) && <Button variant="destructive" disabled={saveQuestions.isPending} onClick={() => remove(item.id)}>{t('live.deleteActivity')}</Button>}
          </span>
        </li>)}</ol>
        {(!single(set.kind) || questions.length === 0) && <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">+ {t('sets.addQuestion')}:</span>
          {allowed.map((type) => <Link key={type} to={question('nueva', `tipo=${type}`)} className="inline-flex min-h-11 items-center rounded-control border border-dashed border-border px-3.5 text-sm hover:border-brand">{t(`live.types.${type}`)}</Link>)}
        </div>}
      </div>
      <aside className="grid min-w-0 max-w-sm flex-[1_1_18rem] gap-3">
        <Card className="grid gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">{t('sets.settings')}</h2>
          <Input label={t('sets.title')} value={title ?? set.title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          <Button className="w-fit" variant="secondary" disabled={saveSet.isPending || !(title ?? '').trim() || title === set.title} onClick={() => void update({ title: (title ?? '').trim() }).then(() => setTitle(null))}>{t('teacherCommon.save')}</Button>
          <label className="grid gap-1 text-sm font-semibold">{t('sets.block')}
            <select className={field} value={set.plan_item_id ?? ''} disabled={saveSet.isPending} onChange={(event) => void update({ plan_item_id: event.target.value || null })}>
              <option value="">{t('sets.noBlock')}</option>{blocks.map((block) => <option key={block.id} value={block.id}>{block.starts_at?.slice(0, 5) ?? ''} {block.title}</option>)}</select></label>
          <p className="text-sm"><span className="font-semibold">{t('sets.pace.label')}:</span> {t(`sets.pace.${set.kind === 'dynamic_quiz' && set.settings.formative ? 'dynamic_formative' : set.kind}`)}</p>
          {set.kind === 'dynamic_quiz' && <label className="flex items-center gap-2"><input type="checkbox" checked={!!set.settings.formative} disabled={saveSet.isPending}
            onChange={(event) => void update({ settings: event.target.checked ? { formative: true } : {} })} />{t('live.formative')}</label>}
        </Card>
        <Button variant="destructive" disabled={deleteSet.isPending} onClick={() => void removeSet()}>{t('sets.delete')}</Button>
        {message && <p role="status">{message}</p>}
      </aside>
    </div>
  </section>
}

function QuestionEditor({ lessonId, setId, planItemId, type, questionId, onDone }: {
  lessonId: string; setId: string; planItemId: string | null; type?: LiveType; questionId?: string; onDone: () => void
}) {
  const [newId] = useState(() => crypto.randomUUID())
  const sets = useLiveSets(lessonId)
  const formative = !!sets.data?.find((set) => set.id === setId)?.settings.formative
  const create = type ? { type, planItemId, setId, config: type === 'quiz' && formative ? { options: [{ id: 'A', label: '' }, { id: 'B', label: '' }], correct: 'A', explanation: '', seconds: 20, concept: '', formative: true } : undefined } : undefined
  return <LiveActivityEditor key={questionId ?? newId} lessonId={lessonId} editable
    only={questionId ? { id: questionId } : { id: newId, create }} onSaved={onDone} />
}

/** Editor de una pregunta de la actividad, con su vista previa. */
export function QuestionPage() {
  const { t } = useTranslation()
  const { lessonId, base, search } = useBase()
  const { setId = '', questionId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sets = useLiveSets(lessonId)
  const set = sets.data?.find((item) => item.id === setId)
  const requested = params.get('tipo')
  const isNew = questionId === 'nueva'
  const type = set && isNew ? kindQuestions[set.kind].find((value) => value === requested) : undefined
  const clean = search.replace(/([?&])tipo=[^&]*&?/, '$1').replace(/[?&]$/, '')
  const back = { pathname: `${base}/actividades/${setId}`, search: clean }
  if (sets.isPending) return <Skeleton className="h-64" />
  if (!set || (isNew && !type) || (!isNew && !UUID.test(questionId))) return <EmptyState title={t('sets.notFound')} />
  return <section className="grid gap-4">
    <Link className="w-fit underline" to={back}>← {set.title}</Link>
    <h1 className="font-heading text-2xl font-bold">{isNew && type ? t('live.editorOf', { type: t(`live.types.${type}`) }) : t('sets.editQuestion')}</h1>
    <QuestionEditor lessonId={lessonId} setId={set.id} planItemId={set.plan_item_id} type={type} questionId={isNew ? undefined : questionId} onDone={() => navigate(back)} />
  </section>
}
