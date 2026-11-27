import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui'
import { useLivePublishedSheet } from './live-api'
import { SheetView } from './SheetView'
import { downloadStudentSheetFile } from './sheet-files'

/** Actividad publicada por el docente. El servidor solo entrega la parte pública de la ficha. */
export function StudentSheet({ code, token }: { code: string; token: string }) {
  const { t } = useTranslation()
  const query = useLivePublishedSheet(code, token)
  const sheet = query.data
  if (!sheet) return null
  return <Card className="space-y-4" aria-label={t('sheet.studentRegion')}>
    <div>
      <p className="text-sm font-semibold uppercase text-text-muted">{t('sheet.studentLabel')}</p>
      <h2 className="mt-1 text-2xl font-bold">{sheet.title}{sheet.minutes ? <span className="ml-2 text-base font-normal text-text-muted">{t('sheet.minutesShort', { count: sheet.minutes })}</span> : null}</h2>
    </div>
    <SheetView sheet={sheet} onDownload={(resource, index) => downloadStudentSheetFile(code, token, index, resource.file?.name ?? resource.name)} />
  </Card>
}
