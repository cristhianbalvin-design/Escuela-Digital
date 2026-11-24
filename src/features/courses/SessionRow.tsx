import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui'
import type { CoursePrepStatus } from '@/features/live/live-contract'
import type { Lesson } from './api'

export function prepState(s: CoursePrepStatus) {
  const missing: string[] = []
  if (!s.materials) missing.push('material')
  if (!s.slides) missing.push('presentation')
  else if (s.slide_notes < s.slides) missing.push('notes')
  if (!s.blocks) missing.push('guide')
  return { missing, ready: missing.length === 0, empty: !s.materials && !s.slides && !s.blocks && !s.activities }
}

export function SessionRow({ lesson, number, status, editable, pending, canUp, canDown, onMove }: {
  lesson: Lesson; number: number; status: CoursePrepStatus; editable: boolean; pending: boolean
  canUp: boolean; canDown: boolean; onMove: (direction: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const state = prepState(status)
  const session = t('sessions.number', { number })
  const stateLabel = state.ready ? t('prep.ready') : state.empty ? t('prep.empty') : t('prep.missingList', { list: state.missing.map((key) => t(`prep.short.${key}`)).join(', ') })
  const cells: { key: string; section: string; ok: boolean; label: string; na?: boolean; optional?: boolean }[] = [
    { key: 'material', section: 'material', ok: status.materials > 0, label: status.materials ? t('prep.files', { count: status.materials }) : t('prep.uploadMaterial') },
    { key: 'presentation', section: 'presentation', ok: status.slides > 0, label: status.slides ? t('prep.slides', { count: status.slides }) : t('prep.uploadPdf') },
    { key: 'notes', section: 'notes', ok: status.slides > 0 && status.slide_notes >= status.slides, na: !status.slides, label: !status.slides ? '\u2014' : status.slide_notes >= status.slides ? t('prep.of', { count: status.slide_notes, total: status.slides }) : t('prep.completeNotes', { count: status.slide_notes, total: status.slides }) },
    { key: 'guide', section: 'guide', ok: status.blocks > 0, label: status.blocks ? t('prep.blocks', { count: status.blocks, minutes: status.plan_minutes }) : t('prep.createGuide') },
    { key: 'activities', section: 'activities', ok: status.activities > 0, optional: true, label: status.activities ? t('prep.activityCount', { count: status.activities }) : t('prep.addActivity') },
  ]
  const target = (section: string) => { const params = new URLSearchParams(search); params.set('tab', section === 'material' ? 'contenido' : 'guion'); params.set('section', section); return { pathname: `sesiones/${lesson.id}`, search: `?${params.toString()}` } }
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
  const title = <div className="flex min-w-0 flex-col justify-center gap-1"><Link className={`font-semibold hover:underline ${focus}`} to={target('material')}>{session} &#183; {lesson.title}</Link><span className="text-xs text-text-muted">{status.taught ? t('prep.taught', { count: status.taught }) : t('prep.notTaught')}</span>{editable && <span className="flex gap-1"><Button variant="secondary" disabled={pending || !canUp} onClick={() => onMove(-1)} aria-label={`${session}: ${t('teacherCommon.up')}`}>&#8593;</Button><Button variant="secondary" disabled={pending || !canDown} onClick={() => onMove(1)} aria-label={`${session}: ${t('teacherCommon.down')}`}>&#8595;</Button></span>}</div>
  const links = cells.map((cell) => <Link key={cell.key} to={target(cell.section)} aria-label={t('prep.cellAria', { session, state: cell.na ? t('prep.notAvailable') : cell.ok ? t('prep.done') : cell.optional ? t('prep.optional') : t('prep.missing'), section: t(`prep.columns.${cell.key}`) })}
    className={`flex min-h-14 items-center gap-2 rounded-control border px-3 text-sm font-semibold ${focus} ${cell.ok ? 'border-brand bg-brand-soft text-brand' : cell.na || cell.optional ? 'border-border text-text-muted' : 'border-dashed border-warning text-text'}`}>
    <span aria-hidden="true">{cell.na ? '' : cell.ok ? '\u2713' : '+'}</span><span><span className="block text-xs font-normal text-text-muted md:hidden">{t(`prep.columns.${cell.key}`)}</span>{cell.label}</span></Link>)
  const badge = <span className={`inline-flex items-center rounded-control px-3 py-2 text-sm font-semibold ${state.ready ? 'bg-brand-soft text-brand' : state.empty ? 'text-text-muted' : 'text-text'}`}>{stateLabel}</span>
  return <>
    <div className="hidden min-w-[1120px] grid-cols-[220px_repeat(5,minmax(0,1fr))_170px] gap-2 border-t border-border p-3 md:grid">{title}{links}<div className="flex items-center">{badge}</div></div>
    <div className="grid gap-3 border-t border-border p-3 md:hidden">{title}<div className="grid gap-2 sm:grid-cols-2">{links}</div>{badge}</div>
  </>
}
