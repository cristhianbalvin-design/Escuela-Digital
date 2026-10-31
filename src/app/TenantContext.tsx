import { createContext, useContext } from 'react'
import type { TenantBranding } from '@/lib/tenant/branding'

export const TenantContext = createContext<TenantBranding | null>(null)
export function useTenant(): TenantBranding {
  const tenant = useContext(TenantContext)
  if (!tenant) throw new Error('TenantContext missing')
  return tenant
}
