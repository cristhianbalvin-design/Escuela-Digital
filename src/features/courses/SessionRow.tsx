import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useLessonPlan } from '@/features/planning/planning-api'
import { useLiveSets } from '@/features/live/live-teacher-api'
import type { Lesson } from './api'

const chip = (ok: boolean) => `rounded-full border px-2.5 py-1 text-xs ${ok ? 'border-brand text-brand' : 'border-border text-text-muted'}`

/** Una sesión del curso en una sola fila; su detalle vive en su propia pantalla. */
export function SessionRow({ lesson, number, editable, pending, canUp, canDown, onMove }: {
  lesson: Lesson; number: number; editable: boolean; pending: boolean
  canUp: boolean; canDown: boolean; onMove: (direction: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const plan = useLessonPlan(lesson.id)
  const sets = useLiveSets(lesson.id)
  const blocks = plan.data?.items.length ?? 0
  const activities = sets.data?.length ?? 0
  return <div className="flex flex-wrap items-center gap-3 rounded-control border border-border p-2 sm:p-3">
    <Link to={{ pathname: `sesiones/${lesson.id}`, search }}
      className="flex min-h-12 min-w-0 flex-[1_1_20rem] flex-wrap items-center gap-x-4 gap-y-2 rounded-control p-1 hover:bg-surface-elevated">
      <span className="w-20 shrink-0 text-sm font-semibold text-text-muted">{t('sessions.number', { number })}</span>
      <span className="min-w-0 flex-[1_1_14rem] font-semibold">{lesson.title}</span>
      <span className="flex flex-wrap gap-1.5">
        {lesson.type === 'reading'
          ? <span className={chip(true)}>{t('sessions.reading')}</span>
          : <span className={chip(true)}>{t(lesson.type === 'quiz' ? 'sessions.typeQuiz' : 'sessions.typeAssignment')}</span>}
        <span className={chip(blocks > 0)}>{blocks > 0 ? t('sessions.blocks', { count: blocks }) : t('sessions.noScript')}</span>
        {!sets.isError && <span className={chip(activities > 0)}>{activities > 0 ? t('sessions.activities', { count: activities }) : t('sessions.noActivities')}</span>}
      </span>
      <span aria-hidden="true" className="text-text-muted">›</span>
    </Link>
    {editable && <span className="flex gap-1">
      <Button variant="secondary" disabled={pending || !canUp} onClick={() => onMove(-1)} aria-label={t('teacherCommon.up')}>↑</Button>
      <Button variant="secondary" disabled={pending || !canDown} onClick={() => onMove(1)} aria-label={t('teacherCommon.down')}>↓</Button>
    </span>}
  </div>
}
