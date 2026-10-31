revoke all on public.offerings, public.offering_instructors,
  public.enrollments
  from public, anon, authenticated;

grant select on public.offerings, public.offering_instructors,
  public.enrollments
  to authenticated;

-- El alta de edición y matrícula pasa por RPC. La asignación de docentes
-- queda limitada por RLS a administradores y operadores.
grant update (
  title, code, status, modality, starts_at, ends_at, seats,
  enrollment_mode, join_code, release_schedule, completion_rules,
  issuer_mode, certificate_template_id, timezone, version_id, deleted_at
) on public.offerings to authenticated;

grant insert (offering_id, user_id, tenant_id, role)
  on public.offering_instructors to authenticated;
grant update (role)
  on public.offering_instructors to authenticated;
grant delete on public.offering_instructors to authenticated;

grant all on public.offerings, public.offering_instructors,
  public.enrollments
  to service_role;

alter table public.offerings enable row level security;
alter table public.offering_instructors enable row level security;
alter table public.enrollments enable row level security;

create policy offerings_select on public.offerings
  for select to authenticated
  using (app.can_read_offering(offerings.id));

create policy offerings_update on public.offerings
  for update to authenticated
  using (app.can_manage_offering(offerings.id))
  with check (app.can_manage_offering(offerings.id));

create policy offering_instructors_select
  on public.offering_instructors
  for select to authenticated
  using (
    app.can_manage_offering(offering_instructors.offering_id)
  );

create policy offering_instructors_insert
  on public.offering_instructors
  for insert to authenticated
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      offering_instructors.tenant_id,
      array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy offering_instructors_update
  on public.offering_instructors
  for update to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      offering_instructors.tenant_id,
      array['owner', 'admin']::public.tenant_role[]
    )
  )
  with check (
    app.is_platform_admin()
    or app.has_tenant_role(
      offering_instructors.tenant_id,
      array['owner', 'admin']::public.tenant_role[]
    )
  );

create policy offering_instructors_delete
  on public.offering_instructors
  for delete to authenticated
  using (
    app.is_platform_admin()
    or app.has_tenant_role(
      offering_instructors.tenant_id,
      array['owner', 'admin']::public.tenant_role[]
    )
  );

-- No hay políticas INSERT, UPDATE ni DELETE para matrículas: las
-- escrituras se hacen mediante las RPC que comprueban las transiciones.
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (
    app.can_manage_offering(enrollments.offering_id)
    or app.is_client_coordinator(enrollments.client_id)
    or (
      enrollments.user_id = (select auth.uid())
      and app.has_tenant_role(
        enrollments.tenant_id,
        array['student']::public.tenant_role[]
      )
    )
  );

-- Estas políticas se combinan con OR con las políticas SELECT del
-- catálogo. El acceso a versiones y contenido exige la versión exacta.
create policy courses_teaching_select on public.courses
  for select to authenticated
  using (
    exists (
      select 1
      from public.offerings o
      where o.tenant_id = courses.tenant_id
        and o.course_id = courses.id
        and app.teaches_offering_version(
          o.tenant_id, o.course_id, o.version_id
        )
    )
  );

create policy course_versions_teaching_select
  on public.course_versions
  for select to authenticated
  using (
    app.teaches_offering_version(
      course_versions.tenant_id,
      course_versions.course_id,
      course_versions.id
    )
  );

create policy modules_teaching_select on public.modules
  for select to authenticated
  using (
    exists (
      select 1
      from public.offerings o
      where o.tenant_id = modules.tenant_id
        and o.version_id = modules.version_id
        and app.teaches_offering_version(
          o.tenant_id, o.course_id, o.version_id
        )
    )
  );

create policy lessons_teaching_select on public.lessons
  for select to authenticated
  using (
    exists (
      select 1
      from public.offerings o
      where o.tenant_id = lessons.tenant_id
        and o.version_id = lessons.version_id
        and app.teaches_offering_version(
          o.tenant_id, o.course_id, o.version_id
        )
    )
  );

create policy lesson_resources_teaching_select
  on public.lesson_resources
  for select to authenticated
  using (
    exists (
      select 1
      from public.offerings o
      where o.tenant_id = lesson_resources.tenant_id
        and o.version_id = lesson_resources.version_id
        and app.teaches_offering_version(
          o.tenant_id, o.course_id, o.version_id
        )
    )
  );
