-- Adjuntos por lección (presentaciones, ejercicios, PDF, etc.).
-- Reutiliza public.lesson_resources; los archivos viven en el bucket privado lesson-resources
-- con ruta {tenant_id}/{lesson_id}/{uuid}-{nombre}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-resources', 'lesson-resources', false, 26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/csv',
    'application/zip', 'video/mp4'
  ]
)
on conflict (id) do nothing;

-- Subir o borrar: solo quien edita el curso y la versión está en borrador.
create function app.can_edit_lesson_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 3) <> '' and exists (
    select 1
    from public.lessons l
    join public.course_versions cv on cv.id = l.version_id
    where l.id::text = split_part(p_name, '/', 2)
      and l.tenant_id::text = split_part(p_name, '/', 1)
      and cv.status = 'draft'
      and app.can_edit_course(cv.course_id));
$$;

-- Leer: quien edita, quien puede leer el curso, o un alumno matriculado en una edición
-- de la versión que referencia el archivo (las versiones nuevas comparten la misma ruta).
create function app.can_read_lesson_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.can_edit_lesson_file(p_name) or exists (
    select 1
    from public.lesson_resources r
    join public.course_versions cv on cv.id = r.version_id
    where r.storage_path = p_name
      and (
        app.can_read_course(cv.course_id)
        or exists (
          select 1
          from public.offerings o
          join public.enrollments e on e.offering_id = o.id
          where o.version_id = r.version_id
            and o.deleted_at is null
            and e.user_id = (select auth.uid())
            and e.status in ('active', 'completed'))));
$$;

revoke all on function app.can_edit_lesson_file(text), app.can_read_lesson_file(text)
  from public, anon, authenticated;
grant execute on function app.can_edit_lesson_file(text), app.can_read_lesson_file(text)
  to authenticated;

create policy lesson_resources_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-resources' and app.can_edit_lesson_file(name));
create policy lesson_resources_files_select on storage.objects for select to authenticated
  using (bucket_id = 'lesson-resources' and app.can_read_lesson_file(name));
create policy lesson_resources_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-resources' and app.can_edit_lesson_file(name));

-- Lista de adjuntos de una lección: el equipo docente ve todo; el alumno, solo si su
-- edición ya liberó el módulo.
create function public.get_lesson_resources(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_l public.lessons%rowtype;
  v_course uuid;
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
  v_ok := app.can_read_course(v_course);
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
      'size_bytes', r.size_bytes, 'storage_path', r.storage_path
    ) order by r.name, r.id)
    from public.lesson_resources r
    where r.lesson_id = p_lesson_id), '[]'::jsonb);
end;
$$;

revoke all on function public.get_lesson_resources(uuid) from public, anon;
grant execute on function public.get_lesson_resources(uuid) to authenticated;
