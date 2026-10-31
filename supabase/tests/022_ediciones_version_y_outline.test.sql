begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select extensions.plan(12);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000221', 'admin@outline.test'),
  ('10000000-0000-4000-8000-000000000222', 'student@outline.test'),
  ('10000000-0000-4000-8000-000000000223', 'outsider@outline.test');

insert into public.tenants (id, slug, name)
values (
  '20000000-0000-4000-8000-000000000221',
  'ediciones-outline', 'Escuela outline'
);

insert into public.tenant_members (tenant_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000221',
   '10000000-0000-4000-8000-000000000221', 'admin'),
  ('20000000-0000-4000-8000-000000000221',
   '10000000-0000-4000-8000-000000000222', 'student'),
  ('20000000-0000-4000-8000-000000000221',
   '10000000-0000-4000-8000-000000000223', 'student');

insert into public.clients (id, tenant_id, name, slug)
values (
  '30000000-0000-4000-8000-000000000221',
  '20000000-0000-4000-8000-000000000221',
  'Cliente outline', 'cliente-outline'
);

insert into public.client_members (tenant_id, client_id, user_id)
values (
  '20000000-0000-4000-8000-000000000221',
  '30000000-0000-4000-8000-000000000221',
  '10000000-0000-4000-8000-000000000222'
);

insert into public.courses (id, tenant_id, slug, created_by)
values (
  '40000000-0000-4000-8000-000000000221',
  '20000000-0000-4000-8000-000000000221',
  'curso-outline',
  '10000000-0000-4000-8000-000000000221'
);

insert into public.course_versions (
  id, tenant_id, course_id, version_number, title
)
values (
  '50000000-0000-4000-8000-000000000221',
  '20000000-0000-4000-8000-000000000221',
  '40000000-0000-4000-8000-000000000221',
  1, 'Versión 1'
);

insert into public.modules (
  id, tenant_id, version_id, title, position
)
values
  ('60000000-0000-4000-8000-000000000221',
   '20000000-0000-4000-8000-000000000221',
   '50000000-0000-4000-8000-000000000221', 'Inicial', 1),
  ('60000000-0000-4000-8000-000000000222',
   '20000000-0000-4000-8000-000000000221',
   '50000000-0000-4000-8000-000000000221', 'Programado', 2);

insert into public.lessons (
  tenant_id, version_id, module_id, type, title, position, content
)
values
  ('20000000-0000-4000-8000-000000000221',
   '50000000-0000-4000-8000-000000000221',
   '60000000-0000-4000-8000-000000000221',
   'reading', 'Lección inicial', 1, '{"secret":"inicial"}'),
  ('20000000-0000-4000-8000-000000000221',
   '50000000-0000-4000-8000-000000000221',
   '60000000-0000-4000-8000-000000000222',
   'reading', 'Lección programada', 1, '{"secret":"futuro"}');

set local role authenticated;
set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000221';

select extensions.lives_ok(
  $sql$select public.publish_version(
    '50000000-0000-4000-8000-000000000221'
  )$sql$,
  'Se publica la primera versión'
);

select public.create_offering(
  '20000000-0000-4000-8000-000000000221',
  '30000000-0000-4000-8000-000000000221',
  '50000000-0000-4000-8000-000000000221',
  'Edición futura', 'OUTLINE', 'self_paced',
  now() + interval '1 day', now() + interval '30 days',
  null, 'invite', 'America/Lima'
) as offering_id
\gset

update public.offerings
set status = 'open',
    release_schedule = jsonb_build_object(
      'modules',
      jsonb_build_object(
        '60000000-0000-4000-8000-000000000222',
        to_char(
          now() + interval '10 days',
          'YYYY-MM-DD"T"HH24:MI:SSOF'
        )
      )
    )
where id = :'offering_id';

select public.enroll_user(
  :'offering_id'::uuid,
  '10000000-0000-4000-8000-000000000222'
) as enrollment_id
\gset

select public.set_enrollment_status(
  :'enrollment_id'::uuid, 'active'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000222';

select extensions.is(
  public.get_course_outline(:'offering_id'::uuid)
    -> 'modules' -> 0 ->> 'locked_reason',
  'not_started', 'Antes del inicio se indica not_started'
);
select extensions.ok(
  not (
    public.get_course_outline(:'offering_id'::uuid)
      -> 'modules' -> 0 -> 'lessons' -> 0
  ) ? 'content',
  'Antes del inicio no sale content'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000221';

select extensions.ok(
  (
    public.get_course_outline(:'offering_id'::uuid)
      -> 'modules' -> 0 -> 'lessons' -> 0
  ) ? 'content',
  'El gestor ve el contenido antes del inicio'
);

update public.offerings
set starts_at = now() - interval '1 day'
where id = :'offering_id';

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000222';

select extensions.is(
  public.get_course_outline(:'offering_id'::uuid)
    -> 'modules' -> 1 ->> 'locked_reason',
  'scheduled', 'El módulo futuro indica scheduled'
);
select extensions.ok(
  not (
    public.get_course_outline(:'offering_id'::uuid)
      -> 'modules' -> 1 -> 'lessons' -> 0
  ) ? 'content',
  'El módulo futuro no filtra content'
);
select extensions.ok(
  (
    public.get_course_outline(:'offering_id'::uuid)
      -> 'modules' -> 0 -> 'lessons' -> 0
  ) ? 'content',
  'El módulo sin fecha adicional ya está liberado'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000223';

select extensions.throws_ok(
  format(
    'select public.get_course_outline(%L::uuid)',
    :'offering_id'
  ),
  '42501', null, 'Sin matrícula válida se rechaza la consulta'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000221';

select public.create_draft_from_version(
  '50000000-0000-4000-8000-000000000221'
) as second_version_id
\gset

select extensions.lives_ok(
  format(
    'select public.publish_version(%L::uuid)',
    :'second_version_id'
  ),
  'La publicación de V2 no cambia la edición'
);

select extensions.is(
  (
    select o.version_id
    from public.offerings o
    where o.id = :'offering_id'
  ),
  '50000000-0000-4000-8000-000000000221'::uuid,
  'La edición sigue fijada a V1'
);

select extensions.throws_ok(
  format(
    'update public.offerings set version_id = %L::uuid where id = %L::uuid',
    :'second_version_id', :'offering_id'
  ),
  '23514', null, 'Fuera de draft no se cambia version_id'
);

select extensions.is(
  (
    select c.latest_published_version_id
    from public.courses c
    where c.id = '40000000-0000-4000-8000-000000000221'
  ),
  :'second_version_id'::uuid, 'El curso sí apunta a V2'
);

select extensions.finish();
rollback;
