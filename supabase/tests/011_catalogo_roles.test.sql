begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select extensions.plan(17);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000111', 'admin@catalogo.test'),
  ('10000000-0000-4000-8000-000000000112', 'autor@catalogo.test'),
  ('10000000-0000-4000-8000-000000000113', 'docente@catalogo.test'),
  ('10000000-0000-4000-8000-000000000114', 'viewer@catalogo.test'),
  ('10000000-0000-4000-8000-000000000115', 'editor@catalogo.test'),
  ('10000000-0000-4000-8000-000000000116', 'invitado-si@catalogo.test'),
  ('10000000-0000-4000-8000-000000000117', 'invitado-no@catalogo.test'),
  ('10000000-0000-4000-8000-000000000118', 'coordinador@catalogo.test'),
  ('10000000-0000-4000-8000-000000000119', 'estudiante@catalogo.test'),
  ('10000000-0000-4000-8000-000000000120', 'operador@catalogo.test');

insert into public.tenants (id, slug, name)
values (
  '20000000-0000-4000-8000-000000000111',
  'catalogo-roles', 'Escuela de roles'
);

insert into public.tenant_members (
  tenant_id, user_id, role, can_author
)
values
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000111', 'admin', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000112', 'instructor', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000113', 'instructor', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000114', 'instructor', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000115', 'instructor', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000116',
    'instructor_guest', true
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000117',
    'instructor_guest', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000118',
    'client_coordinator', false
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000119',
    'student', false
  );

insert into public.platform_admins (user_id)
values ('10000000-0000-4000-8000-000000000120');

insert into public.courses (id, tenant_id, slug, created_by)
values
  (
    '30000000-0000-4000-8000-000000000111',
    '20000000-0000-4000-8000-000000000111',
    'curso-propio', '10000000-0000-4000-8000-000000000112'
  ),
  (
    '30000000-0000-4000-8000-000000000112',
    '20000000-0000-4000-8000-000000000111',
    'curso-ajeno', '10000000-0000-4000-8000-000000000113'
  ),
  (
    '30000000-0000-4000-8000-000000000113',
    '20000000-0000-4000-8000-000000000111',
    'curso-invitado', '10000000-0000-4000-8000-000000000116'
  ),
  (
    '30000000-0000-4000-8000-000000000114',
    '20000000-0000-4000-8000-000000000111',
    'curso-invitado-sin-permiso',
    '10000000-0000-4000-8000-000000000117'
  );

insert into public.course_collaborators (
  tenant_id, course_id, user_id, role
)
values
  (
    '20000000-0000-4000-8000-000000000111',
    '30000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000114', 'viewer'
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '30000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000115', 'editor'
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '30000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000116', 'editor'
  ),
  (
    '20000000-0000-4000-8000-000000000111',
    '30000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000117', 'editor'
  );

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000111';
select extensions.ok(
  app.can_read_course('30000000-0000-4000-8000-000000000112'),
  'El administrador lee cursos ajenos'
);
select extensions.ok(
  app.can_edit_course('30000000-0000-4000-8000-000000000112'),
  'El administrador edita cursos ajenos'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000112';
select extensions.ok(
  app.can_edit_course('30000000-0000-4000-8000-000000000111'),
  'El docente edita su curso'
);
select extensions.ok(
  not app.can_read_course('30000000-0000-4000-8000-000000000112'),
  'El docente no lee un curso ajeno sin compartir'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000114';
select extensions.ok(
  app.can_read_course('30000000-0000-4000-8000-000000000111'),
  'El colaborador viewer lee'
);
select extensions.ok(
  not app.can_edit_course('30000000-0000-4000-8000-000000000111'),
  'El colaborador viewer no edita'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000115';
select extensions.ok(
  app.can_edit_course('30000000-0000-4000-8000-000000000111'),
  'El colaborador editor edita'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000116';
select extensions.ok(
  app.can_edit_course('30000000-0000-4000-8000-000000000113'),
  'El invitado con can_author edita su curso'
);
select extensions.ok(
  app.can_edit_course('30000000-0000-4000-8000-000000000111'),
  'El invitado con can_author edita uno compartido como editor'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000117';
select extensions.ok(
  not app.can_read_course('30000000-0000-4000-8000-000000000114'),
  'El invitado sin can_author no lee siquiera su curso'
);
select extensions.ok(
  not app.can_edit_course('30000000-0000-4000-8000-000000000111'),
  'El invitado sin can_author no edita aunque figure como editor'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000118';
select extensions.ok(
  not app.can_read_course('30000000-0000-4000-8000-000000000111'),
  'El coordinador no lee el catálogo'
);
select extensions.is(
  (select count(*) from public.courses),
  0::bigint, 'RLS oculta los cursos al coordinador'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000119';
select extensions.ok(
  not app.can_read_course('30000000-0000-4000-8000-000000000111'),
  'El estudiante no lee el catálogo'
);
select extensions.is(
  (select count(*) from public.courses),
  0::bigint, 'RLS oculta los cursos al estudiante'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000120';
select extensions.ok(
  app.can_edit_course('30000000-0000-4000-8000-000000000112'),
  'El operador de plataforma edita todo el catálogo'
);
select extensions.is(
  (select count(*) from public.courses),
  4::bigint, 'El operador ve todos los cursos'
);

reset role;
select extensions.finish();
rollback;
