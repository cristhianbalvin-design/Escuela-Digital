// Descarga de recursos de la ficha de actividad para alumnos de una clase en vivo.
// No usa JWT: el alumno se identifica con el código de clase y su token. La validación vive en la RPC
// get_sheet_file_for_student (solo service_role); aquí únicamente se emite un enlace temporal de 2 minutos.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const CODE = /^[A-HJ-NP-Z2-9]{6}$/
const TOKEN = /^[0-9a-f]{64}$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let body: { code?: unknown; token?: unknown; idx?: unknown }
  try { body = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
  const { code, token, idx } = body
  if (typeof code !== 'string' || !CODE.test(code) || typeof token !== 'string' || !TOKEN.test(token)
    || typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx > 14) return json({ error: 'bad_request' }, 400)

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'not_configured' }, 500)
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await db.rpc('get_sheet_file_for_student', { p_code: code, p_token: token, p_idx: idx })
  if (error || !data || typeof data.path !== 'string' || typeof data.name !== 'string') return json({ error: 'forbidden' }, 403)

  const signed = await db.storage.from('sheet-files').createSignedUrl(data.path, 120, { download: data.name })
  if (signed.error || !signed.data?.signedUrl) return json({ error: 'unavailable' }, 404)
  return json({ url: signed.data.signedUrl, name: data.name })
})
