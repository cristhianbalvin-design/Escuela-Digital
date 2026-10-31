begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select extensions.plan(15);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000211', 'admin@ediciones.test'),
  ('10000000-0000-4000-8000-000000000212', 'guest@ediciones.test'),
  ('10000000-0000-4000-8000-000000000213', 'coord@ediciones.test'),
  ('10000000-0000-4000-8000-000000000214', 'student1@ediciones.test'),
  ('10000000-0000-4000-8000-000000000215', 'student2@ediciones.test');

insert into public.tenants (id, slug, name)
values (
  '20000000-0000-4000-8000-000000000211',
  'ediciones-roles', 'Escuela roles'
);

insert into public.tenant_members (tenant_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000211', 'admin'),
  ('20000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000212', 'instructor_guest'),
  ('20000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000213', 'client_coordinator'),
  ('20000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000214', 'student'),
  ('20000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000215', 'student');

insert into public.clients (id, tenant_id, name, slug)
values
  ('30000000-0000-4000-8000-000000000211',
   '20000000-0000-4000-8000-000000000211', 'Cliente 1', 'cliente-1'),
  ('30000000-0000-4000-8000-000000000212',
   '20000000-0000-4000-8000-000000000211', 'Cliente 2', 'cliente-2');

insert into public.client_members (
  tenant_id, client_id, user_id, role
)
values
  ('20000000-0000-4000-8000-000000000211',
   '30000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000213', 'coordinator'),
  ('20000000-0000-4000-8000-000000000211',
   '30000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000214', 'member'),
  ('20000000-0000-4000-8000-000000000211',
   '30000000-0000-4000-8000-000000000211',
   '10000000-0000-4000-8000-000000000215', 'member');

insert into public.courses (id, tenant_id, slug, created_by)
values
  ('40000000-0000-4000-8000-000000000211',
   '20000000-0000-4000-8000-000000000211',
   'curso-asignado', '10000000-0000-4000-8000-000000000211'),
  ('40000000-0000-4000-8000-000000000212',
   '20000000-0000-4000-8000-000000000211',
   'curso-ajeno', '10000000-0000-4000-8000-000000000211');

insert into public.course_versions (
  id, tenant_id, course_id, version_number, title
)
values
  ('50000000-0000-4000-8000-000000000211',
   '20000000-0000-4000-8000-000000000211',
   '40000000-0000-4000-8000-000000000211', 1, 'V1'),
  ('50000000-0000-4000-8000-000000000212',
   '20000000-0000-4000-8000-000000000211',
   '40000000-0000-4000-8000-000000000212', 1, 'Otro curso');

insert into public.modules (id, tenant_id, version_id, title, position)
values
  ('60000000-0000-4000-8000-000000000211',
   '20000000-0000-4000-8000-000000000211',
   '50000000-0000-4000-8000-000000000211', 'Módulo V1', 1),
  ('60000000-0000-4000-8000-000000000212',
   '20000000-0000-4000-8000-000000000211',
   '50000000-0000-4000-8000-000000000212', 'Módulo ajeno', 1);

insert into public.lessons (
  id, tenant_id, version_id, module_id, type, title, position
)
values
  ('65000000-0000-4000-8000-000000000211',
   '20000000-0000-4000-8000-000000000211',
   '50000000-0000-4000-8000-000000000211',
   '60000000-0000-4000-8000-000000000211',
   'reading', 'Lección V1', 1),
  ('65000000-0000-4000-8000-000000000212',
   '20000000-0000-4000-8000-000000000211',
   '50000000-0000-4000-8000-000000000212',
   '60000000-0000-4000-8000-000000000212',
   'reading', 'Lección ajena', 1);

set local role authenticated;
set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000211';

select extensions.lives_ok(
  $sql$select public.publish_version(
    '50000000-0000-4000-8000-000000000211'
  )$sql$,
  'Se publica V1'
);
select extensions.lives_ok(
  $sql$select public.publish_version(
    '50000000-0000-4000-8000-000000000212'
  )$sql$,
  'Se publica el otro curso'
);

select public.create_offering(
  '20000000-0000-4000-8000-000000000211',
  '30000000-0000-4000-8000-000000000211',
  '50000000-0000-4000-8000-000000000211',
  'Edición de prueba', 'ED-ROLES', 'live',
  now() - interval '1 day', now() + interval '1 day',
  1, 'invite', 'America/Lima'
) as offering_id
\gset

update public.offerings
set status = 'open'
where id = :'offering_id';

insert into public.offering_instructors (
  offering_id, user_id, tenant_id, role
)
values (
  :'offering_id',
  '10000000-0000-4000-8000-000000000212',
  '20000000-0000-4000-8000-000000000211',
  'assistant'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000212';

select extensions.is(
  (select count(*) from public.course_versions),
  1::bigint, 'El invitado ve solo la versión asignada'
);
select extensions.is(
  (select count(*) from public.modules),
  1::bigint, 'El invitado ve solo el módulo asignado'
);
select extensions.is(
  (select count(*) from public.lessons),
  1::bigint, 'El invitado ve solo la lección asignada'
);
select extensions.is(
  (select count(*) from public.courses),
  1::bigint, 'El invitado no ve otros cursos'
);
select extensions.ok(
  app.can_manage_offering(:'offering_id'::uuid),
  'El ayudante asignado gestiona su edición'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000213';

select extensions.is(
  (select count(*) from public.offerings),
  1::bigint, 'El coordinador ve la edición de su cliente'
);
select extensions.is(
  (select count(*) from public.enrollments),
  0::bigint, 'Todavía no hay matrículas'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000211';

select public.enroll_user(
  :'offering_id'::uuid,
  '10000000-0000-4000-8000-000000000214'
) as enrollment_id
\gset

select extensions.is(
  public.enroll_user(
    :'offering_id'::uuid,
    '10000000-0000-4000-8000-000000000214'
  ),
  :'enrollment_id'::uuid, 'Matricular de nuevo es idempotente'
);

select extensions.throws_ok(
  format(
    'select public.enroll_user(%L::uuid, %L::uuid)',
    :'offering_id',
    '10000000-0000-4000-8000-000000000215'
  ),
  '23514', null, 'Con cupo uno se rechaza la segunda matrícula'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000214';

select extensions.is(
  (select count(*) from public.enrollments),
  1::bigint, 'El estudiante solo lee su matrícula'
);
select extensions.is(
  (select count(*) from public.lessons),
  0::bigint, 'El estudiante no lee lecciones directamente'
);
select extensions.throws_ok(
  format(
    'update public.enrollments set status = %L where id = %L::uuid',
    'active', :'enrollment_id'
  ),
  '42501', null, 'El estudiante no puede escribir su matrícula'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000213';

select extensions.is(
  (select count(*) from public.enrollments),
  1::bigint, 'El coordinador lee las matrículas de su cliente'
);

reset role;
select extensions.finish();
rollback;
