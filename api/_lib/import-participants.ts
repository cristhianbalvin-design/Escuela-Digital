import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RenderEnv } from './env.js'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAX_ROWS = 25

// Participantes sin correo: cuenta interna que nunca recibe mensajes ni inicia sesión.
const PLACEHOLDER_PREFIX = 'sin-correo-'
const PLACEHOLDER_DOMAIN = 'sin-correo.invalid'

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Etiqueta para el resultado: el correo, o el nombre si no hay correo. */
function labelOf(row: { email: string; full_name: string }): string {
  return row.email || row.full_name
}

export interface ImportRow {
  email: string
  full_name: string
  phone: string
  job_title: string
  company: string
  scores: Record<string, number>
}

export interface ImportResult {
  email: string
  status: 'ok' | 'error'
  account_created: boolean
  enrollment_created: boolean
  scores: number
  error?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export function parseImportBody(
  body: unknown,
): { offeringId: string; rows: ImportRow[] } | null {
  if (!body || typeof body !== 'object') return null
  const root = body as Record<string, unknown>
  if (typeof root.offering_id !== 'string' || !UUID.test(root.offering_id)) return null
  if (!Array.isArray(root.rows) || root.rows.length === 0 || root.rows.length > MAX_ROWS) {
    return null
  }
  const rows: ImportRow[] = []
  for (const item of root.rows) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
    const fullName = typeof row.full_name === 'string' ? row.full_name.trim().slice(0, 120) : ''
    const scores: Record<string, number> = {}
    if (row.scores && typeof row.scores === 'object' && !Array.isArray(row.scores)) {
      for (const [id, value] of Object.entries(row.scores)) {
        if (UUID.test(id) && typeof value === 'number' && Number.isFinite(value)) {
          scores[id] = value
        }
      }
    }
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.trim().slice(0, max) : ''
    rows.push({
      email, full_name: fullName, scores,
      phone: text(row.phone, 30), job_title: text(row.job_title, 120), company: text(row.company, 120),
    })
  }
  return { offeringId: root.offering_id, rows }
}

async function importRow(
  admin: SupabaseClient,
  actor: string,
  offeringId: string,
  row: ImportRow,
): Promise<ImportResult> {
  const base = {
    email: labelOf(row), account_created: false, enrollment_created: false, scores: 0,
  }
  const hasEmail = row.email !== ''
  if (hasEmail && (row.email.length > 254 || !EMAIL.test(row.email))) {
    return { ...base, status: 'error', error: 'Correo no válido' }
  }
  if (!hasEmail && row.full_name === '') {
    return { ...base, status: 'error', error: 'Falta el correo o el nombre' }
  }
  try {
    let userId: string | null = null
    let accountCreated = false
    if (hasEmail) {
      const found = await admin.rpc('import_find_user', { p_email: row.email })
      if (found.error) throw new Error(found.error.message)
      userId = typeof found.data === 'string' ? found.data : null
      if (!userId) {
        const created = await admin.auth.admin.createUser({
          email: row.email,
          email_confirm: true,
          user_metadata: row.full_name ? { full_name: row.full_name } : {},
        })
        if (created.error || !created.data.user) {
          const retry = await admin.rpc('import_find_user', { p_email: row.email })
          userId = typeof retry.data === 'string' ? retry.data : null
          if (!userId) throw new Error(created.error?.message ?? 'No se pudo crear la cuenta')
        } else {
          userId = created.data.user.id
          accountCreated = true
        }
      }
    } else {
      // Sin correo: se reutiliza al participante del mismo cliente con ese nombre, o se crea uno interno.
      const found = await admin.rpc('import_find_placeholder', {
        p_offering_id: offeringId, p_name: normalizeName(row.full_name),
      })
      if (found.error) throw new Error(found.error.message)
      userId = typeof found.data === 'string' ? found.data : null
      if (!userId) {
        const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        const created = await admin.auth.admin.createUser({
          email: `${PLACEHOLDER_PREFIX}${token}@${PLACEHOLDER_DOMAIN}`,
          email_confirm: true,
          // Aleatoria y nunca se usa para entrar; el sufijo cumple la política (minúscula, mayúscula, número y símbolo).
          password: `${crypto.randomUUID()}${crypto.randomUUID()}Aa1!`,
          user_metadata: { full_name: row.full_name, placeholder: true },
        })
        if (created.error || !created.data.user) {
          throw new Error(created.error?.message ?? 'No se pudo crear al participante')
        }
        userId = created.data.user.id
        accountCreated = true
      }
    }
    const done = await admin.rpc('import_participant', {
      p_actor: actor, p_offering_id: offeringId, p_user_id: userId, p_scores: row.scores,
      p_details: { phone: row.phone, job_title: row.job_title, company: row.company },
    })
    if (done.error) throw new Error(done.error.message)
    const data = (done.data ?? {}) as { created?: boolean; scores?: number }
    return {
      ...base, status: 'ok', account_created: accountCreated,
      enrollment_created: data.created === true,
      scores: typeof data.scores === 'number' ? data.scores : 0,
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Error desconocido'
    return { ...base, status: 'error', error: message.slice(0, 200) }
  }
}

/**
 * Importa participantes (crea la cuenta sin enviar correo, matricula y carga notas).
 * El acceso se comprueba con el JWT del docente; el resto usa la service role.
 */
export async function handleImport(
  request: Request,
  env: RenderEnv | null,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!env) return json({ error: 'server_not_configured' }, 500)

  const auth = request.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: 'unauthorized' }, 401)

  let parsed: ReturnType<typeof parseImportBody>
  try {
    parsed = parseImportBody(await request.json())
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

  const access = await userClient.rpc('check_import_access', {
    p_offering_id: parsed.offeringId,
  })
  if (access.error) return json({ error: 'forbidden' }, 403)

  const admin = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const results: ImportResult[] = []
  const seen = new Set<string>()
  for (const row of parsed.rows) {
    const key = row.email || `nombre:${normalizeName(row.full_name)}`
    if (seen.has(key)) {
      results.push({
        email: labelOf(row), status: 'error', account_created: false,
        enrollment_created: false, scores: 0,
        error: row.email ? 'Correo repetido en el archivo' : 'Nombre repetido en el archivo',
      })
      continue
    }
    seen.add(key)
    results.push(await importRow(admin, userData.user.id, parsed.offeringId, row))
  }
  return json({ results })
}
