import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let payload: { token?: unknown; password?: unknown; full_name?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const token = typeof payload.token === 'string' ? payload.token : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim().slice(0, 120) : ''
  if (!token || token.length > 200) return json({ error: 'invalid_token' }, 400)
  if (password.length < 8 || password.length > 72) return json({ error: 'weak_password' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const hash = await sha256Hex(token)
  const { data: inv, error: invError } = await admin
    .from('invitations')
    .select('email, expires_at, accepted_at')
    .eq('token_hash', `\\x${hash}`)
    .maybeSingle()

  if (invError) return json({ error: 'lookup_failed' }, 500)
  if (!inv) return json({ error: 'invalid_token' }, 404)
  if (inv.accepted_at) return json({ error: 'used' }, 409)
  if (new Date(inv.expires_at).getTime() <= Date.now()) return json({ error: 'expired' }, 410)

  const { error: createError } = await admin.auth.admin.createUser({
    email: String(inv.email).toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  })

  if (createError) {
    const code = (createError as { code?: string }).code
    if (code === 'email_exists' || /already|registered/i.test(createError.message)) {
      return json({ error: 'account_exists', email: inv.email }, 409)
    }
    if (code === 'weak_password') return json({ error: 'weak_password' }, 400)
    return json({ error: 'create_failed' }, 500)
  }

  return json({ ok: true, email: inv.email })
})
