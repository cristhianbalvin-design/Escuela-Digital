-- El navegador recibe solo las columnas y operaciones necesarias.
revoke all on public.courses, public.course_collaborators,
  public.course_versions, public.modules, public.lessons,
  public.lesson_resources
  from public, anon, authenticated;

grant select on public.courses, public.course_collaborators,
  public.course_versions, public.modules, public.lessons,
  public.lesson_resources
  to authenticated;

-- Alta de curso, alta de versión y publicación pasan exclusivamente por RPC.
grant update (slug, category, level, language, cover_path)
  on public.courses to authenticated;
grant update (title, summary, hours, completion_defaults)
  on public.course_versions to authenticated;

-- Solo las políticas de administradores permiten gestionar colaboradores.
grant insert (tenant_id, course_id, user_id, role)
  on public.course_collaborators to authenticated;
grant update (role)
  on public.course_collaborators to authenticated;
grant delete on public.course_collaborators to authenticated;

grant insert (version_id, tenant_id, title, position)
  on public.modules to authenticated;
grant update (title, position)
  on public.modules to authenticated;
grant delete on public.modules to authenticated;

grant insert (
  module_id, version_id, tenant_id, type, title, position,
  is_required, est_minutes, content
) on public.lessons to authenticated;
grant update (
  type, title, position, is_required, est_minutes, content
) on public.lessons to authenticated;
grant delete on public.lessons to authenticated;

grant insert (
  lesson_id, version_id, tenant_id, name, storage_path, kind, size_bytes
) on public.lesson_resources to authenticated;
grant update (name, storage_path, kind, size_bytes)
  on public.lesson_resources to authenticated;
grant delete on public.lesson_resources to authenticated;

grant all on public.courses, public.course_collaborators,
  public.course_versions, public.modules, public.lessons,
  public.lesson_resources
  to service_role;

alter table public.courses enable row level security;
alter table public.course_collaborators enable row level security;
alter table public.course_versions enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_resources enable row level security;

create policy courses_select on public.courses
  for select to authenticated
  using (app.can_read_course(id));

create policy courses_update on public.courses
  for update to authenticated
  using (app.can_edit_course(id))
  with check (app.can_edit_course(id));

create policy course_collaborators_select on public.course_collaborators
  for select to authenticated
  using (app.can_read_course(course_id));

create policy course_collaborators_insert on public.course_collaborators
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy course_collaborators_update on public.course_collaborators
  for update to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  )
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy course_collaborators_delete on public.course_collaborators
  for delete to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      tenant_id, array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy course_versions_select on public.course_versions
  for select to authenticated
  using (app.can_read_course(course_id));

create policy course_versions_update on public.course_versions
  for update to authenticated
  using (status = 'draft' and app.can_edit_course(course_id))
  with check (status = 'draft' and app.can_edit_course(course_id));

create policy modules_select on public.modules
  for select to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and app.can_read_course(cv.course_id)
    )
  );

create policy modules_insert on public.modules
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy modules_update on public.modules
  for update to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  )
  with check (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy modules_delete on public.modules
  for delete to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy lessons_select on public.lessons
  for select to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and app.can_read_course(cv.course_id)
    )
  );

create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy lessons_update on public.lessons
  for update to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  )
  with check (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy lessons_delete on public.lessons
  for delete to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy lesson_resources_select on public.lesson_resources
  for select to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and app.can_read_course(cv.course_id)
    )
  );

create policy lesson_resources_insert on public.lesson_resources
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy lesson_resources_update on public.lesson_resources
  for update to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  )
  with check (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );

create policy lesson_resources_delete on public.lesson_resources
  for delete to authenticated
  using (
    exists (
      select 1
      from public.course_versions cv
      where cv.id = version_id
        and cv.status = 'draft'
        and app.can_edit_course(cv.course_id)
    )
  );
