import { createClient } from '@supabase/supabase-js'
import type { RenderEnv } from './env.js'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export function parseStudentEmailBody(
  body: unknown,
): { tenantId: string; userId: string; email: string } | null {
  if (!body || typeof body !== 'object') return null
  const root = body as Record<string, unknown>
  if (typeof root.tenant_id !== 'string' || !UUID.test(root.tenant_id)) return null
  if (typeof root.user_id !== 'string' || !UUID.test(root.user_id)) return null
  const email = typeof root.email === 'string' ? root.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL.test(email)) return null
  return { tenantId: root.tenant_id, userId: root.user_id, email }
}

/**
 * Pone un correo real a un alumno que no tenía. La validación (administrador de la escuela,
 * alumno sin correo, correo libre) la hace la base con el JWT de quien llama;
 * el cambio en la cuenta lo hace la service role.
 */
export async function handleStudentEmail(
  request: Request,
  env: RenderEnv | null,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!env) return json({ error: 'server_not_configured' }, 500)

  const auth = request.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: 'unauthorized' }, 401)

  let parsed: ReturnType<typeof parseStudentEmailBody>
  try {
    parsed = parseStudentEmailBody(await request.json())
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!parsed) return json({ error: 'bad_request' }, 400)

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser(
    auth.replace(/^Bearer\s+/i, ''),
  )
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  const check = await userClient.rpc('check_placeholder_email_change', {
    p_tenant_id: parsed.tenantId, p_user_id: parsed.userId, p_email: parsed.email,
  })
  if (check.error) {
    if (check.error.code === '23505') return json({ error: 'email_exists' }, 409)
    if (check.error.code === '23514') return json({ error: 'invalid_email' }, 400)
    return json({ error: 'forbidden' }, 403)
  }

  const admin = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const current = await admin.auth.admin.getUserById(parsed.userId)
  if (current.error || !current.data.user) return json({ error: 'not_found' }, 404)
  const metadata = { ...(current.data.user.user_metadata ?? {}) } as Record<string, unknown>
  delete metadata.placeholder
  const updated = await admin.auth.admin.updateUserById(parsed.userId, {
    email: parsed.email,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (updated.error) {
    const code = (updated.error as { code?: string }).code
    if (code === 'email_exists') return json({ error: 'email_exists' }, 409)
    return json({ error: 'update_failed' }, 500)
  }
  return json({ ok: true })
}
