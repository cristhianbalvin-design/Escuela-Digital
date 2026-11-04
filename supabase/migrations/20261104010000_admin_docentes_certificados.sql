-- Vista administrador: asignación de docentes a ediciones y listado de certificados emitidos.
-- Todas las funciones exigen ser propietario/administrador de la escuela (o administrador de plataforma).

create function app.require_school_admin(p_tenant_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  if not (app.is_platform_admin()
          or app.has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[])) then
    raise exception 'Solo el equipo administrador de la escuela puede hacer esto' using errcode = '42501';
  end if;
end;
$$;
revoke all on function app.require_school_admin(uuid) from public, anon, authenticated;

-- Docentes de la escuela que se pueden asignar a una edición.
create function public.list_tenant_instructors(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_school_admin(p_tenant_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', tm.user_id,
      'email', u.email::text,
      'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
      'role', tm.role
    ) order by lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email::text)))
    from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    where tm.tenant_id = p_tenant_id
      and tm.status = 'active'
      and tm.role in ('instructor', 'instructor_guest')
  ), '[]'::jsonb);
end;
$$;

-- Docentes asignados a cada edición de la escuela.
create function public.list_offering_assignments(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_school_admin(p_tenant_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'offering_id', oi.offering_id,
      'user_id', oi.user_id,
      'role', oi.role,
      'email', u.email::text,
      'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    ) order by oi.role, oi.created_at)
    from public.offering_instructors oi
    join public.offerings o on o.id = oi.offering_id and o.deleted_at is null
    join auth.users u on u.id = oi.user_id
    where oi.tenant_id = p_tenant_id
  ), '[]'::jsonb);
end;
$$;

create function public.set_offering_instructor(p_offering_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
begin
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;
  perform app.require_school_admin(v_o.tenant_id);
  if p_role not in ('lead', 'assistant') then
    raise exception 'El rol del docente no es válido' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = v_o.tenant_id and tm.user_id = p_user_id
      and tm.status = 'active' and tm.role in ('instructor', 'instructor_guest')) then
    raise exception 'Esa persona no es docente activo de la escuela' using errcode = '23514';
  end if;
  insert into public.offering_instructors (offering_id, user_id, tenant_id, role)
  values (v_o.id, p_user_id, v_o.tenant_id, p_role::public.offering_instructor_role)
  on conflict (offering_id, user_id) do update
    set role = excluded.role, updated_at = now();
end;
$$;

create function public.remove_offering_instructor(p_offering_id uuid, p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
begin
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;
  perform app.require_school_admin(v_o.tenant_id);
  delete from public.offering_instructors
  where offering_id = p_offering_id and user_id = p_user_id;
end;
$$;

-- Certificados emitidos de toda la escuela (más recientes primero).
create function public.list_tenant_certificates(p_tenant_id uuid, p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform app.require_school_admin(p_tenant_id);
  return coalesce((
    select jsonb_agg(x.j order by x.issued_at desc)
    from (
      select c.issued_at,
        jsonb_build_object(
          'id', c.id,
          'code', c.code,
          'student_name', c.student_name,
          'course_title', c.course_title,
          'offering_id', c.offering_id,
          'offering_title', o.title,
          'client_name', cl.name,
          'status', c.status,
          'issued_at', c.issued_at,
          'revoked_at', c.revoked_at,
          'pdf_path', c.pdf_path
        ) as j
      from public.certificates c
      join public.offerings o on o.id = c.offering_id
      join public.clients cl on cl.id = c.client_id
      where c.tenant_id = p_tenant_id
        and (v_search is null
             or c.student_name ilike '%' || v_search || '%'
             or c.code ilike '%' || v_search || '%'
             or c.course_title ilike '%' || v_search || '%'
             or o.title ilike '%' || v_search || '%')
      order by c.issued_at desc
      limit 300
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_tenant_instructors(uuid), public.list_offering_assignments(uuid),
  public.set_offering_instructor(uuid, uuid, text), public.remove_offering_instructor(uuid, uuid),
  public.list_tenant_certificates(uuid, text) from public, anon;
grant execute on function public.list_tenant_instructors(uuid), public.list_offering_assignments(uuid),
  public.set_offering_instructor(uuid, uuid, text), public.remove_offering_instructor(uuid, uuid),
  public.list_tenant_certificates(uuid, text) to authenticated;
