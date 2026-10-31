create function public.create_offering(
  p_tenant_id uuid,
  p_client_id uuid,
  p_version_id uuid,
  p_title text,
  p_code text,
  p_modality public.offering_modality,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_seats integer,
  p_enrollment_mode public.enrollment_mode,
  p_timezone text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_offering_id uuid;
  v_is_instructor boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.tenants t
    where t.id = p_tenant_id
      and t.status = 'active'
  ) then
    raise exception 'Escuela inexistente o inactiva'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.tenant_id = p_tenant_id
      and c.id = p_client_id
      and c.status = 'active'
      and c.deleted_at is null
  ) then
    raise exception 'Cliente inexistente o inactivo'
      using errcode = '23514';
  end if;

  select cv.course_id
    into v_course_id
  from public.course_versions cv
  join public.courses c
    on c.tenant_id = cv.tenant_id
   and c.id = cv.course_id
  where cv.tenant_id = p_tenant_id
    and cv.id = p_version_id
    and cv.status = 'published'
    and c.deleted_at is null
  for share of cv;

  if v_course_id is null then
    raise exception 'La versión debe estar publicada en esta escuela'
      using errcode = '23514';
  end if;

  v_is_instructor := app.has_tenant_role(
    p_tenant_id,
    array['instructor']::public.tenant_role[]
  );

  if not (
    app.is_platform_admin()
    or app.has_tenant_role(
      p_tenant_id,
      array['owner', 'admin']::public.tenant_role[]
    )
    or (
      v_is_instructor
      and app.can_read_course(v_course_id)
    )
  ) then
    raise exception 'No se permite crear esta edición'
      using errcode = '42501';
  end if;

  insert into public.offerings (
    tenant_id, client_id, course_id, version_id, title, code,
    modality, starts_at, ends_at, seats, enrollment_mode,
    timezone, created_by
  )
  values (
    p_tenant_id, p_client_id, v_course_id, p_version_id,
    p_title, p_code, p_modality, p_starts_at, p_ends_at,
    p_seats, p_enrollment_mode, p_timezone, (select auth.uid())
  )
  returning id into v_offering_id;

  if v_is_instructor then
    insert into public.offering_instructors (
      offering_id, user_id, tenant_id, role
    )
    values (
      v_offering_id, (select auth.uid()), p_tenant_id, 'lead'
    );
  end if;

  return v_offering_id;
end;
$$;

create function public.enroll_user(
  p_offering_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_offering public.offerings%rowtype;
  v_enrollment_id uuid;
  v_occupied integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  -- El bloqueo de la edición serializa todas las altas para este cupo.
  select o.*
    into v_offering
  from public.offerings o
  where o.id = p_offering_id
  for update;

  if v_offering.id is null
     or v_offering.deleted_at is not null
     or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite matricular en esta edición'
      using errcode = '42501';
  end if;

  select e.id
    into v_enrollment_id
  from public.enrollments e
  where e.offering_id = p_offering_id
    and e.user_id = p_user_id;

  if v_enrollment_id is not null then
    return v_enrollment_id;
  end if;

  if v_offering.status not in ('open', 'running') then
    raise exception 'La edición no admite matrículas ahora'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.tenant_id = v_offering.tenant_id
      and c.id = v_offering.client_id
      and c.status = 'active'
      and c.deleted_at is null
  ) then
    raise exception 'El cliente de la edición no está activo'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    join public.client_members cm
      on cm.tenant_id = tm.tenant_id
     and cm.user_id = tm.user_id
    where tm.tenant_id = v_offering.tenant_id
      and tm.user_id = p_user_id
      and tm.status = 'active'
      and tm.role = 'student'
      and cm.client_id = v_offering.client_id
  ) then
    raise exception 'El usuario debe ser estudiante del cliente'
      using errcode = '23514';
  end if;

  if v_offering.seats is not null then
    select count(*)::integer
      into v_occupied
    from public.enrollments e
    where e.offering_id = p_offering_id
      and e.status <> 'dropped';

    if v_occupied >= v_offering.seats then
      raise exception 'No quedan cupos'
        using errcode = '23514';
    end if;
  end if;

  insert into public.enrollments (
    tenant_id, client_id, offering_id, user_id, status
  )
  values (
    v_offering.tenant_id, v_offering.client_id,
    p_offering_id, p_user_id, 'pending'
  )
  returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$;

create function public.set_enrollment_status(
  p_enrollment_id uuid,
  p_status public.enrollment_status
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  select e.*
    into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if v_enrollment.id is null
     or not app.can_manage_offering(v_enrollment.offering_id) then
    raise exception 'No se permite modificar esta matrícula'
      using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'El estado es obligatorio'
      using errcode = '23514';
  end if;

  if p_status = v_enrollment.status then
    return p_enrollment_id;
  end if;

  if not (
    (v_enrollment.status = 'pending'
      and p_status in ('active', 'dropped', 'suspended'))
    or (v_enrollment.status = 'active'
      and p_status in ('completed', 'dropped', 'suspended'))
    or (v_enrollment.status = 'suspended'
      and p_status in ('active', 'dropped'))
  ) then
    raise exception 'Transición de matrícula no permitida'
      using errcode = '23514';
  end if;

  update public.enrollments e
  set status = p_status,
      completed_at = case
        when p_status = 'completed' then now()
        else null
      end
  where e.id = p_enrollment_id;

  return p_enrollment_id;
end;
$$;

revoke all on function public.create_offering(
  uuid, uuid, uuid, text, text, public.offering_modality,
  timestamptz, timestamptz, integer, public.enrollment_mode, text
) from public, anon, authenticated;
revoke all on function public.enroll_user(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_enrollment_status(
  uuid, public.enrollment_status
) from public, anon, authenticated;

grant execute on function public.create_offering(
  uuid, uuid, uuid, text, text, public.offering_modality,
  timestamptz, timestamptz, integer, public.enrollment_mode, text
) to authenticated;
grant execute on function public.enroll_user(uuid, uuid)
  to authenticated;
grant execute on function public.set_enrollment_status(
  uuid, public.enrollment_status
) to authenticated;
