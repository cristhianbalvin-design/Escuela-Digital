begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

insert into public.tenants (id, slug, name)
values
  ('20000000-0000-4000-8000-000000000011', 'prueba-a', 'Prueba A'),
  ('20000000-0000-4000-8000-000000000012', 'prueba-b', 'Prueba B');

select extensions.throws_ok(
  $sql$insert into public.tenants (slug, name)
       values ('www', 'Reservado')$sql$,
  '23514', null,
  'Se rechaza un slug reservado de escuela'
);

select extensions.throws_ok(
  $sql$insert into public.clients (tenant_id, slug, name)
       values (
         '20000000-0000-4000-8000-000000000011',
         'admin',
         'Reservado'
       )$sql$,
  '23514', null,
  'Se rechaza un slug reservado de cliente'
);

select extensions.throws_ok(
  $sql$insert into public.tenants (slug, name, primary_color)
       values ('color-primario', 'Color', '#12345G')$sql$,
  '23514', null,
  'Se rechaza un color primario inválido'
);

select extensions.throws_ok(
  $sql$insert into public.tenants (slug, name, secondary_color)
       values ('color-secundario', 'Color', '14B8A6')$sql$,
  '23514', null,
  'Se rechaza un color secundario inválido'
);

select extensions.throws_ok(
  $sql$insert into public.tenant_domains (tenant_id, host)
       values (
         '20000000-0000-4000-8000-000000000011',
         'MAYUSCULAS.example.test'
       )$sql$,
  '23514', null,
  'Se exige un host en minúsculas'
);

insert into public.tenant_domains (tenant_id, host)
values (
  '20000000-0000-4000-8000-000000000011',
  'unico.example.test'
);

select extensions.throws_ok(
  $sql$insert into public.tenant_domains (tenant_id, host)
       values (
         '20000000-0000-4000-8000-000000000012',
         'unico.example.test'
       )$sql$,
  '23505', null,
  'El host es único entre escuelas'
);

select extensions.finish();

rollback;
