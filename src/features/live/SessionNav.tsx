import { useTranslation } from 'react-i18next'

type Step = 'prepare' | 'teach' | 'results'
/** Los tres momentos de una sesión; Dictar y Resultados necesitan la edición. */
export function SessionNav({ lessonId, offeringId, current }: { lessonId: string; offeringId: string; current: Step }) {
  const { t } = useTranslation()
  const steps: { key: Step; label: string; href: string | null }[] = [
    { key: 'prepare', label: t('live.stepPrepare'), href: `/sesion/${lessonId}${offeringId ? `?edicion=${offeringId}` : ''}` },
    { key: 'teach', label: t('live.stepTeach'), href: offeringId ? `/clase-control/${offeringId}/${lessonId}` : null },
    { key: 'results', label: t('live.stepResults'), href: offeringId ? `/sesion-resultados/${offeringId}/${lessonId}` : null },
  ]
  return <nav aria-label={t('live.sessionMoments')} className="flex flex-wrap gap-1 rounded-control border border-border bg-surface p-1">
    {steps.map((step) => step.key === current
      ? <span key={step.key} aria-current="page" className="rounded-control bg-brand px-4 py-2 font-semibold text-white">{step.label}</span>
      : step.href ? <a key={step.key} href={step.href} className="rounded-control px-4 py-2 hover:bg-surface-elevated">{step.label}</a>
      : <span key={step.key} className="rounded-control px-4 py-2 text-text-muted" title={t('live.needsOffering')}>{step.label}</span>)}
  </nav>
}
