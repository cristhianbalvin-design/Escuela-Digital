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
