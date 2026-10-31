begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select extensions.plan(12);

insert into auth.users (id, email)
values (
  '10000000-0000-4000-8000-000000000121',
  'versiones@catalogo.test'
);

insert into public.tenants (id, slug, name)
values (
  '20000000-0000-4000-8000-000000000121',
  'catalogo-versiones', 'Versiones'
);

insert into public.tenant_members (tenant_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000121',
  '10000000-0000-4000-8000-000000000121', 'owner'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000121';

select extensions.lives_ok(
  $sql$
    select public.create_course(
      '20000000-0000-4000-8000-000000000121',
      'curso-versionado', 'Curso versionado',
      'Tecnología', 'Inicial', 'es'
    )
  $sql$,
  'La RPC crea el curso y el primer borrador'
);

select extensions.is(
  (
    select count(*)
    from public.course_versions cv
    where cv.course_id = (
      select c.id from public.courses c
      where c.slug = 'curso-versionado'
    )
  ),
  1::bigint, 'Se creó una sola versión'
);

select extensions.throws_ok(
  $sql$
    select public.publish_version(
      (select cv.id from public.course_versions cv
       where cv.status = 'draft')
    )
  $sql$,
  '23514', null, 'No se publica una versión vacía'
);

insert into public.modules (version_id, tenant_id, title, position)
select cv.id, cv.tenant_id, 'Módulo 1', 1
from public.course_versions cv
where cv.status = 'draft';

insert into public.lessons (
  module_id, version_id, tenant_id, type, title, position, content
)
select
  m.id, m.version_id, m.tenant_id,
  'reading', 'Lección 1', 1, '{"body":"contenido"}'::jsonb
from public.modules m;

insert into public.lesson_resources (
  lesson_id, version_id, tenant_id, name, storage_path, kind, size_bytes
)
select
  l.id, l.version_id, l.tenant_id,
  'Guía', 'material/guia.pdf', 'pdf', 123
from public.lessons l;

select extensions.lives_ok(
  $sql$
    select public.publish_version(
      (select cv.id from public.course_versions cv
       where cv.status = 'draft')
    )
  $sql$,
  'Se publica una versión con módulo y lección'
);

select extensions.is(
  (
    select cv.status::text
    from public.course_versions cv
    where cv.version_number = 1
  ),
  'published', 'La primera versión quedó publicada'
);

select extensions.throws_ok(
  $sql$
    update public.lessons
    set title = 'Cambio prohibido'
    where title = 'Lección 1'
  $sql$,
  '23514', null, 'Una lección publicada no se edita'
);

select extensions.lives_ok(
  $sql$
    select public.create_draft_from_version(
      (select cv.id from public.course_versions cv
       where cv.version_number = 1)
    )
  $sql$,
  'La RPC crea un borrador desde la versión publicada'
);

select extensions.is(
  (
    select count(*)
    from public.course_versions cv
    where cv.status = 'draft'
  ),
  1::bigint, 'Hay un solo borrador'
);

select extensions.is(
  (
    select cv.version_number
    from public.course_versions cv
    where cv.status = 'draft'
  ),
  2, 'El borrador recibe el número siguiente'
);

select extensions.ok(
  (
    select d.source_version_id = p.id
    from public.course_versions d
    join public.course_versions p
      on p.course_id = d.course_id
     and p.version_number = 1
    where d.version_number = 2
  ),
  'La copia registra su versión de origen'
);

select extensions.ok(
  (
    select count(*) = 2 and count(distinct m.id) = 2
    from public.modules m
  )
  and (
    select count(*) = 2 and count(distinct l.id) = 2
    from public.lessons l
  )
  and (
    select count(*) = 2 and count(distinct r.id) = 2
    from public.lesson_resources r
  ),
  'La copia profunda conserva contenido con nuevos UUID'
);

select extensions.lives_ok(
  $sql$
    update public.lessons
    set title = 'Lección revisada'
    where version_id = (
      select cv.id from public.course_versions cv
      where cv.status = 'draft'
    )
  $sql$,
  'La lección copiada sí se edita en el borrador'
);

select extensions.throws_ok(
  $sql$
    select public.create_draft_from_version(
      (select cv.id from public.course_versions cv
       where cv.version_number = 1)
    )
  $sql$,
  '23505', null, 'Se rechaza un segundo borrador'
);

reset role;
select extensions.finish();
rollback;
