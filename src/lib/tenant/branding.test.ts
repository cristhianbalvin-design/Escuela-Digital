import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { applyBrand } from '@/lib/theme'
import type { Database } from '@/lib/supabase/database.types'
import {
  InvalidTenantBrandingError,
  MockBrandingSource,
  SupabaseBrandingSource,
} from './branding'
import { resolveTenant } from './index'

describe('marcas de ejemplo', () => {
  it('cambia nombre, logo y colores entre las dos escuelas', async () => {
    const source = new MockBrandingSource()
    const tideo = await source.getBranding(
      resolveTenant('localhost', '', '?tenant=tideo'),
    )
    const udep = await source.getBranding(
      resolveTenant('localhost', '', '?tenant=udep-demo'),
    )
    expect(tideo).not.toBeNull()
    expect(udep).not.toBeNull()
    applyBrand(tideo!)
    expect(document.title).toContain('TIDEO Tech & Strategy')
    expect(
      document.documentElement.style.getPropertyValue('--brand-base'),
    ).toBe('#4F46E5')
    applyBrand(udep!)
    expect(document.title).toContain('Escuela Demo UDEP Digital')
    expect(
      document.documentElement.style.getPropertyValue('--brand-base'),
    ).toBe('#059669')
    expect(tideo!.logos.mark).not.toBe(udep!.logos.mark)
  })
})

describe('SupabaseBrandingSource', () => {
  const location = resolveTenant(
    'tideo.escueladigital.example',
    'escueladigital.example',
  )
  const response = {
    name: 'Escuela Tideo',
    logo_light_url: 'https://example.com/light.svg',
    logo_dark_url: 'https://example.com/dark.svg',
    primary_color: '#4F46E5',
    secondary_color: '#14B8A6',
    welcome_text: 'Bienvenido',
    language: 'es',
    time_zone: 'America/Lima',
  }

  function sourceWith(data: unknown) {
    const rpc = vi.fn().mockResolvedValue({ data, error: null })
    const source = new SupabaseBrandingSource({
      rpc,
    } as unknown as SupabaseClient<Database>)
    return { source, rpc }
  }

  it('valida y mapea la lista devuelta por la RPC', async () => {
    const { source, rpc } = sourceWith([response])
    await expect(source.getBranding(location)).resolves.toEqual({
      name: 'Escuela Tideo',
      logos: {
        mark: 'E',
        alt: 'Escuela Tideo',
        lightUrl: 'https://example.com/light.svg',
        darkUrl: 'https://example.com/dark.svg',
      },
      colors: { primary: '#4F46E5', secondary: '#14B8A6' },
      welcomeText: 'Bienvenido',
      language: 'es',
      timeZone: 'America/Lima',
    })
    expect(rpc).toHaveBeenCalledWith('get_tenant_branding', {
      host: location.host,
    })
  })

  it('devuelve null si la RPC no encuentra marca', async () => {
    const { source } = sourceWith([])
    await expect(source.getBranding(location)).resolves.toBeNull()
  })

  it('acepta welcome_text nulo según el tipo generado', async () => {
    const { source } = sourceWith([{ ...response, welcome_text: null }])
    await expect(source.getBranding(location)).resolves.toMatchObject({
      welcomeText: '',
    })
  })

  it('rechaza un color inválido con error tipado', async () => {
    const { source } = sourceWith([{ ...response, primary_color: 'red' }])
    await expect(source.getBranding(location)).rejects.toBeInstanceOf(
      InvalidTenantBrandingError,
    )
  })

  it('rechaza un campo faltante con error tipado', async () => {
    const incomplete: Record<string, unknown> = { ...response }
    delete incomplete.welcome_text
    const { source } = sourceWith([incomplete])
    await expect(source.getBranding(location)).rejects.toBeInstanceOf(
      InvalidTenantBrandingError,
    )
  })
})
