-- Marca del certificado por escuela: logo y dos colores (principal y acento).
alter table public.tenants
  add column certificate_logo_path text,
  add column certificate_primary_color text,
  add column certificate_secondary_color text;

alter table public.tenants
  add constraint tenants_cert_primary_color_hex
    check (certificate_primary_color is null or certificate_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint tenants_cert_secondary_color_hex
    check (certificate_secondary_color is null or certificate_secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint tenants_cert_logo_path_len
    check (certificate_logo_path is null or char_length(certificate_logo_path) <= 200);

grant select (certificate_logo_path, certificate_primary_color, certificate_secondary_color)
  on public.tenants to authenticated;
grant update (certificate_logo_path, certificate_primary_color, certificate_secondary_color)
  on public.tenants to authenticated;

-- Archivos de logo: bucket privado, ruta {tenant_id}/logo.png|jpg
create function app.can_read_branding_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and app.has_tenant_role(
           split_part(p_name, '/', 1)::uuid,
           array['owner', 'admin', 'instructor']::public.tenant_role[]);
$$;

create function app.can_manage_branding_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and app.has_tenant_role(
           split_part(p_name, '/', 1)::uuid,
           array['owner', 'admin']::public.tenant_role[]);
$$;

revoke all on function app.can_read_branding_file(text) from public, anon;
revoke all on function app.can_manage_branding_file(text) from public, anon;
grant execute on function app.can_read_branding_file(text) to authenticated;
grant execute on function app.can_manage_branding_file(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy branding_select on storage.objects
  for select to authenticated using (
    bucket_id = 'branding' and app.can_read_branding_file(name)
  );
create policy branding_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'branding' and app.can_manage_branding_file(name)
  );
create policy branding_update on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and app.can_manage_branding_file(name))
  with check (bucket_id = 'branding' and app.can_manage_branding_file(name));
create policy branding_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'branding' and app.can_manage_branding_file(name)
  );

-- Emisión: congela colores y logo de la marca del certificado.
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
      'kind', 'school', 'name', v_t.name, 'logo_url', v_t.logo_light_url,
      'logo_path', v_t.certificate_logo_path));
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
      'primary_color', coalesce(v_t.certificate_primary_color, v_t.primary_color),
      'secondary_color', coalesce(v_t.certificate_secondary_color, v_t.secondary_color),
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
