import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Role } from '@/app/role'
import type { Database, TenantRole } from '@/lib/supabase/database.types'
import type { TenantLocation } from '@/lib/tenant'

export const myTenantSchema = z.object({
  tenant_id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  role: z.enum([
    'owner',
    'admin',
    'instructor',
    'instructor_guest',
    'client_coordinator',
    'student',
  ]),
  primary_host: z.string().nullable(),
})

export const myTenantsSchema = z.array(myTenantSchema)
export type MyTenant = z.infer<typeof myTenantSchema>

export async function fetchMyTenants(
  client: SupabaseClient<Database>,
): Promise<MyTenant[]> {
  const { data, error } = await client.rpc('list_my_tenants')
  if (error) throw error
  return myTenantsSchema.parse(data)
}

export async function fetchIsPlatformAdmin(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data !== null
}

export function mapTenantRole(role: TenantRole): Role {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'admin'
    case 'instructor':
    case 'instructor_guest':
      return 'teacher'
    case 'client_coordinator':
      return 'coordinator'
    case 'student':
      return 'student'
  }
}

export function selectActiveTenant(
  location: TenantLocation,
  memberships: MyTenant[],
): MyTenant | null {
  if (location.kind === 'platform') return null

  if (location.kind === 'subdomain') {
    return memberships.find((item) => item.slug === location.slug) ?? null
  }

  return (
    memberships.find(
      (item) => item.primary_host?.toLowerCase() === location.host,
    ) ?? null
  )
}
