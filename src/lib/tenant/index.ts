export type TenantLocation = {
  kind: 'subdomain' | 'custom' | 'platform'
  slug?: string
  host: string
}

const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_SLUGS = new Set([
  'www',
  'app',
  'verifica',
  'api',
  'admin',
  'plataforma',
  'static',
  'assets',
  'mail',
  'docs',
  'status',
])

function fromSlug(
  slug: string,
  host: string,
  platformAlias: boolean,
): TenantLocation {
  if (platformAlias && (slug === 'www' || slug === 'app'))
    return { kind: 'platform', host }
  if (RESERVED_SLUGS.has(slug)) return { kind: 'custom', host }
  return { kind: 'subdomain', slug, host }
}

export function resolveTenant(
  hostname: string,
  platformRootDomain: string,
  search = '',
): TenantLocation {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const root = platformRootDomain.toLowerCase().replace(/\.$/, '')
  const override = new URLSearchParams(search).get('tenant')?.toLowerCase()
  if (override && validSlug.test(override))
    return fromSlug(override, host, true)

  if (host.endsWith('.localhost')) {
    const slug = host.slice(0, -'.localhost'.length)
    if (validSlug.test(slug)) return fromSlug(slug, host, slug === 'app')
  }
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === root ||
    host === `www.${root}`
  )
    return { kind: 'platform', host }

  if (root && host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -(root.length + 1))
    if (validSlug.test(slug)) return fromSlug(slug, host, true)
  }
  return { kind: 'custom', host }
}
