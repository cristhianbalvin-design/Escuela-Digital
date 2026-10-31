begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select extensions.plan(10);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000201', 'owner-a@ediciones.test'),
  ('10000000-0000-4000-8000-000000000202', 'owner-b@ediciones.test'),
  ('10000000-0000-4000-8000-000000000203', 'student-a@ediciones.test'),
  ('10000000-0000-4000-8000-000000000204', 'student-b@ediciones.test');

insert into public.tenants (id, slug, name)
values
  ('20000000-0000-4000-8000-000000000201', 'ediciones-a', 'Escuela A'),
  ('20000000-0000-4000-8000-000000000202', 'ediciones-b', 'Escuela B');

insert into public.tenant_members (tenant_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000201',
   '10000000-0000-4000-8000-000000000201', 'owner'),
  ('20000000-0000-4000-8000-000000000202',
   '10000000-0000-4000-8000-000000000202', 'owner'),
  ('20000000-0000-4000-8000-000000000201',
   '10000000-0000-4000-8000-000000000203', 'student'),
  ('20000000-0000-4000-8000-000000000202',
   '10000000-0000-4000-8000-000000000204', 'student');

insert into public.clients (id, tenant_id, name, slug)
values
  ('30000000-0000-4000-8000-000000000201',
   '20000000-0000-4000-8000-000000000201', 'Cliente A', 'cliente-a'),
  ('30000000-0000-4000-8000-000000000202',
   '20000000-0000-4000-8000-000000000202', 'Cliente B', 'cliente-b');

insert into public.client_members (tenant_id, client_id, user_id)
values
  ('20000000-0000-4000-8000-000000000201',
   '30000000-0000-4000-8000-000000000201',
   '10000000-0000-4000-8000-000000000203'),
  ('20000000-0000-4000-8000-000000000202',
   '30000000-0000-4000-8000-000000000202',
   '10000000-0000-4000-8000-000000000204');

insert into public.courses (id, tenant_id, slug, created_by)
values
  ('40000000-0000-4000-8000-000000000201',
   '20000000-0000-4000-8000-000000000201', 'curso-a',
   '10000000-0000-4000-8000-000000000201'),
  ('40000000-0000-4000-8000-000000000202',
   '20000000-0000-4000-8000-000000000202', 'curso-b',
   '10000000-0000-4000-8000-000000000202');

insert into public.course_versions (
  id, tenant_id, course_id, version_number, title
)
values
  ('50000000-0000-4000-8000-000000000201',
   '20000000-0000-4000-8000-000000000201',
   '40000000-0000-4000-8000-000000000201', 1, 'Versión A'),
  ('50000000-0000-4000-8000-000000000202',
   '20000000-0000-4000-8000-000000000202',
   '40000000-0000-4000-8000-000000000202', 1, 'Versión B');

select extensions.throws_ok(
  $sql$
    insert into public.offerings (
      tenant_id, client_id, course_id, version_id, title, code,
      modality, enrollment_mode, created_by
    )
    values (
      '20000000-0000-4000-8000-000000000201',
      '30000000-0000-4000-8000-000000000201',
      '40000000-0000-4000-8000-000000000201',
      '50000000-0000-4000-8000-000000000201',
      'Borrador', 'BORRADOR', 'live', 'invite',
      '10000000-0000-4000-8000-000000000201'
    )
  $sql$,
  '23514', null, 'No se usa una versión sin publicar'
);

insert into public.modules (id, tenant_id, version_id, title, position)
values
  ('60000000-0000-4000-8000-000000000201',
   '20000000-0000-4000-8000-000000000201',
   '50000000-0000-4000-8000-000000000201', 'Módulo A', 1),
  ('60000000-0000-4000-8000-000000000202',
   '20000000-0000-4000-8000-000000000202',
   '50000000-0000-4000-8000-000000000202', 'Módulo B', 1);

insert into public.lessons (
  tenant_id, version_id, module_id, type, title, position
)
values
  ('20000000-0000-4000-8000-000000000201',
   '50000000-0000-4000-8000-000000000201',
   '60000000-0000-4000-8000-000000000201', 'reading', 'Lección A', 1),
  ('20000000-0000-4000-8000-000000000202',
   '50000000-0000-4000-8000-000000000202',
   '60000000-0000-4000-8000-000000000202', 'reading', 'Lección B', 1);

