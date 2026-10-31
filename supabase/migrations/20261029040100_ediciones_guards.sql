-- Los guards también protegen escrituras hechas por service_role.
create function app.guard_offering()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.course_version_status;
  v_release record;
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.enrollments e
      where e.offering_id = old.id
    ) then
      raise exception 'Una edición con matrículas no se puede borrar'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.client_id is distinct from old.client_id
       or new.course_id is distinct from old.course_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'La identidad de la edición es inmutable'
        using errcode = '23514';
    end if;

    if new.version_id is distinct from old.version_id
       and old.status <> 'draft' then
      raise exception 'La versión solo puede cambiar en draft'
        using errcode = '23514';
    end if;

    if new.deleted_at is distinct from old.deleted_at
       and new.deleted_at is not null
       and exists (
         select 1
         from public.enrollments e
         where e.offering_id = old.id
       ) then
      raise exception 'Una edición con matrículas no se puede borrar lógicamente'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.version_id is distinct from old.version_id then
    select cv.status
      into v_status
    from public.course_versions cv
    where cv.tenant_id = new.tenant_id
      and cv.course_id = new.course_id
      and cv.id = new.version_id
    for share;

    if v_status is distinct from 'published'::public.course_version_status then
      raise exception 'La edición requiere una versión publicada'
        using errcode = '23514';
    end if;
  end if;

  if new.release_schedule ? 'modules'
     and jsonb_typeof(new.release_schedule -> 'modules') <> 'object' then
    raise exception 'release_schedule.modules debe ser un objeto'
      using errcode = '23514';
  end if;

  for v_release in
    select j.key, j.value
    from jsonb_each(
      coalesce(
        new.release_schedule -> 'modules',
        '{}'::jsonb
      )
    ) as j(key, value)
  loop
    if jsonb_typeof(v_release.value) <> 'string'
       or not exists (
         select 1
         from public.modules m
         where m.tenant_id = new.tenant_id
           and m.version_id = new.version_id
           and m.id::text = v_release.key
       ) then
      raise exception 'Módulo o fecha de liberación inválidos'
        using errcode = '23514';
    end if;

    -- La conversión comprueba que la fecha sea aceptada por PostgreSQL.
    perform (v_release.value #>> '{}')::timestamptz;
  end loop;

  return new;
end;
$$;

create function app.guard_offering_instructor()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (
       new.offering_id is distinct from old.offering_id
       or new.user_id is distinct from old.user_id
       or new.tenant_id is distinct from old.tenant_id
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'La identidad de la asignación es inmutable'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = new.tenant_id
      and tm.user_id = new.user_id
      and tm.status = 'active'
      and tm.role in ('instructor', 'instructor_guest')
  ) then
    raise exception 'El docente debe ser miembro activo de la escuela'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function app.guard_enrollment()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (
       new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.client_id is distinct from old.client_id
       or new.offering_id is distinct from old.offering_id
       or new.user_id is distinct from old.user_id
       or new.enrolled_at is distinct from old.enrolled_at
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'La identidad de la matrícula es inmutable'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = new.tenant_id
      and tm.user_id = new.user_id
      and tm.status = 'active'
      and tm.role = 'student'
  ) then
    raise exception 'La matrícula requiere un estudiante activo'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger offerings_guard
  before insert or update or delete on public.offerings
  for each row execute function app.guard_offering();

create trigger offering_instructors_guard
  before insert or update on public.offering_instructors
  for each row execute function app.guard_offering_instructor();

create trigger enrollments_guard
  before insert or update on public.enrollments
  for each row execute function app.guard_enrollment();

revoke all on function app.guard_offering()
  from public, anon, authenticated;
revoke all on function app.guard_offering_instructor()
  from public, anon, authenticated;
revoke all on function app.guard_enrollment()
  from public, anon, authenticated;
