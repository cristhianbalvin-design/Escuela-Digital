-- El bloqueo compartido serializa la edición de contenido con la publicación.
-- También se prohíbe mover una fila a otra versión mediante sus claves.
create function app.guard_catalog_child()
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

create function app.guard_course_version()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft'
       or new.published_at is not null
       or new.published_by is not null then
      raise exception 'Una versión nueva debe ser un borrador'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'No se puede borrar una versión publicada o retirada'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.course_id is distinct from old.course_id
     or new.tenant_id is distinct from old.tenant_id
     or new.version_number is distinct from old.version_number
     or new.source_version_id is distinct from old.source_version_id
     or new.source_tenant_id is distinct from old.source_tenant_id
     or new.created_at is distinct from old.created_at then
    raise exception 'La identidad y procedencia de la versión son inmutables'
      using errcode = '23514';
  end if;

  if old.status = 'retired' then
    raise exception 'Una versión retirada es inmutable'
      using errcode = '23514';
  end if;

  if old.status = 'published' then
    if new.status <> 'retired'
       or (to_jsonb(new) - 'status' - 'updated_at')
          is distinct from
          (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'Una versión publicada solo puede pasar a retirada'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'draft' then
    if new.published_at is not null or new.published_by is not null then
      raise exception 'Un borrador no puede tener datos de publicación'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'published'
     and new.published_at is not null
     and new.published_by = (select auth.uid()) then
    return new;
  end if;

  raise exception 'Transición de estado de versión no permitida'
    using errcode = '23514';
end;
$$;

create trigger course_versions_guard
  before insert or update or delete on public.course_versions
  for each row execute function app.guard_course_version();

create trigger modules_guard
  before insert or update or delete on public.modules
  for each row execute function app.guard_catalog_child();
create trigger lessons_guard
  before insert or update or delete on public.lessons
  for each row execute function app.guard_catalog_child();
create trigger lesson_resources_guard
  before insert or update or delete on public.lesson_resources
  for each row execute function app.guard_catalog_child();

revoke all on function app.guard_catalog_child()
  from public, anon, authenticated;
revoke all on function app.guard_course_version()
  from public, anon, authenticated;
