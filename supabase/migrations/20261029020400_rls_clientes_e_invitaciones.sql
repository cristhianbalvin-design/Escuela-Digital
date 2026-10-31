-- El coordinador solo lee el cliente al que está vinculado.
create policy clients_select on public.clients
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin', 'instructor']::public.tenant_role[]
    )
    or app.is_client_coordinator(id)
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy clients_update on public.clients
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

create policy clients_delete on public.clients
  for delete to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy client_members_select on public.client_members
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
    or app.is_client_coordinator(client_id)
  );

create policy client_members_insert on public.client_members
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy client_members_update on public.client_members
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

create policy client_members_delete on public.client_members
  for delete to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

-- Las invitaciones no son legibles para coordinadores ni docentes invitados.
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy invitations_insert on public.invitations
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

create policy invitations_update on public.invitations
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

create policy invitations_delete on public.invitations
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