set local role authenticated;
set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000201';

select extensions.lives_ok(
  $sql$
    select public.publish_version(
      '50000000-0000-4000-8000-000000000201'
    )
  $sql$,
  'Se publica la versión A'
);

set local request.jwt.claim.sub =
  '10000000-0000-4000-8000-000000000202';

select extensions.lives_ok(
  $sql$
    select public.publish_version(
      '50000000-0000-4000-8000-000000000202'
    )
  $sql$,
  'Se publica la versión B'
);

reset role;

select extensions.throws_ok(
  $sql$
    insert into public.offerings (
      tenant_id, client_id, course_id, version_id, title, code,
      modality, enrollment_mode, created_by
    )
    values (
      '20000000-0000-4000-8000-000000000201',
      '30000000-0000-4000-8000-000000000202',
      '40000000-0000-4000-8000-000000000201',
      '50000000-0000-4000-8000-000000000201',
      'Cruce', 'CRUCE-CLIENTE', 'live', 'invite',
      '10000000-0000-4000-8000-000000000201'
    )
  $sql$,
  '23503', null, 'La FK impide un cliente de otra escuela'
);

select extensions.throws_ok(
  $sql$
    insert into public.offerings (
      tenant_id, client_id, course_id, version_id, title, code,
      modality, enrollment_mode, created_by
    )
    values (
      '20000000-0000-4000-8000-000000000201',
      '30000000-0000-4000-8000-000000000201',
      '40000000-0000-4000-8000-000000000201',
      '50000000-0000-4000-8000-000000000202',
      'Cruce', 'CRUCE-VERSION', 'live', 'invite',
      '10000000-0000-4000-8000-000000000201'
    )
  $sql$,
  '23514', null, 'El guard rechaza una versión de otra escuela'
);

insert into public.offerings (
  id, tenant_id, client_id, course_id, version_id, title, code,
  modality, enrollment_mode, created_by, status
)
values (
  '70000000-0000-4000-8000-000000000201',
  '20000000-0000-4000-8000-000000000201',
  '30000000-0000-4000-8000-000000000201',
  '40000000-0000-4000-8000-000000000201',
  '50000000-0000-4000-8000-000000000201',
  'Edición A', 'ED-A', 'live', 'invite',
  '10000000-0000-4000-8000-000000000201', 'open'
);

select extensions.throws_ok(
  $sql$
    insert into public.enrollments (
      tenant_id, client_id, offering_id, user_id
    )
    values (
      '20000000-0000-4000-8000-000000000201',
      '30000000-0000-4000-8000-000000000202',
      '70000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000203'
    )
  $sql$,
  '23503', null, 'La matrícula no puede cambiar el cliente de la edición'
);

select extensions.throws_ok(
  $sql$
    insert into public.enrollments (
      tenant_id, client_id, offering_id, user_id
    )
    values (
      '20000000-0000-4000-8000-000000000201',
      '30000000-0000-4000-8000-000000000201',
      '70000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000204'
    )
  $sql$,
  '23514', null, 'La matrícula rechaza un estudiante de otra escuela'
);

insert into public.enrollments (
  tenant_id, client_id, offering_id, user_id
)
values (
  '20000000-0000-4000-8000-000000000201',
  '30000000-0000-4000-8000-000000000201',
  '70000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000203'
);

select extensions.throws_ok(
  $sql$
    update public.offerings
    set deleted_at = now()
    where id = '70000000-0000-4000-8000-000000000201'
  $sql$,
  '23514', null, 'Una edición matriculada no se borra lógicamente'
);

select extensions.throws_ok(
  $sql$
    delete from public.offerings
    where id = '70000000-0000-4000-8000-000000000201'
  $sql$,
  '23514', null, 'Una edición matriculada no se borra físicamente'
);

select extensions.is(
  (
    select count(*)
    from public.enrollments e
    where e.offering_id =
      '70000000-0000-4000-8000-000000000201'
  ),
  1::bigint, 'La matrícula válida permanece'
);

select extensions.finish();
rollback;
