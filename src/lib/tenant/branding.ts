import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { schools } from '@/mocks/schools'
import type { Database } from '@/lib/supabase/database.types'
import type { TenantLocation } from './index'

export interface TenantBranding {
  name: string
  logos: { mark: string; alt: string; lightUrl?: string; darkUrl?: string }
  colors: { primary: string; secondary: string }
  welcomeText: string
  language: string
  timeZone: string
}

export interface TenantBrandingSource {
  getBranding(location: TenantLocation): Promise<TenantBranding | null>
}

export const tenantBrandingResponseSchema = z.object({
  name: z.string().min(1),
  logo_light_url: z.url().nullable(),
  logo_dark_url: z.url().nullable(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  welcome_text: z.string().nullable(),
  language: z.string().min(1),
  time_zone: z.string().min(1),
})

export class InvalidTenantBrandingError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    super('Invalid tenant branding response')
    this.name = 'InvalidTenantBrandingError'
  }
}

export class MockBrandingSource implements TenantBrandingSource {
  async getBranding(location: TenantLocation): Promise<TenantBranding | null> {
    return location.slug
      ? (schools[location.slug] ?? null)
      : location.kind === 'platform'
        ? (schools.tideo ?? null)
        : null
  }
}

export class SupabaseBrandingSource implements TenantBrandingSource {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getBranding(location: TenantLocation): Promise<TenantBranding | null> {
    const { data, error } = await this.client.rpc('get_tenant_branding', {
      host: location.host,
    })
    if (error) throw error
    if (data === null) return null

    // La función de la BD devuelve una lista, incluso cuando hay una sola marca.
    const parsed = z.array(tenantBrandingResponseSchema).safeParse(data)
    if (!parsed.success) {
      throw new InvalidTenantBrandingError(parsed.error.issues)
    }
    const brand = parsed.data[0]
    if (!brand) return null

    return {
      name: brand.name,
      logos: {
        mark: brand.name.trim().charAt(0).toUpperCase(),
        alt: brand.name,
        ...(brand.logo_light_url ? { lightUrl: brand.logo_light_url } : {}),
        ...(brand.logo_dark_url ? { darkUrl: brand.logo_dark_url } : {}),
      },
      colors: {
        primary: brand.primary_color,
        secondary: brand.secondary_color,
      },
      welcomeText: brand.welcome_text ?? '',
      language: brand.language,
      timeZone: brand.time_zone,
    }
  }
}
