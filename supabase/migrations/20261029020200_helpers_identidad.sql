-- Los helpers consultan tablas protegidas sin recursión de RLS.
create function app.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

create function app.has_tenant_role(
  _tenant uuid,
  _roles public.tenant_role[]
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = _tenant
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role = any(_roles)
  );
$$;

create function app.is_client_coordinator(_client uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_members cm
    join public.tenant_members tm
      on tm.tenant_id = cm.tenant_id
     and tm.user_id = cm.user_id
    where cm.client_id = _client
      and cm.user_id = (select auth.uid())
      and cm.role = 'coordinator'
      and tm.role = 'client_coordinator'
      and tm.status = 'active'
  );
$$;

revoke all on function app.is_platform_admin() from public, anon, authenticated;
revoke all on function app.has_tenant_role(uuid, public.tenant_role[])
  from public, anon, authenticated;
revoke all on function app.is_client_coordinator(uuid)
  from public, anon, authenticated;

grant execute on function app.is_platform_admin() to authenticated;
grant execute on function app.has_tenant_role(uuid, public.tenant_role[])
  to authenticated;
grant execute on function app.is_client_coordinator(uuid) to authenticated;
