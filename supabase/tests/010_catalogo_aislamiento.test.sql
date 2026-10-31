begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select extensions.plan(7);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000101', 'catalogo-a@test.local'),
  ('10000000-0000-4000-8000-000000000102', 'catalogo-b@test.local');

insert into public.tenants (id, slug, name)
values
  ('20000000-0000-4000-8000-000000000101', 'catalogo-a', 'Catálogo A'),
  ('20000000-0000-4000-8000-000000000102', 'catalogo-b', 'Catálogo B');

insert into public.tenant_members (tenant_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000101', 'owner'
  ),
  (
    '20000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000102', 'owner'
  );

insert into public.courses (id, tenant_id, slug, created_by)
values
  (
    '30000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000101',
    'curso-a', '10000000-0000-4000-8000-000000000101'
  ),
  (
    '30000000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-000000000102',
    'curso-b', '10000000-0000-4000-8000-000000000102'
  );

insert into public.course_versions (
  id, course_id, tenant_id, version_number, title
)
values
  (
    '40000000-0000-4000-8000-000000000101',
    '30000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000101', 1, 'Versión A'
  ),
  (
    '40000000-0000-4000-8000-000000000102',
    '30000000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-000000000102', 1, 'Versión B'
  );

insert into public.modules (id, version_id, tenant_id, title, position)
values (
  '50000000-0000-4000-8000-000000000102',
  '40000000-0000-4000-8000-000000000102',
  '20000000-0000-4000-8000-000000000102', 'Módulo B', 1
);

insert into public.lessons (
  id, module_id, version_id, tenant_id, type, title, position
)
values (
  '60000000-0000-4000-8000-000000000102',
  '50000000-0000-4000-8000-000000000102',
  '40000000-0000-4000-8000-000000000102',
  '20000000-0000-4000-8000-000000000102',
  'reading', 'Lección B', 1
);

select extensions.throws_ok(
  $sql$
    insert into public.modules (version_id, tenant_id, title, position)
    values (
      '40000000-0000-4000-8000-000000000102',
      '20000000-0000-4000-8000-000000000101',
      'Cruce', 2
    )
  $sql$,
  '23503', null, 'Un módulo no puede apuntar a otra escuela'
);

select extensions.throws_ok(
  $sql$
    insert into public.lessons (
      module_id, version_id, tenant_id, type, title, position
    )
    values (
      '50000000-0000-4000-8000-000000000102',
      '40000000-0000-4000-8000-000000000101',
      '20000000-0000-4000-8000-000000000101',
      'reading', 'Cruce', 2
    )
  $sql$,
  '23503', null, 'Una lección no puede mezclar módulo y versión'
);

select extensions.throws_ok(
  $sql$
    insert into public.lesson_resources (
      lesson_id, version_id, tenant_id, name, storage_path, kind
    )
    values (
      '60000000-0000-4000-8000-000000000102',
      '40000000-0000-4000-8000-000000000101',
      '20000000-0000-4000-8000-000000000101',
      'Cruce', 'cruce.pdf', 'pdf'
    )
  $sql$,
  '23503', null, 'Un recurso no puede mezclar lección y versión'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000101';

select extensions.is(
  (select count(*) from public.courses),
  1::bigint, 'El dueño A ve solo su curso'
);
select extensions.is(
  (select count(*) from public.course_versions),
  1::bigint, 'El dueño A ve solo su versión'
);
select extensions.is(
  (select count(*) from public.modules),
  0::bigint, 'El dueño A no ve los módulos de B'
);
select extensions.is(
  (select count(*) from public.lessons),
  0::bigint, 'El dueño A no ve las lecciones de B'
);

reset role;
select extensions.finish();
rollback;
