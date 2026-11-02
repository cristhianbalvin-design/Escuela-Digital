import { handleImport } from '../_lib/import-participants.js'
import { readEnv } from '../_lib/env.js'

export const config = { maxDuration: 60 }

export async function POST(request: Request): Promise<Response> {
  return handleImport(request, readEnv())
}

export function GET(): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  })
}
