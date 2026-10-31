-- Firmantes de certificados: lista por escuela, selección por edición y
-- congelado en el certificado al emitirlo.

create table public.certificate_signers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  title text not null default '' check (length(title) <= 160),
  signature_path text check (signature_path is null or length(signature_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index certificate_signers_tenant_idx on public.certificate_signers (tenant_id)
  where deleted_at is null;

create trigger certificate_signers_touch before update on public.certificate_signers
  for each row execute function app.touch_updated_at();

alter table public.certificate_signers enable row level security;
revoke all on public.certificate_signers from anon, authenticated;
grant select on public.certificate_signers to authenticated;
grant insert (tenant_id, full_name, title, signature_path) on public.certificate_signers to authenticated;
grant update (full_name, title, signature_path, deleted_at) on public.certificate_signers to authenticated;

create policy certificate_signers_select on public.certificate_signers
  for select to authenticated using (
    app.has_tenant_role(tenant_id, array['owner', 'admin', 'instructor']::public.tenant_role[])
    or app.is_platform_admin()
  );

create policy certificate_signers_insert on public.certificate_signers
  for insert to authenticated with check (
    app.has_tenant_role(tenant_id, array['owner', 'admin', 'instructor']::public.tenant_role[])
  );

create policy certificate_signers_update on public.certificate_signers
  for update to authenticated
  using (app.has_tenant_role(tenant_id, array['owner', 'admin', 'instructor']::public.tenant_role[]))
  with check (app.has_tenant_role(tenant_id, array['owner', 'admin', 'instructor']::public.tenant_role[]));

-- Edición: hasta 2 firmantes, en orden de aparición.
alter table public.offerings
  add column certificate_signer_ids uuid[] not null default '{}'::uuid[],
  add constraint offerings_certificate_signers_max check (cardinality(certificate_signer_ids) <= 2);

grant update (certificate_signer_ids) on public.offerings to authenticated;

create function app.validate_offering_signers()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_valid integer;
begin
  if cardinality(new.certificate_signer_ids) = 0 then
    return new;
  end if;
  if (select count(distinct x) from unnest(new.certificate_signer_ids) as x)
     <> cardinality(new.certificate_signer_ids) then
    raise exception 'Hay firmantes repetidos' using errcode = '22023';
  end if;
  select count(*) into v_valid
  from public.certificate_signers s
  where s.id = any (new.certificate_signer_ids)
    and s.tenant_id = new.tenant_id
    and s.deleted_at is null;
  if v_valid <> cardinality(new.certificate_signer_ids) then
    raise exception 'Algún firmante no existe o no pertenece a esta escuela' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger offerings_validate_signers
  before insert or update of certificate_signer_ids on public.offerings
  for each row execute function app.validate_offering_signers();

revoke all on function app.validate_offering_signers() from public, anon, authenticated;

-- Archivos de firma: bucket privado, ruta {tenant_id}/{signer_id}.png|jpg
create function app.can_manage_signature_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and app.has_tenant_role(
           split_part(p_name, '/', 1)::uuid,
           array['owner', 'admin', 'instructor']::public.tenant_role[]);
$$;

revoke all on function app.can_manage_signature_file(text) from public, anon;
grant execute on function app.can_manage_signature_file(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy signatures_select on storage.objects
  for select to authenticated using (
    bucket_id = 'signatures' and app.can_manage_signature_file(name)
  );
create policy signatures_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'signatures' and app.can_manage_signature_file(name)
  );
create policy signatures_update on storage.objects
  for update to authenticated
  using (bucket_id = 'signatures' and app.can_manage_signature_file(name))
  with check (bucket_id = 'signatures' and app.can_manage_signature_file(name));
create policy signatures_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'signatures' and app.can_manage_signature_file(name)
  );

-- Emisión: congela los firmantes de la edición en template_snapshot.signers.
create or replace function app.issue_certificate_core(p_enrollment_id uuid, p_actor uuid, p_check boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_t public.tenants%rowtype;
  v_c public.clients%rowtype;
  v_v public.course_versions%rowtype;
  v_status jsonb;
  v_instr uuid;
  v_issuers jsonb := '[]'::jsonb;
  v_signers jsonb;
  v_final numeric;
  v_id uuid;
  v_code text;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null then
    raise exception 'Matrícula no encontrada' using errcode = 'P0002';
  end if;
  select o.* into v_o from public.offerings o where o.id = v_e.offering_id and o.deleted_at is null;
  if v_o.id is null then
    raise exception 'Edición no disponible' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.certificates c
             where c.enrollment_id = p_enrollment_id and c.status in ('pending_render', 'issued')) then
    raise exception 'La matrícula ya tiene un certificado vigente' using errcode = '23505';
  end if;
  if p_check then
    v_status := app.completion_status(p_enrollment_id);
    if not (v_status ->> 'met')::boolean then
      raise exception 'La matrícula no cumple las reglas de finalización' using errcode = '22023';
    end if;
  end if;

  select t.* into v_t from public.tenants t where t.id = v_o.tenant_id;
  select c.* into v_c from public.clients c where c.id = v_o.client_id;
  select cv.* into v_v from public.course_versions cv where cv.id = v_o.version_id;

  select oi.user_id into v_instr from public.offering_instructors oi
  where oi.offering_id = v_o.id
  order by (oi.role = 'lead') desc, oi.created_at limit 1;

  if v_o.issuer_mode in ('school', 'co_issue') then
    v_issuers := v_issuers || jsonb_build_array(jsonb_build_object(
      'kind', 'school', 'name', v_t.name, 'logo_url', v_t.logo_light_url));
  end if;
  if v_o.issuer_mode in ('client', 'co_issue') then
    v_issuers := v_issuers || jsonb_build_array(jsonb_build_object(
      'kind', 'client', 'name', v_c.name));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', s.full_name, 'title', s.title, 'signature_path', s.signature_path)
         order by u.ord), '[]'::jsonb)
  into v_signers
  from unnest(v_o.certificate_signer_ids) with ordinality as u(id, ord)
  join public.certificate_signers s on s.id = u.id and s.deleted_at is null;

  v_final := coalesce(v_e.final_grade, nullif(app.grade_summary(p_enrollment_id, false) ->> 'final', '')::numeric);
  v_code := app.generate_certificate_code(v_t.slug);

  insert into public.certificates (
    code, tenant_id, client_id, offering_id, enrollment_id, version_id, user_id,
    issuer_mode, student_name, course_title, hours, grade, instructor_name,
    issuer_snapshot, template_snapshot, created_by
  ) values (
    v_code, v_o.tenant_id, v_o.client_id, v_o.id, v_e.id, v_o.version_id, v_e.user_id,
    v_o.issuer_mode, coalesce(app.user_display_name(v_e.user_id), 'Estudiante'),
    coalesce(nullif(v_v.title, ''), v_o.title), v_v.hours, v_final,
    case when v_instr is null then null else app.user_display_name(v_instr) end,
    v_issuers,
    jsonb_build_object(
      'variant', 'classic',
      'title', 'Certificado de aprobación',
      'primary_color', v_t.primary_color,
      'secondary_color', v_t.secondary_color,
      'offering_title', v_o.title,
      'starts_at', v_o.starts_at,
      'ends_at', v_o.ends_at,
      'signers', v_signers
    ),
    p_actor
  ) returning id into v_id;

  insert into public.certificate_events (certificate_id, tenant_id, type, actor_id)
  values (v_id, v_o.tenant_id, 'created', p_actor);
  return v_id;
end;
$$;
