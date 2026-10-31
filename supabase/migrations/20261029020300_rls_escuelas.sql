-- Ninguna tabla pública queda disponible para anon.
revoke all on public.platform_admins, public.tenants,
  public.tenant_domains, public.tenant_members,
  public.clients, public.client_members, public.invitations
  from public, anon, authenticated;

grant select, insert, update, delete
  on public.platform_admins, public.tenants, public.tenant_members,
     public.clients, public.client_members
  to authenticated;

-- La escuela puede registrar dominios pendientes, pero solo el backend verifica.
grant select, delete on public.tenant_domains to authenticated;
grant insert (tenant_id, host, kind)
  on public.tenant_domains to authenticated;
grant update (is_primary)
  on public.tenant_domains to authenticated;

-- La aceptación la registrará una RPC posterior; el navegador no la escribe.
grant select, delete on public.invitations to authenticated;
grant insert (
  tenant_id, client_id, email, role, token_hash, expires_at, invited_by
) on public.invitations to authenticated;
grant update (
  client_id, email, role, token_hash, expires_at
) on public.invitations to authenticated;

grant all on public.platform_admins, public.tenants,
  public.tenant_domains, public.tenant_members,
  public.clients, public.client_members, public.invitations
  to service_role;

alter table public.platform_admins enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.invitations enable row level security;

-- Operadores: el primer registro se crea mediante service_role.
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or app.is_platform_admin());

create policy platform_admins_insert on public.platform_admins
  for insert to authenticated
  with check (app.is_platform_admin());

create policy platform_admins_update on public.platform_admins
  for update to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy platform_admins_delete on public.platform_admins
  for delete to authenticated
  using (app.is_platform_admin());

-- La configuración directa excluye a docentes invitados y coordinadores.
create policy tenants_select on public.tenants
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      id,
      array['owner', 'admin', 'instructor', 'student']::public.tenant_role[]
    )
  );

create policy tenants_insert on public.tenants
  for insert to authenticated
  with check (app.is_platform_admin());

create policy tenants_update on public.tenants
  for update to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      id, array['owner', 'admin']::public.tenant_role[]
    )
  )
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy tenants_delete on public.tenants
  for delete to authenticated
  using (app.is_platform_admin());

create policy tenant_domains_select on public.tenant_domains
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id,
      array['owner', 'admin', 'instructor', 'student']::public.tenant_role[]
    )
  );

create policy tenant_domains_insert on public.tenant_domains
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy tenant_domains_update on public.tenant_domains
  for update to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  )
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy tenant_domains_delete on public.tenant_domains
  for delete to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

-- Cada miembro ve su fila, salvo el docente invitado; administradores ven el equipo.
create policy tenant_members_select on public.tenant_members
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
    or (
      user_id = (select auth.uid())
      and role <> 'instructor_guest'
    )
  );

create policy tenant_members_insert on public.tenant_members
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or (
      app.has_tenant_role(
        tenant_id, array['owner', 'admin']::public.tenant_role[]
      )
      and (
        role <> 'owner'
        or app.has_tenant_role(
          tenant_id, array['owner']::public.tenant_role[]
        )
      )
    )
  );

create policy tenant_members_update on public.tenant_members
  for update to authenticated
  using (
    app.is_platform_admin()
    or (
      app.has_tenant_role(
        tenant_id, array['owner', 'admin']::public.tenant_role[]
      )
      and (
        role <> 'owner'
        or app.has_tenant_role(
          tenant_id, array['owner']::public.tenant_role[]
        )
      )
    )
  )
  with check (
    app.is_platform_admin()
    or (
      app.has_tenant_role(
        tenant_id, array['owner', 'admin']::public.tenant_role[]
      )
      and (
        role <> 'owner'
        or app.has_tenant_role(
          tenant_id, array['owner']::public.tenant_role[]
        )
      )
    )
  );

create policy tenant_members_delete on public.tenant_members
  for delete to authenticated
  using (
    app.is_platform_admin()
    or (
      app.has_tenant_role(
        tenant_id, array['owner', 'admin']::public.tenant_role[]
      )
      and (
        role <> 'owner'
        or app.has_tenant_role(
          tenant_id, array['owner']::public.tenant_role[]
        )
      )
    )
  );
