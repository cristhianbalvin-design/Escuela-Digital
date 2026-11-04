-- Personas: invitar por enlace y gestionar docentes, coordinadores y administradores de la escuela.

-- Una sola invitación pendiente por correo para el equipo de la escuela (sin edición).
create unique index invitations_pending_staff_email_key
  on public.invitations (tenant_id, email)
  where accepted_at is null and offering_id is null;

-- Crear invitación de equipo: devuelve el token una sola vez.
create function public.invite_school_member(
  p_tenant_id uuid, p_email text, p_role text,
  p_client_id uuid default null, p_days integer default 14)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_id uuid;
  v_expires timestamptz;
  v_member public.tenant_members%rowtype;
begin
  perform app.require_school_admin(p_tenant_id);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo no válido' using errcode = '23514';
  end if;
  if p_role not in ('instructor', 'instructor_guest', 'client_coordinator', 'admin') then
    raise exception 'El rol no es válido' using errcode = '23514';
  end if;
  if p_role = 'admin' and not (app.is_platform_admin()
      or app.has_tenant_role(p_tenant_id, array['owner']::public.tenant_role[])) then
    raise exception 'Solo el propietario puede invitar administradores' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'La vigencia debe estar entre 1 y 60 días' using errcode = '23514';
  end if;
  if p_role = 'client_coordinator' then
    if p_client_id is null or not exists (
      select 1 from public.clients c
      where c.tenant_id = p_tenant_id and c.id = p_client_id
        and c.status = 'active' and c.deleted_at is null) then
      raise exception 'Elige un cliente activo para el coordinador' using errcode = '23514';
    end if;
  else
    p_client_id := null;
  end if;
  select tm.* into v_member
  from public.tenant_members tm
  join auth.users u on u.id = tm.user_id
  where tm.tenant_id = p_tenant_id and lower(u.email::text) = v_email;
  if v_member.user_id is not null then
    raise exception 'Esa persona ya pertenece a la escuela' using errcode = '23514';
  end if;
  delete from public.invitations i
  where i.tenant_id = p_tenant_id and i.email = v_email::extensions.citext
    and i.accepted_at is null and i.offering_id is null;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => p_days);
  insert into public.invitations (tenant_id, client_id, email, role, token_hash, expires_at, invited_by)
  values (p_tenant_id, p_client_id, v_email::extensions.citext, p_role::public.tenant_role,
          sha256(convert_to(v_token, 'UTF8')), v_expires, (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

-- Equipo de la escuela (sin alumnos) e invitaciones pendientes.
create function public.list_school_people(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_school_admin(p_tenant_id);
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', tm.user_id,
        'email', u.email::text,
        'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
        'role', tm.role,
        'status', tm.status,
        'created_at', tm.created_at,
        'clients', coalesce((
          select jsonb_agg(c.name order by c.name)
          from public.client_members cm
          join public.clients c on c.id = cm.client_id and c.tenant_id = cm.tenant_id
          where cm.tenant_id = tm.tenant_id and cm.user_id = tm.user_id and cm.role = 'coordinator'
        ), '[]'::jsonb)
      ) order by tm.role, lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.email::text)))
      from public.tenant_members tm
      join auth.users u on u.id = tm.user_id
      where tm.tenant_id = p_tenant_id and tm.role <> 'student'
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'email', i.email::text,
        'role', i.role,
        'client_name', c.name,
        'expires_at', i.expires_at,
        'created_at', i.created_at,
        'expired', i.expires_at <= now()
      ) order by i.created_at desc)
      from public.invitations i
      left join public.clients c on c.id = i.client_id and c.tenant_id = i.tenant_id
      where i.tenant_id = p_tenant_id and i.accepted_at is null and i.offering_id is null
    ), '[]'::jsonb));
end;
$$;

