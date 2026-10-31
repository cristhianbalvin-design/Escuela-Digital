-- Paso 8: invitaciones por enlace (sin proveedor de correo).
-- Un docente/admin que gestiona una edición genera un enlace; el alumno crea su acceso
-- (Edge Function accept-invite) y acepta (accept_invitation): queda como estudiante
-- del tenant y del cliente, y matriculado (active) en la edición.

alter table public.invitations
  add column offering_id uuid;

alter table public.invitations
  add constraint invitations_offering_fk
  foreign key (tenant_id, offering_id)
  references public.offerings (tenant_id, id) on delete cascade;

create index invitations_offering_idx
  on public.invitations (tenant_id, offering_id);

-- Una sola invitación pendiente por correo y edición.
create unique index invitations_pending_offering_email_key
  on public.invitations (offering_id, email)
  where accepted_at is null and offering_id is not null;

-- ---------------------------------------------------------------------------
-- create_invitation: devuelve el token en claro UNA sola vez (solo se guarda el hash).
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(
  p_offering_id uuid,
  p_email text,
  p_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offering public.offerings%rowtype;
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo no válido' using errcode = '23514';
  end if;

  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'La vigencia debe estar entre 1 y 60 días' using errcode = '23514';
  end if;

  select o.* into v_offering
  from public.offerings o
  where o.id = p_offering_id;

  if v_offering.id is null
     or v_offering.deleted_at is not null
     or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite invitar a esta edición' using errcode = '42501';
  end if;

  if v_offering.status not in ('open', 'running') then
    raise exception 'La edición no admite matrículas ahora' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.tenant_id = v_offering.tenant_id
      and c.id = v_offering.client_id
      and c.status = 'active'
      and c.deleted_at is null
  ) then
    raise exception 'El cliente de la edición no está activo' using errcode = '23514';
  end if;

  -- Reemplaza una invitación pendiente previa del mismo correo (invalida el enlace anterior).
  delete from public.invitations i
  where i.offering_id = p_offering_id
    and i.email = v_email::extensions.citext
    and i.accepted_at is null;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => p_days);

  insert into public.invitations (
    tenant_id, client_id, offering_id, email, role, token_hash, expires_at, invited_by
  )
  values (
    v_offering.tenant_id, v_offering.client_id, p_offering_id,
    v_email::extensions.citext, 'student',
    sha256(convert_to(v_token, 'UTF8')), v_expires, (select auth.uid())
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_offering_invitations: sin token; solo quien gestiona la edición.
-- ---------------------------------------------------------------------------
create or replace function public.list_offering_invitations(p_offering_id uuid)
returns table (
  id uuid,
  email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite ver las invitaciones de esta edición'
      using errcode = '42501';
  end if;

  return query
  select i.id, i.email::text, i.expires_at, i.accepted_at, i.created_at
  from public.invitations i
  where i.offering_id = p_offering_id
  order by i.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_invitation: solo invitaciones pendientes.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offering_id uuid;
begin
  select i.offering_id into v_offering_id
  from public.invitations i
  where i.id = p_invitation_id and i.accepted_at is null;

  if v_offering_id is null
     or (select auth.uid()) is null
     or not app.can_manage_offering(v_offering_id) then
    raise exception 'No se permite revocar esta invitación' using errcode = '42501';
  end if;

  delete from public.invitations i where i.id = p_invitation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- preview_invitation: pública (anon) para pintar la pantalla de invitación.
-- Expone solo lo imprescindible a quien posee el token.
-- ---------------------------------------------------------------------------
create or replace function public.preview_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select i.email::text as email, i.expires_at, i.accepted_at,
         t.name as tenant_name, t.slug as tenant_slug, o.title as offering_title
  into r
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  left join public.offerings o
    on o.tenant_id = i.tenant_id and o.id = i.offering_id
  where i.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', case
      when r.accepted_at is not null then 'used'
      when r.expires_at <= now() then 'expired'
      else 'valid' end,
    'email', r.email,
    'tenant_name', r.tenant_name,
    'tenant_slug', r.tenant_slug,
    'offering_title', r.offering_title
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation: el usuario autenticado debe tener el correo invitado.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_inv public.invitations%rowtype;
  v_offering public.offerings%rowtype;
  v_member public.tenant_members%rowtype;
  v_enrollment_id uuid;
  v_occupied integer;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select i.* into v_inv
  from public.invitations i
  where i.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
  for update;

  if v_inv.id is null then
    raise exception 'Invitación no válida' using errcode = '42501';
  end if;
  if v_inv.email::text <> v_email then
    raise exception 'Esta invitación es para otro correo' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'La invitación ya fue usada' using errcode = '23514';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'La invitación venció' using errcode = '23514';
  end if;
  if v_inv.role <> 'student' or v_inv.offering_id is null then
    raise exception 'Tipo de invitación no soportado' using errcode = '23514';
  end if;

  select o.* into v_offering
  from public.offerings o
  where o.tenant_id = v_inv.tenant_id and o.id = v_inv.offering_id
  for update;

  if v_offering.id is null
     or v_offering.deleted_at is not null
     or v_offering.status not in ('open', 'running') then
    raise exception 'La edición no admite matrículas ahora' using errcode = '23514';
  end if;

  select tm.* into v_member
  from public.tenant_members tm
  where tm.tenant_id = v_inv.tenant_id and tm.user_id = v_uid;

  if v_member.user_id is not null then
    if v_member.role <> 'student' or v_member.status <> 'active' then
      raise exception 'La cuenta ya tiene otro rol o está suspendida en esta escuela'
        using errcode = '23514';
    end if;
  else
    insert into public.tenant_members (tenant_id, user_id, role, status, invited_by)
    values (v_inv.tenant_id, v_uid, 'student', 'active', v_inv.invited_by);
  end if;

  insert into public.client_members (tenant_id, client_id, user_id, role)
  values (v_inv.tenant_id, v_offering.client_id, v_uid, 'member')
  on conflict (tenant_id, client_id, user_id) do nothing;

  select e.id into v_enrollment_id
  from public.enrollments e
  where e.offering_id = v_offering.id and e.user_id = v_uid;

  if v_enrollment_id is null then
    if v_offering.seats is not null then
      select count(*)::integer into v_occupied
      from public.enrollments e
      where e.offering_id = v_offering.id and e.status <> 'dropped';

      if v_occupied >= v_offering.seats then
        raise exception 'No quedan cupos' using errcode = '23514';
      end if;
    end if;

    insert into public.enrollments (tenant_id, client_id, offering_id, user_id, status)
    values (v_inv.tenant_id, v_offering.client_id, v_offering.id, v_uid, 'active')
    returning id into v_enrollment_id;
  end if;

  update public.invitations i set accepted_at = now() where i.id = v_inv.id;

  select t.slug into v_slug from public.tenants t where t.id = v_inv.tenant_id;

  return jsonb_build_object(
    'offering_id', v_offering.id,
    'enrollment_id', v_enrollment_id,
    'tenant_slug', v_slug
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: nada por defecto; solo lo necesario.
-- ---------------------------------------------------------------------------
revoke all on function public.create_invitation(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.list_offering_invitations(uuid) from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid) from public, anon, authenticated;
revoke all on function public.preview_invitation(text) from public, anon, authenticated;
revoke all on function public.accept_invitation(text) from public, anon, authenticated;

grant execute on function public.create_invitation(uuid, text, integer) to authenticated;
grant execute on function public.list_offering_invitations(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.preview_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
