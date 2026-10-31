import type { TenantBranding } from '@/lib/tenant/branding'
import { buildBrandScale, pickOnColor } from './brand'

const themeKey = 'escuela-digital-theme'
export type Theme = 'light' | 'dark'

export function preferredTheme(): Theme {
  const saved = localStorage.getItem(themeKey)
  if (saved === 'light' || saved === 'dark') return saved
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme, persist = false): void {
  document.documentElement.dataset.theme = theme
  if (persist) localStorage.setItem(themeKey, theme)
}

export function applyBrand(branding: TenantBranding): void {
  const root = document.documentElement
  const scale = buildBrandScale(branding.colors.primary)
  for (const [step, value] of Object.entries(scale))
    root.style.setProperty(`--brand-${step}`, value)
  root.style.setProperty('--brand-base', branding.colors.primary)
  root.style.setProperty(
    '--brand-on-base',
    pickOnColor(branding.colors.primary),
  )
  root.style.setProperty('--brand-secondary', branding.colors.secondary)
  const isDefault = branding.colors.primary.toUpperCase() === '#4F46E5'
  root.style.setProperty(
    '--brand-hover-base',
    isDefault ? '#4338CA' : scale[600],
  )
  root.style.setProperty('--brand-soft-base', isDefault ? '#EEF2FF' : scale[50])
  root.style.setProperty(
    '--brand-dark-base',
    isDefault ? '#818CF8' : scale[400],
  )
  document.title = `${branding.name} · Escuela Digital`
}