-- Suspender o reactivar a alguien del equipo.
create function public.set_school_member_status(p_tenant_id uuid, p_user_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_role public.tenant_role;
begin
  perform app.require_school_admin(p_tenant_id);
  if p_status not in ('active', 'suspended') then
    raise exception 'Estado no válido' using errcode = '23514';
  end if;
  select tm.role into v_role from public.tenant_members tm
  where tm.tenant_id = p_tenant_id and tm.user_id = p_user_id and tm.role <> 'student';
  if v_role is null then
    raise exception 'Persona no encontrada' using errcode = '42501';
  end if;
  if v_role = 'owner' then
    raise exception 'No se puede suspender al propietario' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'No puedes suspender tu propia cuenta' using errcode = '42501';
  end if;
  if v_role = 'admin' and not (app.is_platform_admin()
      or app.has_tenant_role(p_tenant_id, array['owner']::public.tenant_role[])) then
    raise exception 'Solo el propietario puede gestionar administradores' using errcode = '42501';
  end if;
  update public.tenant_members set status = p_status::public.member_status, updated_at = now()
  where tenant_id = p_tenant_id and user_id = p_user_id;
end;
$$;

-- Anular una invitación pendiente del equipo.
create function public.revoke_school_invitation(p_invitation_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_inv public.invitations%rowtype;
begin
  select i.* into v_inv from public.invitations i
  where i.id = p_invitation_id and i.offering_id is null and i.accepted_at is null;
  if v_inv.id is null then
    raise exception 'Invitación no encontrada' using errcode = '42501';
  end if;
  perform app.require_school_admin(v_inv.tenant_id);
  delete from public.invitations where id = p_invitation_id;
end;
$$;

-- Vista previa pública: ahora incluye el rol y el cliente.
create or replace function public.preview_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select i.email::text as email, i.expires_at, i.accepted_at, i.role::text as role,
         t.name as tenant_name, t.slug as tenant_slug, o.title as offering_title,
         c.name as client_name
  into r
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  left join public.offerings o on o.tenant_id = i.tenant_id and o.id = i.offering_id
  left join public.clients c on c.tenant_id = i.tenant_id and c.id = i.client_id
  where i.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object(
    'status', case when r.accepted_at is not null then 'used'
                   when r.expires_at <= now() then 'expired' else 'valid' end,
    'email', r.email, 'tenant_name', r.tenant_name,
    'tenant_slug', r.tenant_slug, 'offering_title', r.offering_title,
    'role', r.role, 'client_name', r.client_name);
end;
$$;

-- Aceptar invitación: alumnos (con edición) y equipo de la escuela.
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  select i.* into v_inv from public.invitations i
  where i.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8')) for update;
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
  select t.slug into v_slug from public.tenants t where t.id = v_inv.tenant_id;

  -- Equipo de la escuela (docente, docente invitado, coordinador, administrador)
  if v_inv.offering_id is null then
    if v_inv.role not in ('instructor', 'instructor_guest', 'client_coordinator', 'admin') then
      raise exception 'Tipo de invitación no soportado' using errcode = '23514';
    end if;
    select tm.* into v_member from public.tenant_members tm
    where tm.tenant_id = v_inv.tenant_id and tm.user_id = v_uid;
    if v_member.user_id is not null then
      raise exception 'La cuenta ya pertenece a esta escuela' using errcode = '23514';
    end if;
    insert into public.tenant_members (tenant_id, user_id, role, status, can_author, invited_by)
    values (v_inv.tenant_id, v_uid, v_inv.role, 'active',
            v_inv.role in ('instructor', 'admin'), v_inv.invited_by);
    if v_inv.role = 'client_coordinator' then
      insert into public.client_members (tenant_id, client_id, user_id, role)
      values (v_inv.tenant_id, v_inv.client_id, v_uid, 'coordinator')
      on conflict (tenant_id, client_id, user_id) do update set role = 'coordinator';
    end if;
    update public.invitations i set accepted_at = now() where i.id = v_inv.id;
    return jsonb_build_object('role', v_inv.role, 'tenant_slug', v_slug);
  end if;

  -- Alumno con edición
  if v_inv.role <> 'student' then
    raise exception 'Tipo de invitación no soportado' using errcode = '23514';
  end if;
  select o.* into v_offering from public.offerings o
  where o.tenant_id = v_inv.tenant_id and o.id = v_inv.offering_id for update;
  if v_offering.id is null or v_offering.deleted_at is not null
     or v_offering.status not in ('open', 'running') then
    raise exception 'La edición no admite matrículas ahora' using errcode = '23514';
  end if;
  select tm.* into v_member from public.tenant_members tm
  where tm.tenant_id = v_inv.tenant_id and tm.user_id = v_uid;
  if v_member.user_id is not null then
    if v_member.role <> 'student' or v_member.status <> 'active' then
      raise exception 'La cuenta ya tiene otro rol o está suspendida en esta escuela' using errcode = '23514';
    end if;
  else
    insert into public.tenant_members (tenant_id, user_id, role, status, invited_by)
    values (v_inv.tenant_id, v_uid, 'student', 'active', v_inv.invited_by);
  end if;
  insert into public.client_members (tenant_id, client_id, user_id, role)
  values (v_inv.tenant_id, v_offering.client_id, v_uid, 'member')
  on conflict (tenant_id, client_id, user_id) do nothing;
  select e.id into v_enrollment_id from public.enrollments e
  where e.offering_id = v_offering.id and e.user_id = v_uid;
  if v_enrollment_id is null then
    if v_offering.seats is not null then
      select count(*)::integer into v_occupied from public.enrollments e
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
  return jsonb_build_object('role', 'student', 'offering_id', v_offering.id,
    'enrollment_id', v_enrollment_id, 'tenant_slug', v_slug);
end;
$$;

-- Alumnos sin correo de la escuela (para darles uno).
create function public.list_placeholder_students(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_school_admin(p_tenant_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', tm.user_id,
      'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
      'clients', coalesce((
        select jsonb_agg(c.name order by c.name)
        from public.client_members cm
        join public.clients c on c.id = cm.client_id and c.tenant_id = cm.tenant_id
        where cm.tenant_id = tm.tenant_id and cm.user_id = tm.user_id), '[]'::jsonb)
    ) order by lower(coalesce(u.raw_user_meta_data ->> 'full_name', '')))
    from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    where tm.tenant_id = p_tenant_id and tm.role = 'student'
      and u.email::text like 'sin-correo-%@sin-correo.invalid'
  ), '[]'::jsonb);
