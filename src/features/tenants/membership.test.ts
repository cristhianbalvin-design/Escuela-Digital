import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database, TenantRole } from '@/lib/supabase/database.types'
import { resolveTenant } from '@/lib/tenant'
import {
  fetchIsPlatformAdmin,
  fetchMyTenants,
  mapTenantRole,
  selectActiveTenant,
  type MyTenant,
} from './membership'

const schools: MyTenant[] = [
  {
    tenant_id: '00000000-0000-4000-8000-000000000001',
    slug: 'tideo',
    name: 'Tideo',
    role: 'instructor',
    primary_host: 'tideo.escueladigital.example',
  },
  {
    tenant_id: '00000000-0000-4000-8000-000000000002',
    slug: 'udep',
    name: 'UDEP',
    role: 'student',
    primary_host: 'escuela.udep.example',
  },
]

describe('membresías de escuelas', () => {
  it.each([
    ['owner', 'admin'],
    ['admin', 'admin'],
    ['instructor', 'teacher'],
    ['instructor_guest', 'teacher'],
    ['client_coordinator', 'coordinator'],
    ['student', 'student'],
  ] as const)('mapea %s al rol %s', (databaseRole, appRole) => {
    expect(mapTenantRole(databaseRole as TenantRole)).toBe(appRole)
  })

  it('lee y valida list_my_tenants con un cliente simulado', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: schools, error: null })
    const client = { rpc } as unknown as SupabaseClient<Database>

    await expect(fetchMyTenants(client)).resolves.toEqual(schools)
    expect(rpc).toHaveBeenCalledWith('list_my_tenants')
  })

  it('consulta solo la fila propia de platform_admins', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient<Database>

    await expect(fetchIsPlatformAdmin(client, 'user-1')).resolves.toBe(true)
    expect(from).toHaveBeenCalledWith('platform_admins')
    expect(select).toHaveBeenCalledWith('user_id')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('elige la membresía del subdominio resuelto', () => {
    const location = resolveTenant(
      'tideo.escueladigital.example',
      'escueladigital.example',
    )
    expect(selectActiveTenant(location, schools)).toEqual(schools[0])
  })

  it('elige la membresía cuyo dominio principal coincide', () => {
    const location = resolveTenant(
      'escuela.udep.example',
      'escueladigital.example',
    )
    expect(selectActiveTenant(location, schools)).toEqual(schools[1])
  })

  it('no concede acceso a una escuela ajena', () => {
    const location = resolveTenant(
      'otra.escueladigital.example',
      'escueladigital.example',
    )
    expect(selectActiveTenant(location, schools)).toBeNull()
  })

  it('deja la elección al usuario en el host de plataforma', () => {
    const location = resolveTenant(
      'escueladigital.example',
      'escueladigital.example',
    )
    expect(selectActiveTenant(location, schools)).toBeNull()
  })
})
