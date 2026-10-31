import type { TenantBranding } from '@/lib/tenant/branding'

export const schools: Record<string, TenantBranding> = {
  tideo: {
    name: 'TIDEO Tech & Strategy',
    logos: { mark: 'T', alt: 'TIDEO' },
    colors: { primary: '#4F46E5', secondary: '#14B8A6' },
    welcomeText: 'Bienvenido a TIDEO Tech & Strategy',
    language: 'es',
    timeZone: 'America/Lima',
  },
  'udep-demo': {
    name: 'Escuela Demo UDEP Digital',
    logos: { mark: 'U', alt: 'UDEP Digital' },
    colors: { primary: '#059669', secondary: '#F59E0B' },
    welcomeText: 'Bienvenido a Escuela Demo UDEP Digital',
    language: 'es',
    timeZone: 'America/Lima',
  },
}
