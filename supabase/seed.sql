-- Escuelas de demostración; los hosts .localhost son solo para desarrollo local.
insert into public.tenants (
  slug, name, primary_color, secondary_color, welcome_text
)
values
  (
    'tideo',
    'TIDEO Tech & Strategy',
    '#4F46E5',
    '#14B8A6',
    'Bienvenido a TIDEO Tech & Strategy'
  ),
  (
    'udep-demo',
    'Escuela Demo UDEP Digital',
    '#059669',
    '#F59E0B',
    'Bienvenido a Escuela Demo UDEP Digital'
  )
on conflict (slug) do nothing;

insert into public.tenant_domains (
  tenant_id, host, kind, verified, is_primary
)
select
  t.id,
  'tideo.localhost',
  'subdomain'::public.domain_kind,
  true,
  true
from public.tenants t
where t.slug = 'tideo'
on conflict (host) do nothing;

insert into public.tenant_domains (
  tenant_id, host, kind, verified, is_primary
)
select
  t.id,
  'udep-demo.localhost',
  'subdomain'::public.domain_kind,
  true,
  true
from public.tenants t
where t.slug = 'udep-demo'
on conflict (host) do nothing;
