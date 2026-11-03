-- Edición de contenido en una versión publicada, sin crear una versión nueva.
-- Permitido solo mientras alguna edición de la versión siga activa (borrador, abierta o en curso),
-- o si la versión aún no tiene ediciones. No cambia la estructura (módulos, orden, altas y bajas
-- de lecciones) para no afectar progreso ni notas.
create function app.version_content_editable(p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_versions cv
    where cv.id = p_version_id and cv.status = 'published'
  ) and (
    not exists (
      select 1 from public.offerings o
      where o.version_id = p_version_id and o.deleted_at is null)
    or exists (
      select 1 from public.offerings o
      where o.version_id = p_version_id and o.deleted_at is null
        and o.status in ('draft', 'open', 'running'))
  );
$$;
revoke all on function app.version_content_editable(uuid) from public, anon, authenticated;
grant execute on function app.version_content_editable(uuid) to authenticated;

create or replace function app.guard_catalog_child()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_status public.course_version_status;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'modules' then
      if new.id is distinct from old.id
         or new.version_id is distinct from old.version_id
         or new.tenant_id is distinct from old.tenant_id then
        raise exception 'No se puede mover un módulo entre versiones'
          using errcode = '23514';
      end if;
    elsif tg_table_name = 'lessons' then
      if new.id is distinct from old.id
         or new.module_id is distinct from old.module_id
         or new.version_id is distinct from old.version_id
         or new.tenant_id is distinct from old.tenant_id then
        raise exception 'No se puede mover una lección entre módulos o versiones'
          using errcode = '23514';
      end if;
    elsif tg_table_name = 'lesson_resources' then
      if new.id is distinct from old.id
         or new.lesson_id is distinct from old.lesson_id
         or new.version_id is distinct from old.version_id
         or new.tenant_id is distinct from old.tenant_id then
        raise exception 'No se puede mover un recurso entre lecciones o versiones'
          using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_version_id := old.version_id;
  else
    v_version_id := new.version_id;
  end if;

  select cv.status
    into v_status
  from public.course_versions cv
  where cv.id = v_version_id
  for share;

  -- Versión publicada con ediciones activas: solo adjuntos y texto/título de las lecciones.
  if v_status = 'published'::public.course_version_status
     and app.version_content_editable(v_version_id) then
    if tg_table_name = 'lesson_resources' then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
    if tg_table_name = 'lessons' and tg_op = 'UPDATE'
       and (to_jsonb(new) - 'title' - 'content' - 'est_minutes')
           is not distinct from (to_jsonb(old) - 'title' - 'content' - 'est_minutes')
       and (new.type = 'reading'::public.lesson_type
            or new.content is not distinct from old.content) then
      return new;
    end if;
  end if;

  if v_status is distinct from 'draft'::public.course_version_status then
    raise exception 'El contenido solo puede cambiar en una versión borrador'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Políticas: además del borrador, la versión publicada con ediciones activas.
drop policy lessons_update on public.lessons;
create policy lessons_update on public.lessons
  for update to authenticated
  using (
    exists (
      select 1 from public.course_versions cv
      where cv.id = version_id
        and (cv.status = 'draft' or app.version_content_editable(cv.id))
        and app.can_edit_course(cv.course_id)))
  with check (
    exists (
      select 1 from public.course_versions cv
      where cv.id = version_id
        and (cv.status = 'draft' or app.version_content_editable(cv.id))
        and app.can_edit_course(cv.course_id)));

drop policy lesson_resources_insert on public.lesson_resources;
drop policy lesson_resources_update on public.lesson_resources;
drop policy lesson_resources_delete on public.lesson_resources;
create policy lesson_resources_insert on public.lesson_resources
  for insert to authenticated
  with check (
    exists (
      select 1 from public.course_versions cv
      where cv.id = version_id
        and (cv.status = 'draft' or app.version_content_editable(cv.id))
        and app.can_edit_course(cv.course_id)));
create policy lesson_resources_update on public.lesson_resources
  for update to authenticated
  using (
    exists (
      select 1 from public.course_versions cv
      where cv.id = version_id
        and (cv.status = 'draft' or app.version_content_editable(cv.id))
        and app.can_edit_course(cv.course_id)))
  with check (
    exists (
      select 1 from public.course_versions cv
      where cv.id = version_id
        and (cv.status = 'draft' or app.version_content_editable(cv.id))
        and app.can_edit_course(cv.course_id)));
create policy lesson_resources_delete on public.lesson_resources
  for delete to authenticated
  using (
    exists (
      select 1 from public.course_versions cv
      where cv.id = version_id
        and (cv.status = 'draft' or app.version_content_editable(cv.id))
        and app.can_edit_course(cv.course_id)));

-- Archivos: subir/borrar también en versión publicada con ediciones activas.
create or replace function app.can_edit_lesson_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 3) <> '' and exists (
    select 1
    from public.lessons l
    join public.course_versions cv on cv.id = l.version_id
    where l.id::text = split_part(p_name, '/', 2)
      and l.tenant_id::text = split_part(p_name, '/', 1)
      and (cv.status = 'draft' or app.version_content_editable(cv.id))
      and app.can_edit_course(cv.course_id));
$$;
