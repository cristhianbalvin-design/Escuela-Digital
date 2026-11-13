import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { liveRpc } from './live-api'
import type { LessonPresentation, LiveScreen } from './live-contract'

const BUCKET = 'presentations'
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
// El doble de Full HD: nítido en proyectores 4K y en pantallas de alta densidad.
const SLIDE_WIDTH = 3840
const JPEG_QUALITY = 0.93
export const MAX_PAGES = 300

/** URL pública de una lámina ya convertida a imagen. */
export function slideUrl(presentation: Pick<LessonPresentation, 'folder'>, slide: number): string {
  if (!supabase) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(`${presentation.folder}/${slide}.jpg`).data.publicUrl
}

/** Miniatura liviana (480 px); las presentaciones antiguas no la tienen y usan la lámina completa. */
export function slideThumbUrl(presentation: Pick<LessonPresentation, 'folder'>, slide: number): string {
  if (!supabase) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(`${presentation.folder}/${slide}.webp`).data.publicUrl
}

/** Lo que muestra el proyector: lanzar una actividad después de elegir la presentación la pone al frente. */
export function effectiveScreen(screen: Pick<LiveScreen, 'mode' | 'updated_at'> | undefined, latestRunOpenedAt: string | null | undefined): LiveScreen['mode'] {
  if (!screen) return 'activity'
  if (screen.mode === 'slides' && latestRunOpenedAt && screen.updated_at && Date.parse(latestRunOpenedAt) > Date.parse(screen.updated_at)) return 'activity'
  return screen.mode
}

export const presentationKey = (lessonId: string) => ['presentation', lessonId] as const
export function useLessonPresentation(lessonId: string) {
  return useQuery({
    queryKey: presentationKey(lessonId), enabled: !!lessonId && !!supabase,
    queryFn: () => liveRpc('get_lesson_presentation', { p_lesson_id: lessonId }),
    retry: false,
  })
}

type PdfPage = { getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }
type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> }
type PdfJs = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (source: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> } }

let pdfjs: Promise<PdfJs> | null = null
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (import(/* @vite-ignore */ PDFJS) as Promise<PdfJs>).then((module) => {
    module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    return module
  })
  return pdfjs
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo convertir la lámina.')), type, quality))
}
const THUMB_WIDTH = 480

/** Convierte cada página del PDF en una imagen 1920 px y la sube; el PDF original no se guarda. */
export function useUploadPresentation(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress: (done: number, total: number) => void }) => {
      if (!supabase) throw new Error('Supabase no está configurado.')
      const client = supabase
      const lib = await loadPdfJs()
      const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise
      try {
        const total = doc.numPages
        if (total > MAX_PAGES) throw new Error(`El PDF tiene ${total} páginas; el máximo es ${MAX_PAGES}.`)
        const folder = `${lessonId}/${crypto.randomUUID()}`
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const thumb = document.createElement('canvas')
        const thumbContext = thumb.getContext('2d')
        if (!context || !thumbContext) throw new Error('El navegador no permite procesar el PDF.')
        let aspect = 16 / 9
        onProgress(0, total)
        for (let n = 1; n <= total; n += 1) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          if (n === 1) aspect = base.width / base.height
          const viewport = page.getViewport({ scale: Math.min(SLIDE_WIDTH / base.width, 4096 / base.height) })
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: context, viewport }).promise
          const { error } = await client.storage.from(BUCKET).upload(`${folder}/${n}.jpg`, await toBlob(canvas, 'image/jpeg', JPEG_QUALITY),
            { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
          if (error) throw new Error(error.message)
          thumb.width = THUMB_WIDTH
          thumb.height = Math.round(THUMB_WIDTH * canvas.height / canvas.width)
          thumbContext.imageSmoothingQuality = 'high'
          thumbContext.drawImage(canvas, 0, 0, thumb.width, thumb.height)
          const small = await client.storage.from(BUCKET).upload(`${folder}/${n}.webp`, await toBlob(thumb, 'image/webp', 0.8),
            { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
          if (small.error) throw new Error(small.error.message)
          onProgress(n, total)
        }
        return await liveRpc('save_lesson_presentation', {
          p_lesson_id: lessonId, p_file_name: file.name.slice(0, 200), p_folder: folder,
          p_page_count: total, p_aspect: Math.min(4, Math.max(0.3, aspect)),
        })
      } finally { await doc.destroy() }
    },
    onSuccess: (presentation) => { cache.setQueryData(presentationKey(lessonId), presentation) },
  })
}

export function useDeletePresentation(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: () => liveRpc('delete_lesson_presentation', { p_lesson_id: lessonId }),
    onSuccess: () => { cache.setQueryData(presentationKey(lessonId), null) },
  })
}

export const slideNotesKey = (lessonId: string) => ['slide-notes', lessonId] as const
export function useSlideNotes(lessonId: string) {
  return useQuery({
    queryKey: slideNotesKey(lessonId), enabled: !!lessonId && !!supabase,
    queryFn: () => liveRpc('get_slide_notes', { p_lesson_id: lessonId }),
    retry: false,
  })
}
export function useSaveSlideNotes(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (notes: { slide: number; notes: string }[]) => liveRpc('save_slide_notes', { p_lesson_id: lessonId, p_notes: notes }),
    onSuccess: (notes) => { cache.setQueryData(slideNotesKey(lessonId), notes) },
  })
}

const HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:l[áa]mina|slide|diapositiva|p[áa]gina)\s*(?:n[°ºo.]*\s*)?(\d{1,3})\b\s*(?:\*\*)?\s*[:.)\-–—]*\s*(?:\*\*)?\s*(.*)$/i

/** Reparte un guion completo por láminas a partir de encabezados «Lámina 3», «## Slide 3:», «Diapositiva 3 –». */
export function parseSlideNotes(text: string, pages: number): { slide: number; notes: string }[] {
  const found = new Map<number, string[]>()
  let current: number | null = null
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = HEADING.exec(line)
    if (match) {
      const slide = Number(match[1])
      current = slide >= 1 && slide <= pages ? slide : null
      if (current !== null) {
        const rest = (match[2] ?? '').replace(/\*\*$/, '').trim()
        found.set(current, [...(found.get(current) ?? []), ...(rest ? [rest] : [])])
      }
      continue
    }
    if (current !== null) found.get(current)!.push(line)
  }
  return [...found].map(([slide, lines]) => ({ slide, notes: lines.join('\n').trim().slice(0, 6000) }))
    .filter((item) => item.notes.length > 0).sort((a, b) => a.slide - b.slide)
}

const MAMMOTH = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm'
type Mammoth = { extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }
/** Lee .txt, .md o .docx en el navegador. */
export async function readNotesFile(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.docx')) {
    const module = await import(/* @vite-ignore */ MAMMOTH) as { default?: Mammoth } & Partial<Mammoth>
    const lib = (module.default ?? module) as Mammoth
    return (await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value
  }
  return file.text()
}
