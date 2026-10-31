-- Publicar cambia solo el puntero del curso. Las versiones publicadas
-- anteriores conservan su estado para las ediciones que las fijaron.
create function public.publish_version(p_version_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_tenant_id uuid;
  v_status public.course_version_status;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  select cv.course_id, cv.tenant_id
    into v_course_id, v_tenant_id
  from public.course_versions cv
  where cv.id = p_version_id;

  if v_course_id is null or not app.can_edit_course(v_course_id) then
    raise exception 'No se puede editar este curso'
      using errcode = '42501';
  end if;

  -- El curso serializa las RPC que cambian sus versiones o su puntero.
  perform 1
  from public.courses c
  where c.id = v_course_id
    and c.tenant_id = v_tenant_id
  for update;

  select cv.status
    into v_status
  from public.course_versions cv
  where cv.id = p_version_id
    and cv.course_id = v_course_id
    and cv.tenant_id = v_tenant_id
  for update;

  if v_status is distinct from 'draft'::public.course_version_status then
    raise exception 'Solo se puede publicar un borrador'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.modules m
    join public.lessons l
      on l.tenant_id = m.tenant_id
     and l.version_id = m.version_id
     and l.module_id = m.id
    where m.tenant_id = v_tenant_id
      and m.version_id = p_version_id
  ) then
    raise exception 'La versión necesita al menos un módulo con una lección'
      using errcode = '23514';
  end if;

  update public.course_versions cv
  set status = 'published',
      published_at = now(),
      published_by = (select auth.uid())
  where cv.id = p_version_id;

  update public.courses c
  set latest_published_version_id = p_version_id,
      status = 'active'
  where c.id = v_course_id
    and c.tenant_id = v_tenant_id;

  return p_version_id;
end;
$$;

-- La copia usa nuevos UUID para módulos, lecciones y recursos.
create function public.create_draft_from_version(p_version_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_source public.course_versions%rowtype;
  v_new_version_id uuid;
  v_new_module_id uuid;
  v_new_lesson_id uuid;
  v_next_number integer;
  v_module record;
  v_lesson record;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  select cv.id, cv.course_id, cv.tenant_id, cv.version_number,
         cv.status, cv.title, cv.summary, cv.hours,
         cv.completion_defaults, cv.published_at, cv.published_by,
         cv.source_version_id, cv.source_tenant_id,
         cv.created_at, cv.updated_at
    into v_source
  from public.course_versions cv
  where cv.id = p_version_id;

  if v_source.id is null
     or not app.can_edit_course(v_source.course_id) then
    raise exception 'No se puede editar este curso'
      using errcode = '42501';
  end if;

  if v_source.status not in ('published', 'retired') then
    raise exception 'La versión de origen debe estar publicada o retirada'
      using errcode = '23514';
  end if;

  perform 1
  from public.courses c
  where c.id = v_source.course_id
    and c.tenant_id = v_source.tenant_id
  for update;

  if exists (
    select 1
    from public.course_versions cv
    where cv.course_id = v_source.course_id
      and cv.status = 'draft'
  ) then
    raise exception 'El curso ya tiene un borrador'
      using errcode = '23505';
  end if;

  select coalesce(max(cv.version_number), 0) + 1
    into v_next_number
  from public.course_versions cv
  where cv.course_id = v_source.course_id;

  insert into public.course_versions (
    course_id, tenant_id, version_number, title, summary, hours,
    completion_defaults, source_version_id, source_tenant_id
  )
  values (
    v_source.course_id, v_source.tenant_id, v_next_number,
    v_source.title, v_source.summary, v_source.hours,
    v_source.completion_defaults, v_source.id, v_source.tenant_id
  )
  returning id into v_new_version_id;

  for v_module in
    select m.id, m.title, m.position
    from public.modules m
    where m.tenant_id = v_source.tenant_id
      and m.version_id = v_source.id
    order by m.position, m.id
  loop
    insert into public.modules (version_id, tenant_id, title, position)
    values (
      v_new_version_id, v_source.tenant_id,
      v_module.title, v_module.position
    )
    returning id into v_new_module_id;

    for v_lesson in
      select l.id, l.type, l.title, l.position, l.is_required,
             l.est_minutes, l.content
      from public.lessons l
      where l.tenant_id = v_source.tenant_id
        and l.version_id = v_source.id
        and l.module_id = v_module.id
      order by l.position, l.id
    loop
      insert into public.lessons (
        module_id, version_id, tenant_id, type, title, position,
        is_required, est_minutes, content
      )
      values (
        v_new_module_id, v_new_version_id, v_source.tenant_id,
        v_lesson.type, v_lesson.title, v_lesson.position,
        v_lesson.is_required, v_lesson.est_minutes, v_lesson.content
      )
      returning id into v_new_lesson_id;

      insert into public.lesson_resources (
        lesson_id, version_id, tenant_id, name, storage_path,
        kind, size_bytes
      )
      select
        v_new_lesson_id, v_new_version_id, v_source.tenant_id,
        r.name, r.storage_path, r.kind, r.size_bytes
      from public.lesson_resources r
      where r.tenant_id = v_source.tenant_id
        and r.version_id = v_source.id
        and r.lesson_id = v_lesson.id;
    end loop;
  end loop;

  return v_new_version_id;
end;
$$;

-- El tenant solicitado se comprueba contra una membresía activa.
-- El operador de plataforma conserva su alcance global.
create function public.create_course(
  p_tenant_id uuid,
  p_slug text,
  p_title text,
  p_category text,
  p_level text,
  p_language text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
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

  if not (
    app.is_platform_admin()
    or app.has_tenant_role(
      p_tenant_id,
      array['owner', 'admin', 'instructor']::public.tenant_role[]
    )
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = p_tenant_id
        and tm.user_id = (select auth.uid())
        and tm.status = 'active'
        and tm.role = 'instructor_guest'
        and tm.can_author
    )
  ) then
    raise exception 'No se permite crear cursos en esta escuela'
      using errcode = '42501';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'El título es obligatorio'
      using errcode = '23514';
  end if;

  insert into public.courses (
    tenant_id, slug, category, level, language, created_by
  )
  values (
    p_tenant_id, p_slug, p_category, p_level,
    coalesce(p_language, 'es'), (select auth.uid())
  )
  returning id into v_course_id;

  insert into public.course_versions (
    course_id, tenant_id, version_number, title
  )
  values (v_course_id, p_tenant_id, 1, btrim(p_title));

  return v_course_id;
end;
$$;

revoke all on function public.publish_version(uuid)
  from public, anon, authenticated;
revoke all on function public.create_draft_from_version(uuid)
  from public, anon, authenticated;
revoke all on function public.create_course(
  uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.publish_version(uuid)
  to authenticated;
grant execute on function public.create_draft_from_version(uuid)
  to authenticated;
grant execute on function public.create_course(
  uuid, text, text, text, text, text
) to authenticated;
