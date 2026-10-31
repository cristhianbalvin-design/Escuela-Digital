-- La respuesta pública contiene únicamente los campos de marca acordados.
-- Ojo: en funciones SQL el nombre de columna tiene prioridad sobre el
-- parámetro; por eso el parámetro se califica con el nombre de la función.
create function public.get_tenant_branding(host text)
returns table (
  name text,
  logo_light_url text,
  logo_dark_url text,
  primary_color text,
  secondary_color text,
  welcome_text text,
  language text,
  time_zone text
)
language sql stable security definer
set search_path = ''
as $$
  select
    t.name,
    t.logo_light_url,
    t.logo_dark_url,
    t.primary_color,
    t.secondary_color,
    t.welcome_text,
    t.language,
    t.time_zone
  from public.tenant_domains d
  join public.tenants t on t.id = d.tenant_id
  where d.host = lower(trim(trailing '.' from btrim(get_tenant_branding.host)))
    and d.verified
    and t.status = 'active'
  limit 1;
$$;

-- El selector devuelve solo las membresías activas de la sesión.
create function public.list_my_tenants()
returns table (
  tenant_id uuid,
  slug text,
  name text,
  role public.tenant_role,
  primary_host text
)
language sql stable security definer
set search_path = ''
as $$
  select
    t.id,
    t.slug,
    t.name,
    tm.role,
    d.host
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  left join public.tenant_domains d
    on d.tenant_id = t.id
   and d.is_primary
   and d.verified
  where tm.user_id = (select auth.uid())
    and tm.status = 'active'
  order by t.name, t.id;
$$;

revoke all on function public.get_tenant_branding(text)
  from public, anon, authenticated;
revoke all on function public.list_my_tenants()
  from public, anon, authenticated;

grant execute on function public.get_tenant_branding(text)
  to anon, authenticated;
grant execute on function public.list_my_tenants()
  to authenticated;
