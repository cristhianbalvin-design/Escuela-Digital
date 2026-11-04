import { handleStudentEmail } from '../_lib/student-email.js'
import { readEnv } from '../_lib/env.js'

export const config = { maxDuration: 30 }

export async function POST(request: Request): Promise<Response> {
  return handleStudentEmail(request, readEnv())
}

export function GET(): Response {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  })
}
