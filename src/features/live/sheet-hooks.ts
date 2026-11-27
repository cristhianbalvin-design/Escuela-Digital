import { useLessonSheets } from './live-teacher-api'

/** Ficha de un bloque, tomada de la consulta compartida de fichas de la lección. */
export function useBlockSheet(lessonId: string, itemId: string | null) {
  const sheets = useLessonSheets(lessonId)
  return { ...sheets, sheet: itemId ? sheets.data?.find((item) => item.item_id === itemId) : undefined }
}
