-- Material con audiencia: "students" (visible para alumnos) o "teachers" (solo equipo docente).
alter table public.lesson_resources
  add column audience text not null default 'students'
  check (audience in ('students', 'teachers'));
grant insert (audience), update (audience) on public.lesson_resources to authenticated;

-- Las versiones nuevas conservan la audiencia de cada archivo.
do $$
declare
  d text := pg_get_functiondef('public.create_draft_from_version(uuid)'::regprocedure);
begin
  d := replace(d,
    'lesson_id, version_id, tenant_id, name, storage_path, kind, size_bytes',
    'lesson_id, version_id, tenant_id, name, storage_path, kind, size_bytes, audience');
  d := replace(d,
    'r.name, r.storage_path, r.kind, r.size_bytes',
    'r.name, r.storage_path, r.kind, r.size_bytes, r.audience');
  if position('r.audience' in d) = 0 or position(', audience' in d) = 0 then
    raise exception 'No se pudo actualizar create_draft_from_version';
  end if;
  execute d;
end $$;

-- Archivos: el alumno solo puede leer los marcados para alumnos.
create or replace function app.can_read_lesson_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.can_edit_lesson_file(p_name) or exists (
    select 1
    from public.lesson_resources r
    join public.course_versions cv on cv.id = r.version_id
    where r.storage_path = p_name
      and (
        app.can_read_course(cv.course_id)
        or (
          r.audience = 'students'
          and exists (
            select 1
            from public.offerings o
            join public.enrollments e on e.offering_id = o.id
            where o.version_id = r.version_id
              and o.deleted_at is null
              and e.user_id = (select auth.uid())
              and e.status in ('active', 'completed')))));
$$;

-- Lista de adjuntos: el equipo docente ve todo; el alumno, solo lo marcado para alumnos.
create or replace function public.get_lesson_resources(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_l public.lessons%rowtype;
  v_course uuid;
  v_staff boolean;
  v_ok boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select l.* into v_l from public.lessons l where l.id = p_lesson_id;
  if v_l.id is null then
    return '[]'::jsonb;
  end if;
  select cv.course_id into v_course from public.course_versions cv where cv.id = v_l.version_id;
  v_staff := app.can_read_course(v_course);
  v_ok := v_staff;
  if not v_ok then
    v_ok := exists (
      select 1
      from public.offerings o
      join public.enrollments e on e.offering_id = o.id
      where o.version_id = v_l.version_id
        and o.deleted_at is null
        and e.user_id = (select auth.uid())
        and e.status in ('active', 'completed')
        and (
          greatest(o.starts_at, (o.release_schedule -> 'modules' ->> v_l.module_id::text)::timestamptz) is null
          or greatest(o.starts_at, (o.release_schedule -> 'modules' ->> v_l.module_id::text)::timestamptz) <= now()));
  end if;
  if not v_ok then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'kind', r.kind,
      'size_bytes', r.size_bytes, 'storage_path', r.storage_path,
      'audience', r.audience
    ) order by r.name, r.id)
    from public.lesson_resources r
    where r.lesson_id = p_lesson_id
      and (v_staff or r.audience = 'students')), '[]'::jsonb);
end;
$$;