end;
$$;

-- Validación previa a poner correo a un alumno sin correo (la actualización la hace la API con clave de servicio).
create function public.check_placeholder_email_change(p_tenant_id uuid, p_user_id uuid, p_email text)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform app.require_school_admin(p_tenant_id);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_email like '%@sin-correo.invalid' then
    raise exception 'Correo no válido' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    where tm.tenant_id = p_tenant_id and tm.user_id = p_user_id and tm.role = 'student'
      and u.email::text like 'sin-correo-%@sin-correo.invalid') then
    raise exception 'Ese alumno no está sin correo' using errcode = '42501';
  end if;
  if exists (select 1 from auth.users u where lower(u.email::text) = v_email) then
    raise exception 'Ya existe una cuenta con ese correo' using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.invite_school_member(uuid, text, text, uuid, integer),
  public.list_school_people(uuid), public.set_school_member_status(uuid, uuid, text),
  public.revoke_school_invitation(uuid), public.list_placeholder_students(uuid),
  public.check_placeholder_email_change(uuid, uuid, text) from public, anon;
grant execute on function public.invite_school_member(uuid, text, text, uuid, integer),
  public.list_school_people(uuid), public.set_school_member_status(uuid, uuid, text),
  public.revoke_school_invitation(uuid), public.list_placeholder_students(uuid),
  public.check_placeholder_email_change(uuid, uuid, text) to authenticated;
