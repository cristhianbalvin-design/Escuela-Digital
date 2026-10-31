import { handleRender, readEnv } from '../_lib/render-certificate.js'

export const config = { maxDuration: 30 }

export async function POST(request: Request): Promise<Response> {
  return handleRender(request, readEnv())
}

export function GET(): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  })
}
