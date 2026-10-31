import { describe, expect, it } from 'vitest'
import { RESERVED_SLUGS, resolveTenant } from './index'

describe('resolveTenant', () => {
  const root = 'escueladigital.example'
  it('resuelve un subdominio de plataforma', () => {
    expect(resolveTenant('tideo.escueladigital.example', root)).toEqual({
      kind: 'subdomain',
      slug: 'tideo',
      host: 'tideo.escueladigital.example',
    })
  })
  it('resuelve slug.localhost', () => {
    expect(resolveTenant('udep-demo.localhost', root)).toEqual({
      kind: 'subdomain',
      slug: 'udep-demo',
      host: 'udep-demo.localhost',
    })
  })
  it('permite ?tenant= en local', () => {
    expect(resolveTenant('localhost', root, '?tenant=udep-demo')).toEqual({
      kind: 'subdomain',
      slug: 'udep-demo',
      host: 'localhost',
    })
  })
  it('resuelve un dominio propio', () => {
    expect(resolveTenant('academia.ejemplo.pe', root)).toEqual({
      kind: 'custom',
      host: 'academia.ejemplo.pe',
    })
  })
  it('resuelve el dominio de plataforma', () => {
    expect(resolveTenant(root, root)).toEqual({ kind: 'platform', host: root })
    expect(resolveTenant(`www.${root}`, root)).toEqual({
      kind: 'platform',
      host: `www.${root}`,
    })
    expect(resolveTenant(`app.${root}`, root)).toEqual({
      kind: 'platform',
      host: `app.${root}`,
    })
    expect(resolveTenant('app.localhost', root)).toEqual({
      kind: 'platform',
      host: 'app.localhost',
    })
  })
  it.each([...RESERVED_SLUGS])('no resuelve %s como escuela', (slug) => {
    const kind = slug === 'www' || slug === 'app' ? 'platform' : 'custom'
    expect(resolveTenant(`${slug}.${root}`, root)).toEqual({
      kind,
      host: `${slug}.${root}`,
    })
    expect(resolveTenant(`${slug}.localhost`, root)).toEqual({
      kind: slug === 'app' ? 'platform' : 'custom',
      host: `${slug}.localhost`,
    })
    expect(resolveTenant('localhost', root, `?tenant=${slug}`)).toEqual({
      kind,
      host: 'localhost',
    })
  })
})
