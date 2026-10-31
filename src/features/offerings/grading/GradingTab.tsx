import { useTranslation } from 'react-i18next'
import { GradingQueue } from './GradingQueue'
import { GradebookPanel } from './GradebookPanel'

export function GradingTab({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="grading-queue-heading">
        <h2 id="grading-queue-heading" className="text-xl font-bold">{t('grading.queue')}</h2>
        <GradingQueue offeringId={offeringId} />
      </section>
      <section className="grid gap-3" aria-labelledby="grading-book-heading">
        <h2 id="grading-book-heading" className="text-xl font-bold">{t('grading.gradebook')}</h2>
        <GradebookPanel offeringId={offeringId} />
      </section>
    </div>
  )
}
