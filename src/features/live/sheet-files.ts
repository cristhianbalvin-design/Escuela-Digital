import { supabase } from '@/lib/supabase'
import { liveRpc } from './live-api'
import { checkSheetFile, safeFileName, sheetFileTypes, type SheetFile } from './sheet-utils'

const bucket = 'sheet-files'
export class SheetFileError extends Error {
  constructor(readonly reason: 'type' | 'size' | 'empty' | 'upload' | 'download') { super(reason) }
}

/** Solo se descarga desde nuestro propio proyecto de almacenamiento. */
function trustedUrl(value: string): string | null {
  try {
    const target = new URL(value); const base = new URL(String(import.meta.env.VITE_SUPABASE_URL))
    return target.protocol === 'https:' && target.host === base.host ? target.href : null
  } catch { return null }
}
/** Un enlace de descarga (Content-Disposition: attachment): no abre una página nueva. */
function startDownload(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url; link.download = name; link.rel = 'noopener noreferrer'
  document.body.appendChild(link); link.click(); link.remove()
}

/** Sube un archivo al bloque y devuelve el descriptor que se guarda en el recurso. */
export async function uploadSheetFile(lessonId: string, itemId: string, file: File): Promise<SheetFile> {
  const check = checkSheetFile(file.name, file.size)
  if (check !== 'ok') throw new SheetFileError(check)
  if (!supabase) throw new SheetFileError('upload')
  try {
    const prefix = await liveRpc('get_sheet_upload_prefix', { p_lesson_id: lessonId, p_item_id: itemId })
    const path = `${prefix}${crypto.randomUUID()}-${safeFileName(file.name)}`
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: sheetFileTypes[extension], upsert: false })
    if (error) throw error
    return { path, name: file.name.trim().slice(0, 150), size: file.size }
  } catch { throw new SheetFileError('upload') }
}

/** Borrado opcional del archivo sustituido o quitado; un fallo no interrumpe al docente. */
export async function removeSheetFile(path: string): Promise<void> {
  try { await supabase?.storage.from(bucket).remove([path]) } catch { /* se ignora */ }
}

/** Descarga para quienes gestionan la clase. */
export async function downloadSheetFile(file: SheetFile): Promise<void> {
  if (!supabase) throw new SheetFileError('download')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(file.path, 120, { download: file.name })
  const url = error || !data ? null : trustedUrl(data.signedUrl)
  if (!url) throw new SheetFileError('download')
  startDownload(url, file.name)
}

/** Descarga para el alumno: la función de borde valida clase y token y entrega un enlace temporal. */
export async function downloadStudentSheetFile(code: string, token: string, idx: number, name: string): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL; const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) throw new SheetFileError('download')
  try {
    const response = await fetch(`${base}/functions/v1/sheet-file`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ code, token, idx }),
    })
    const body = await response.json() as { url?: unknown }
    const url = response.ok && typeof body.url === 'string' ? trustedUrl(body.url) : null
    if (!url) throw new Error('sin enlace')
    startDownload(url, name)
  } catch { throw new SheetFileError('download') }
}
