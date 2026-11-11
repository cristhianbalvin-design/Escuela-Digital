import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'

const field = 'w-full min-w-0 rounded-control border border-border bg-surface p-2'
type QuizOption = { id: string; label: string }
type CompareOption = QuizOption & { real_name: string; content: string }
type Criterion = { id: string; label: string; description: string }
const letters = 'ABCDEF'
export function defaultSpecialConfig(type: 'quiz' | 'compare'): Record<string, unknown> {
  if (type === 'quiz') return { options: [0, 1].map((i) => ({ id: letters[i], label: '' })), correct: 'A', explanation: '', seconds: 30, concept: '' }
  return { description: '', options: [0, 1, 2].map((i) => ({ id: letters[i], label: `MODELO ${letters[i]}`, real_name: '', content: '' })), criteria: [{ id: crypto.randomUUID(), label: '', description: '' }], scale_max: 5, final_question: '', ask_comment: false, comment_max: 200 }
}

export function LiveSpecialEditor({ type, config, change, editable }: { type: 'quiz' | 'compare'; config: Record<string, unknown>; change: (value: Record<string, unknown>) => void; editable: boolean }) {
  const { t } = useTranslation()
  const radioName = useId()
  if (type === 'quiz') {
    const options = config.options as QuizOption[]
    return <div className="grid gap-3"><fieldset className="grid gap-2"><legend className="font-semibold">{t('live.options')}</legend>
      {options.map((option, index) => <div key={option.id} className="flex items-center gap-2"><input type="radio" name={radioName} aria-label={t('live.correctOption', { label: option.id })} checked={config.correct === option.id} disabled={!editable} onChange={() => change({ ...config, correct: option.id })} /><span className="font-bold">{letters[index]}</span><input className={field} maxLength={200} value={option.label} disabled={!editable} aria-label={t('live.optionNumber', { number: index + 1 })} onChange={(event) => change({ ...config, options: options.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} />{editable && <Button variant="secondary" disabled={options.length <= 2} onClick={() => { const next = options.filter((_, i) => i !== index); change({ ...config, options: next, correct: config.correct === option.id ? next[0]!.id : config.correct }) }}>{t('live.remove')}</Button>}</div>)}
      {editable && <Button variant="secondary" className="w-fit" disabled={options.length >= 6} onClick={() => change({ ...config, options: [...options, { id: letters.split('').find((letter) => !options.some((option) => option.id === letter))!, label: '' }] })}>{t('live.addOption')}</Button>}
    </fieldset>
      <label>{t('live.explanation')}<textarea className={`${field} min-h-24`} maxLength={400} value={String(config.explanation ?? '')} disabled={!editable} onChange={(event) => change({ ...config, explanation: event.target.value })} /></label>
      <div className="grid gap-2 sm:grid-cols-2"><label>{t('live.seconds')}<input className={field} type="number" min={5} max={120} value={Number(config.seconds)} disabled={!editable} onChange={(event) => change({ ...config, seconds: Number(event.target.value) })} /></label><label>{t('live.concept')}<input className={field} maxLength={80} value={String(config.concept ?? '')} disabled={!editable} onChange={(event) => change({ ...config, concept: event.target.value })} /></label></div>
    </div>
  }
  const options = config.options as CompareOption[]
  const criteria = config.criteria as Criterion[]
  return <div className="grid gap-4">
    <label>{t('live.description')}<textarea className={`${field} min-h-28`} maxLength={2000} value={String(config.description ?? '')} disabled={!editable} onChange={(event) => change({ ...config, description: event.target.value })} /></label>
    <fieldset className="grid gap-3"><legend className="font-semibold">{t('live.models')}</legend>{options.map((option, index) => <div key={option.id} className="grid gap-2 rounded-control border border-border p-3"><div className="grid gap-2 sm:grid-cols-2"><label>{t('live.modelLabel')}<input className={field} maxLength={200} value={option.label} disabled={!editable} onChange={(event) => change({ ...config, options: options.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label><label>{t('live.realName')}<input className={field} maxLength={60} value={option.real_name} disabled={!editable} onChange={(event) => change({ ...config, options: options.map((item, i) => i === index ? { ...item, real_name: event.target.value } : item) })} /></label></div><label>{t('live.modelContent')}<textarea className={`${field} min-h-60`} maxLength={20000} value={option.content} disabled={!editable} onChange={(event) => change({ ...config, options: options.map((item, i) => i === index ? { ...item, content: event.target.value } : item) })} /></label>{editable && <Button variant="secondary" className="w-fit" disabled={options.length <= 2} onClick={() => change({ ...config, options: options.filter((_, i) => i !== index) })}>{t('live.remove')}</Button>}</div>)}{editable && <Button variant="secondary" className="w-fit" disabled={options.length >= 5} onClick={() => change({ ...config, options: [...options, { id: crypto.randomUUID(), label: `MODELO ${letters[options.length]}`, real_name: '', content: '' }] })}>{t('live.addModel')}</Button>}</fieldset>
    <fieldset className="grid gap-2"><legend className="font-semibold">{t('live.criteria')}</legend>{criteria.map((criterion, index) => <div key={criterion.id} className="flex flex-wrap gap-2"><input className={field} maxLength={80} aria-label={t('live.criterion')} placeholder={t('live.criterion')} value={criterion.label} disabled={!editable} onChange={(event) => change({ ...config, criteria: criteria.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><input className={field} maxLength={300} aria-label={t('live.criterionDescription')} placeholder={t('live.criterionDescription')} value={criterion.description} disabled={!editable} onChange={(event) => change({ ...config, criteria: criteria.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} />{editable && <Button variant="secondary" disabled={criteria.length <= 1} onClick={() => change({ ...config, criteria: criteria.filter((_, i) => i !== index) })}>{t('live.remove')}</Button>}</div>)}{editable && <Button variant="secondary" className="w-fit" disabled={criteria.length >= 10} onClick={() => change({ ...config, criteria: [...criteria, { id: crypto.randomUUID(), label: '', description: '' }] })}>{t('live.addCriterion')}</Button>}</fieldset>
    <label>{t('live.scaleMax')}<input className={field} type="number" min={3} max={10} value={Number(config.scale_max ?? 5)} disabled={!editable} onChange={(event) => change({ ...config, scale_max: Number(event.target.value) })} /></label>
    <label>{t('live.finalQuestion')}<input className={field} maxLength={200} value={String(config.final_question ?? '')} disabled={!editable} onChange={(event) => change({ ...config, final_question: event.target.value })} /></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(config.ask_comment)} disabled={!editable} onChange={(event) => change({ ...config, ask_comment: event.target.checked })} />{t('live.askComment')}</label>
    {Boolean(config.ask_comment) && <label>{t('live.commentMax')}<input className={field} type="number" min={0} max={200} value={Number(config.comment_max ?? 200)} disabled={!editable} onChange={(event) => change({ ...config, comment_max: Number(event.target.value) })} /></label>}
  </div>
}
