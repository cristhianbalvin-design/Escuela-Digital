import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  renderClassicCertificate,
  type CertificateData,
} from './classic-template.js'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const COLUMNS =
  'id, tenant_id, code, status, pdf_path, render_attempts, student_name, course_title, hours, grade, instructor_name, issued_at, issuer_snapshot, template_snapshot'

interface CertRow extends CertificateData {
  id: string
  tenant_id: string
  status: 'pending_render' | 'issued' | 'revoked' | 'reissued'
  pdf_path: string | null
  render_attempts: number
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export interface RenderEnv {
  url: string
  anonKey: string
  serviceKey: string
}

export function readEnv(): RenderEnv | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && anonKey && serviceKey ? { url, anonKey, serviceKey } : null
}

/**
 * Genera el PDF de un certificado. Idempotente: si ya está emitido devuelve el
 * estado actual. El acceso se comprueba con el JWT del usuario (RLS); el
 * Storage y el cambio de estado se hacen con la service role.
 */
export async function handleRender(
  request: Request,
  env: RenderEnv | null,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!env) return json({ error: 'server_not_configured' }, 500)

  const auth = request.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: 'unauthorized' }, 401)

  let certificateId = ''
  try {
    const body = (await request.json()) as { certificate_id?: unknown }
    certificateId =
      typeof body.certificate_id === 'string' ? body.certificate_id : ''
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!UUID.test(certificateId)) return json({ error: 'bad_request' }, 400)

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser(
    auth.replace(/^Bearer\s+/i, ''),
  )
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const { data: found, error: readError } = await userClient
    .from('certificates')
    .select(COLUMNS)
    .eq('id', certificateId)
    .maybeSingle()
  if (readError) return json({ error: 'read_failed' }, 500)
  if (!found) return json({ error: 'not_found' }, 404)
  const cert = found as unknown as CertRow

  if (cert.status === 'revoked' || cert.status === 'reissued') {
    return json({ error: 'not_renderable', status: cert.status }, 409)
  }
  if (cert.status === 'issued' && cert.pdf_path) {
    return json({ status: 'issued', pdf_path: cert.pdf_path })
  }

  const admin: SupabaseClient = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const origin = new URL(request.url).origin
  const verifyUrl = `${origin}/c/${cert.code}`
  const path = `${cert.tenant_id}/${cert.code}.pdf`

  try {
    const pdf = await renderClassicCertificate(cert, verifyUrl)
    const { error: uploadError } = await admin.storage
      .from('certificates')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw new Error(`upload: ${uploadError.message}`)

    const { data: updated, error: updateError } = await admin
      .from('certificates')
      .update({
        status: 'issued',
        pdf_path: path,
        rendered_at: new Date().toISOString(),
        last_render_error: null,
      })
      .eq('id', cert.id)
      .eq('status', 'pending_render')
      .select('id')
    if (updateError) throw new Error(`update: ${updateError.message}`)

    if (updated && updated.length > 0) {
      await admin.from('certificate_events').insert({
        certificate_id: cert.id,
        tenant_id: cert.tenant_id,
        type: 'rendered',
        actor_id: userData.user.id,
      })
    }
    return json({ status: 'issued', pdf_path: path })
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    await admin
      .from('certificates')
      .update({
        render_attempts: cert.render_attempts + 1,
        last_render_error: message,
      })
      .eq('id', cert.id)
    await admin.from('certificate_events').insert({
      certificate_id: cert.id,
      tenant_id: cert.tenant_id,
      type: 'render_failed',
      actor_id: userData.user.id,
      reason: message,
    })
    return json({ error: 'render_failed' }, 500)
  }
}
