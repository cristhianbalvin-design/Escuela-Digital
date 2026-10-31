begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon;

select extensions.plan(6);

insert into public.tenants (id, slug, name, status)
values
  (
    '20000000-0000-4000-8000-000000000021',
    'marca-publica',
    'Escuela pública',
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000022',
    'marca-suspendida',
    'Escuela suspendida',
    'suspended'
  );

insert into public.tenant_domains (
  tenant_id, host, verified, is_primary
)
values
  (
    '20000000-0000-4000-8000-000000000021',
    'marca.rls.test', true, true
  ),
  (
    '20000000-0000-4000-8000-000000000021',
    'pendiente.rls.test', false, false
  ),
  (
    '20000000-0000-4000-8000-000000000022',
    'suspendida.rls.test', true, true
  );

set local role anon;
set local request.jwt.claim.sub = '';

select extensions.is(
  (
    select b.name
    from public.get_tenant_branding('  MARCA.RLS.TEST.  ') b
  ),
  'Escuela pública',
  'Anon recibe la marca con host normalizado'
);

select extensions.is(
  (
    select count(*)
    from public.get_tenant_branding('pendiente.rls.test')
  ),
  0::bigint,
  'Anon no recibe marcas de dominios sin verificar'
);

select extensions.is(
  (
    select count(*)
    from public.get_tenant_branding('suspendida.rls.test')
  ),
  0::bigint,
  'Anon no recibe marcas de escuelas suspendidas'
);

select extensions.throws_ok(
  'select count(*) from public.tenants',
  '42501', null,
  'Anon no puede leer tablas públicas'
);

select extensions.throws_ok(
  'select count(*) from public.tenant_domains',
  '42501', null,
  'Anon no puede leer dominios directamente'
);

select extensions.throws_ok(
  'select count(*) from public.list_my_tenants()',
  '42501', null,
  'Anon no puede ejecutar el selector privado'
);

reset role;
select extensions.finish();

rollback;
