begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;

select extensions.plan(16);

-- Los usuarios y datos de prueba se revierten al terminar.
insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'owner-a@rls.test'),
  ('10000000-0000-4000-8000-000000000002', 'owner-b@rls.test'),
  ('10000000-0000-4000-8000-000000000003', 'coord-a@rls.test'),
  ('10000000-0000-4000-8000-000000000004', 'guest-a@rls.test');

insert into public.tenants (id, slug, name)
values
  ('20000000-0000-4000-8000-000000000001', 'aislamiento-a', 'Escuela A'),
  ('20000000-0000-4000-8000-000000000002', 'aislamiento-b', 'Escuela B');

insert into public.tenant_domains (
  tenant_id, host, verified, is_primary
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'a.rls.test', true, true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'b.rls.test', true, true
  );

insert into public.tenant_members (tenant_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'owner'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'client_coordinator'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    'instructor_guest'
  );

insert into public.clients (id, tenant_id, name, slug)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Cliente A1', 'cliente-a1'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Cliente A2', 'cliente-a2'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'Cliente B1', 'cliente-b1'
  );

insert into public.client_members (
  tenant_id, client_id, user_id, role
)
values (
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'coordinator'
);

insert into public.invitations (
  tenant_id, email, role, token_hash, expires_at
)
values (
  '20000000-0000-4000-8000-000000000001',
  'invitado@rls.test',
  'student',
  decode(repeat('ab', 32), 'hex'),
  now() + interval '7 days'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select extensions.is(
  (select count(*) from public.tenants), 1::bigint,
  'El dueño A solo ve su escuela'
);
select extensions.is(
  (select count(*) from public.clients), 2::bigint,
  'El dueño A no ve clientes de B'
);
select extensions.is(
  (select count(*) from public.tenant_domains), 1::bigint,
  'El dueño A solo ve sus dominios'
);
select extensions.is(
  (select count(*) from public.invitations), 1::bigint,
  'El dueño A ve sus invitaciones'
);
select extensions.is(
  (select count(*) from public.list_my_tenants()), 1::bigint,
  'El selector del dueño A solo devuelve A'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select extensions.is(
  (select count(*) from public.tenants), 1::bigint,
  'El dueño B solo ve su escuela'
);
select extensions.is(
  (select count(*) from public.clients), 1::bigint,
  'El dueño B solo ve su cliente'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';

select extensions.is(
  (select count(*) from public.clients), 1::bigint,
  'El coordinador solo ve Cliente A1'
);
select extensions.is(
  (select count(*) from public.client_members), 1::bigint,
  'El coordinador solo ve membresías de Cliente A1'
);
select extensions.is(
  (select count(*) from public.tenants), 0::bigint,
  'El coordinador no lee configuración de escuelas'
);
select extensions.is_empty(
  $sql$update public.clients
       set name = 'Cambio indebido'
       where id = '30000000-0000-4000-8000-000000000001'
       returning id$sql$,
  'El coordinador no puede modificar su cliente'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';

select extensions.is(
  (select count(*) from public.tenant_members), 0::bigint,
  'El docente invitado no lee miembros'
);
select extensions.is(
  (select count(*) from public.clients), 0::bigint,
  'El docente invitado no lee clientes'
);
select extensions.is(
  (select count(*) from public.invitations), 0::bigint,
  'El docente invitado no lee invitaciones'
);
select extensions.is(
  (select count(*) from public.tenants), 0::bigint,
  'El docente invitado no lee configuración'
);
select extensions.is(
  (select count(*) from public.tenant_domains), 0::bigint,
  'El docente invitado no lee dominios'
);

reset role;
select extensions.finish();

rollback;
