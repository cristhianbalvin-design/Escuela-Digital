import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useLessonPlan } from '@/features/planning/planning-api'
import { liveRpcInputSchemas, type LiveRpcInput } from './live-contract'
import { liveActivitySchema, liveTypes, type LiveType } from './live-utils'
import { useLiveActivities, useSaveLiveActivities } from './live-teacher-api'
import { defaultSpecialConfig, LiveSpecialEditor } from './LiveSpecialEditor'
import { groupLiveActivities } from './live-groups'

type Item = LiveRpcInput<'save_live_activities'>['p_items'][number]
const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-2'
function defaultConfig(type: LiveType): Record<string, unknown> {
  if (type === 'quiz' || type === 'compare') return defaultSpecialConfig(type)
  if (type === 'poll_single' || type === 'poll_multi' || type === 'vote')
    return { options: [{ id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' }] }
  if (type === 'wordcloud') return { max_answers: 3 }
  if (type === 'scale') return { scale_min: 1, scale_max: 5, labels: {} }
  return {}
}

export function LiveActivityEditor({ lessonId, editable }: { lessonId: string; editable: boolean }) {
  const { t } = useTranslation()
  const query = useLiveActivities(lessonId)
  const plan = useLessonPlan(lessonId)
  const save = useSaveLiveActivities(lessonId)
  const [draft, setDraft] = useState<Item[] | null>(null)
  const [message, setMessage] = useState('')
  const items = draft ?? query.data?.map((item): Item => ({ id: item.id, title: item.title, type: item.type, config: item.config, plan_item_id: item.plan_item_id })) ?? []
  const planItems = plan.data?.items ?? []
  function update(index: number, item: Item) { setDraft(items.map((current, i) => i === index ? item : current)) }
  function move(index: number, offset: number) {
    const copy = [...items]
    const peers = copy.map((item, i) => item.plan_item_id === copy[index]?.plan_item_id ? i : -1).filter((i) => i >= 0)
    const target = peers[peers.indexOf(index) + offset]
    if (target === undefined) return
    ;[copy[index], copy[target]] = [copy[target]!, copy[index]!]
    setDraft(copy)
  }
  async function submit() {
    const parsed = liveRpcInputSchemas.save_live_activities.safeParse({ p_lesson_id: lessonId, p_items: items })
    if (!parsed.success || !items.every((item) => liveActivitySchema.safeParse({ type: item.type, config: item.config }).success)) {
      setMessage(t('live.editorInvalid')); return
    }
    try { await save.mutateAsync(items); setDraft(null); setMessage(t('live.editorSaved')) }
    catch (error) { setMessage(error instanceof Error ? error.message : t('live.editorError')) }
  }
  return <section className="grid gap-3 rounded-control border border-border bg-surface-elevated p-3">
    <h4 className="font-semibold">{t('live.editorTitle')}</h4>
    {query.isPending ? <p>{t('live.loading')}</p> : query.isError ? <p role="alert">{t('live.editorError')}</p> : <>
      {items.length === 0 && <p className="text-sm text-text-muted">{t('live.editorEmpty')}</p>}
      {groupLiveActivities(items.map((item, index) => ({ ...item, plan_item_id: item.plan_item_id ?? null, index, position: index })), planItems).map((group) => <section key={group.id ?? 'unlinked'} className="grid gap-2"><h5 className="font-semibold">{group.title ?? t('live.unlinked')}</h5>{group.activities.map((entry) => {
        const index = entry.index
        const item = items[index]!
        const options = (item.type === 'poll_single' || item.type === 'poll_multi' || item.type === 'vote') && Array.isArray(item.config.options)
          ? item.config.options as { id: string; label: string; score?: number }[] : null
        const change = (configValue: Record<string, unknown>) => update(index, { ...item, config: configValue })
        const optionalText = (key: 'help' | 'indicator_label' | 'context', value: string) => {
          const next = { ...item.config }
          if (value) next[key] = value
          else delete next[key]
          change(next)
        }
        return <div key={item.id ?? index} className="grid min-w-0 gap-2 rounded-control border border-border p-3">
          <label>{t('live.activityTitle')}<input className={field} maxLength={200} value={item.title} disabled={!editable} onChange={(e) => update(index, { ...item, title: e.target.value })} /></label>
          {typeof item.config.help === 'string' && <p className="text-sm text-text-muted">{item.config.help}</p>}
          <label>{t('live.activityHelp')}<input className={field} maxLength={200} value={typeof item.config.help === 'string' ? item.config.help : ''} disabled={!editable} onChange={(e) => optionalText('help', e.target.value)} /></label>
          <label>{t('live.contextEditor')}<textarea className={`${field} min-h-28`} maxLength={6000} value={typeof item.config.context === 'string' ? item.config.context : ''} disabled={!editable} onChange={(e) => optionalText('context', e.target.value)} /></label>
          {(item.type === 'poll_single' || item.type === 'vote') && <label>{t('live.indicatorLabelEditor')}<input className={field} maxLength={60} value={typeof item.config.indicator_label === 'string' ? item.config.indicator_label : ''} disabled={!editable} onChange={(e) => optionalText('indicator_label', e.target.value)} /></label>}
          <div className="grid gap-2 sm:grid-cols-2"><label>{t('live.activityType')}<select className={field} value={item.type} disabled={!editable} onChange={(e) => { const type = liveTypes.find((value) => value === e.target.value); if (type) update(index, { ...item, type, config: { ...defaultConfig(type), ...(typeof item.config.context === 'string' ? { context: item.config.context } : {}) } }) }}>{liveTypes.map((type) => <option key={type} value={type}>{t(`live.types.${type}`)}</option>)}</select></label>
            <label>{t('live.planLink')}<select className={field} value={item.plan_item_id ?? ''} disabled={!editable || plan.isPending} onChange={(e) => update(index, { ...item, plan_item_id: e.target.value || null })}><option value="">{t('live.noPlanLink')}</option>{planItems.map((planItem) => <option key={planItem.id} value={planItem.id}>{planItem.title}</option>)}</select></label></div>
          {options && <fieldset className="grid gap-2"><legend className="font-medium">{t('live.options')}</legend>{options.map((option, optionIndex) => <div key={option.id} className="flex min-w-0 gap-2"><input className={field} aria-label={t('live.optionNumber', { number: optionIndex + 1 })} maxLength={200} value={option.label} disabled={!editable} onChange={(e) => change({ ...item.config, options: options.map((candidate, i) => i === optionIndex ? { ...candidate, label: e.target.value } : candidate) })} /><input className="w-20 rounded-control border border-border bg-surface p-2" type="number" min={0} max={100} step={1} aria-label={t('live.optionScore', { number: optionIndex + 1 })} placeholder={t('live.score')} value={option.score ?? ''} disabled={!editable} onChange={(e) => change({ ...item.config, options: options.map((candidate, i) => { if (i !== optionIndex) return candidate; const next = { ...candidate }; if (e.target.value === '') delete next.score; else next.score = Number(e.target.value); return next }) })} />{editable && <Button variant="secondary" disabled={options.length <= 2} aria-label={t('live.removeOption', { number: optionIndex + 1 })} onClick={() => change({ ...item.config, options: options.filter((_, i) => i !== optionIndex) })}>×</Button>}</div>)}{editable && <Button variant="secondary" className="w-fit" disabled={options.length >= 20} onClick={() => change({ ...item.config, options: [...options, { id: crypto.randomUUID(), label: '' }] })}>{t('live.addOption')}</Button>}</fieldset>}
          {item.type === 'poll_multi' && <label>{t('live.maxChoicesEditor')}<input className={field} type="number" min={1} max={options?.length ?? 20} value={typeof item.config.max_choices === 'number' ? item.config.max_choices : ''} disabled={!editable} onChange={(e) => { const next = { ...item.config }; if (e.target.value) next.max_choices = Number(e.target.value); else delete next.max_choices; change(next) }} /></label>}
          {item.type === 'wordcloud' && <label>{t('live.maxAnswersEditor')}<input className={field} type="number" min={1} max={20} value={typeof item.config.max_answers === 'number' ? item.config.max_answers : 3} disabled={!editable} onChange={(e) => change({ ...item.config, max_answers: Number(e.target.value) })} /></label>}
          {item.type === 'scale' && <div className="grid gap-2 sm:grid-cols-2"><label>{t('live.scaleMin')}<input className={field} type="number" min={-100} max={100} value={typeof item.config.scale_min === 'number' ? item.config.scale_min : 1} disabled={!editable} onChange={(e) => change({ ...item.config, scale_min: Number(e.target.value) })} /></label><label>{t('live.scaleMax')}<input className={field} type="number" min={-100} max={100} value={typeof item.config.scale_max === 'number' ? item.config.scale_max : 5} disabled={!editable} onChange={(e) => change({ ...item.config, scale_max: Number(e.target.value) })} /></label>{['scale_min', 'scale_max'].map((bound) => { const value = item.config[bound]; const labels = item.config.labels && typeof item.config.labels === 'object' ? item.config.labels as Record<string, string> : {}; return <label key={bound}>{t(bound === 'scale_min' ? 'live.scaleMinLabel' : 'live.scaleMaxLabel')}<input className={field} maxLength={200} value={typeof value === 'number' ? labels[String(value)] ?? '' : ''} disabled={!editable} onChange={(e) => { if (typeof value === 'number') change({ ...item.config, labels: { ...labels, [String(value)]: e.target.value } }) }} /></label> })}</div>}
          {(item.type === 'quiz' || item.type === 'compare') && <LiveSpecialEditor type={item.type} config={item.config} change={change} editable={editable} />}
          {editable && <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={group.activities[0]?.index === index} aria-label={t('live.moveUp')} onClick={() => move(index, -1)}>↑</Button><Button variant="secondary" disabled={group.activities.at(-1)?.index === index} aria-label={t('live.moveDown')} onClick={() => move(index, 1)}>↓</Button><Button variant="secondary" onClick={() => setDraft([...items.slice(0, index + 1), { ...item, id: crypto.randomUUID(), title: `${item.title} (${t('live.copy')})` }, ...items.slice(index + 1)])}>{t('live.duplicateActivity')}</Button><Button variant="destructive" onClick={() => setDraft(items.filter((_, i) => i !== index))}>{t('live.deleteActivity')}</Button></div>}
        </div>
      })}</section>)}
      {editable && <div className="flex flex-wrap items-center gap-2"><label>{t('live.addActivity')}<select className={field} value="" onChange={(e) => { const type = liveTypes.find((value) => value === e.target.value); if (type) setDraft([...items, { id: crypto.randomUUID(), title: '', type, config: defaultConfig(type), plan_item_id: null }]) }}><option value="">{t('live.chooseType')}</option>{liveTypes.map((type) => <option key={type} value={type}>{t(`live.types.${type}`)}</option>)}</select></label><Button disabled={draft === null || save.isPending} onClick={() => void submit()}>{t('live.saveActivities')}</Button></div>}
    </>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>
}
