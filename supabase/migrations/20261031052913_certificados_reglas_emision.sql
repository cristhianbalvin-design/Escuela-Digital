-- Certificados: reglas de finalización, emisión, revocación, reemisión y verificación pública.

create type public.certificate_status as enum ('pending_render', 'issued', 'revoked', 'reissued');
create type public.certificate_event_type as enum
  ('created', 'rendered', 'render_failed', 'revoked', 'reissued', 'downloaded');

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  tenant_id uuid not null,
  client_id uuid not null,
  offering_id uuid not null,
  enrollment_id uuid not null,
  version_id uuid not null,
  user_id uuid not null references auth.users (id),
  status public.certificate_status not null default 'pending_render',
  issuer_mode public.issuer_mode not null,
  student_name text not null,
  course_title text not null,
  hours numeric,
  grade numeric,
  instructor_name text,
  issuer_snapshot jsonb not null default '[]'::jsonb,
  template_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  pdf_path text,
  rendered_at timestamptz,
  render_attempts integer not null default 0,
  last_render_error text,
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid references auth.users (id),
  replaced_by uuid references public.certificates (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificates_code_unique unique (code),
  constraint certificates_tenant_id_unique unique (tenant_id, id),
  constraint certificates_enrollment_fk
    foreign key (tenant_id, client_id, enrollment_id)
    references public.enrollments (tenant_id, client_id, id),
  constraint certificates_offering_fk
    foreign key (tenant_id, client_id, offering_id)
    references public.offerings (tenant_id, client_id, id)
);

create unique index certificates_one_active_per_enrollment
  on public.certificates (enrollment_id) where status in ('pending_render', 'issued');
create index certificates_pending_render_idx
  on public.certificates (created_at) where status = 'pending_render';
create index certificates_tenant_client_idx on public.certificates (tenant_id, client_id);
create index certificates_user_idx on public.certificates (user_id);
create index certificates_offering_idx on public.certificates (offering_id);
create index certificates_enrollment_idx on public.certificates (enrollment_id);
create index certificates_replaced_by_idx on public.certificates (replaced_by) where replaced_by is not null;
create index certificates_revoked_by_idx on public.certificates (revoked_by) where revoked_by is not null;
create index certificates_created_by_idx on public.certificates (created_by) where created_by is not null;
create index certificates_version_idx on public.certificates (version_id);

create trigger certificates_touch before update on public.certificates
  for each row execute function app.touch_updated_at();

create table public.certificate_events (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  tenant_id uuid not null,
  type public.certificate_event_type not null,
  actor_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);
create index certificate_events_certificate_idx on public.certificate_events (certificate_id);
create index certificate_events_tenant_idx on public.certificate_events (tenant_id);
create index certificate_events_actor_idx on public.certificate_events (actor_id) where actor_id is not null;

alter table public.certificates enable row level security;
alter table public.certificate_events enable row level security;

revoke all on public.certificates from anon, authenticated;
revoke all on public.certificate_events from anon, authenticated;
grant select on public.certificates to authenticated;
grant select on public.certificate_events to authenticated;

create policy certificates_select on public.certificates
  for select to authenticated using (
    user_id = (select auth.uid())
    or app.can_manage_offering(offering_id)
    or app.is_client_coordinator(client_id)
    or app.is_platform_admin()
  );

create policy certificate_events_select on public.certificate_events
  for select to authenticated using (
    exists (select 1 from public.certificates c where c.id = certificate_id)
  );

-- ---------------------------------------------------------------------------
-- Helpers (esquema app)
-- ---------------------------------------------------------------------------

create function app.user_display_name(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(u.email, '@', 1)
  )
  from auth.users u where u.id = p_user_id;
$$;

create function app.generate_certificate_code(p_prefix text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  suffix text;
  candidate text;
  i integer;
  v_prefix text;
begin
  v_prefix := upper(left(regexp_replace(coalesce(p_prefix, ''), '[^A-Za-z0-9]', '', 'g'), 8));
  if v_prefix = '' then
    v_prefix := 'CERT';
  end if;
  loop
    bytes := extensions.gen_random_bytes(8);
    suffix := '';
    for i in 0..7 loop
      suffix := suffix || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    candidate := v_prefix || '-' || extract(year from now())::int || '-' || suffix;
    exit when not exists (select 1 from public.certificates c where c.code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Evalúa las reglas de finalización de una matrícula. Devuelve
-- { met, unmet: [{code, required, actual, ...}], rules }.
create function app.completion_status(p_enrollment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_rules jsonb;
  v_defaults jsonb;
  v_unmet jsonb := '[]'::jsonb;
  v_final numeric;
  v_required numeric;
  v_id text;
  v_assessment public.assessments%rowtype;
  v_pass numeric;
  v_ok boolean;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null then
    return jsonb_build_object('met', false, 'unmet',
      jsonb_build_array(jsonb_build_object('code', 'enrollment_missing')), 'rules', '{}'::jsonb);
  end if;
  select o.* into v_o from public.offerings o where o.id = v_e.offering_id;
  select cv.completion_defaults into v_defaults from public.course_versions cv where cv.id = v_o.version_id;

  v_rules := coalesce(v_o.completion_rules, '{}'::jsonb);
  if v_rules = '{}'::jsonb then
    v_rules := coalesce(v_defaults, '{}'::jsonb);
  end if;
  if v_rules = '{}'::jsonb then
    v_rules := jsonb_build_object('min_progress_pct', 100);
  end if;

  if v_e.status not in ('active', 'completed') then
    v_unmet := v_unmet || jsonb_build_array(jsonb_build_object(
      'code', 'enrollment_status', 'actual', v_e.status::text));
  end if;

  v_required := nullif(v_rules ->> 'min_progress_pct', '')::numeric;
  if v_required is not null and coalesce(v_e.progress_pct, 0) < v_required then
    v_unmet := v_unmet || jsonb_build_array(jsonb_build_object(
      'code', 'min_progress_pct', 'required', v_required, 'actual', coalesce(v_e.progress_pct, 0)));
  end if;

  v_required := nullif(v_rules ->> 'min_final_grade', '')::numeric;
  if v_required is not null then
    v_final := coalesce(v_e.final_grade, nullif(app.grade_summary(p_enrollment_id, false) ->> 'final', '')::numeric);
    if v_final is null or v_final < v_required then
      v_unmet := v_unmet || jsonb_build_array(jsonb_build_object(
        'code', 'min_final_grade', 'required', v_required, 'actual', v_final));
    end if;
  end if;

  if jsonb_typeof(v_rules -> 'required_assessments') = 'array' then
    for v_id in select jsonb_array_elements_text(v_rules -> 'required_assessments') loop
      select a.* into v_assessment from public.assessments a where a.id = v_id::uuid;
      v_pass := coalesce(nullif(v_assessment.settings ->> 'pass_pct', '')::numeric, 0);
      select exists (
        select 1 from public.attempts at
        where at.enrollment_id = p_enrollment_id
          and at.assessment_id = v_id::uuid
          and at.score is not null
          and at.max_score > 0
          and 100 * at.score / at.max_score >= v_pass
      ) into v_ok;
      if not v_ok then
        v_unmet := v_unmet || jsonb_build_array(jsonb_build_object(
          'code', 'required_assessment', 'assessment_id', v_id, 'title', v_assessment.title));
      end if;
    end loop;
  end if;

  return jsonb_build_object('met', jsonb_array_length(v_unmet) = 0, 'unmet', v_unmet, 'rules', v_rules);
end;
$$;

-- Crea el certificado con datos congelados. No valida permisos: la usan las RPC.
create function app.issue_certificate_core(p_enrollment_id uuid, p_actor uuid, p_check boolean)
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
      'ends_at', v_o.ends_at
    ),
    p_actor
  ) returning id into v_id;

  insert into public.certificate_events (certificate_id, tenant_id, type, actor_id)
  values (v_id, v_o.tenant_id, 'created', p_actor);
  return v_id;
end;
$$;

-- Emisión automática cuando la edición lo pide y la matrícula cumple las reglas.
create function app.auto_issue_certificate()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_rules jsonb;
  v_auto boolean;
begin
  if new.status not in ('active', 'completed') then
    return null;
  end if;
  select coalesce(o.completion_rules, '{}'::jsonb) into v_rules
  from public.offerings o where o.id = new.offering_id;
  v_auto := coalesce((v_rules ->> 'auto_issue')::boolean, false);
  if not v_auto then
    return null;
  end if;
  if exists (select 1 from public.certificates c where c.enrollment_id = new.id) then
    return null;
  end if;
  begin
    if (app.completion_status(new.id) ->> 'met')::boolean then
      perform app.issue_certificate_core(new.id, null, false);
    end if;
  exception when others then
    raise warning 'auto_issue_certificate falló para %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger enrollments_auto_certificate
  after update of progress_pct, final_grade, status on public.enrollments
  for each row
  when (old.progress_pct is distinct from new.progress_pct
        or old.final_grade is distinct from new.final_grade
        or old.status is distinct from new.status)
  execute function app.auto_issue_certificate();

create function app.can_read_certificate_file(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.certificates c
    where c.tenant_id::text = split_part(p_name, '/', 1)
      and c.code || '.pdf' = split_part(p_name, '/', 2)
      and (
        c.user_id = (select auth.uid())
        or app.can_manage_offering(c.offering_id)
        or app.is_client_coordinator(c.client_id)
        or app.is_platform_admin()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC públicas
-- ---------------------------------------------------------------------------

create function public.evaluate_completion(p_enrollment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null
     or not (v_e.user_id = (select auth.uid())
             or app.can_manage_offering(v_e.offering_id)
             or app.is_client_coordinator(v_e.client_id)) then
    raise exception 'Matrícula no disponible' using errcode = '42501';
  end if;
  return app.completion_status(p_enrollment_id);
end;
$$;

create function public.issue_certificate(p_enrollment_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null or not app.can_manage_offering(v_e.offering_id) then
    raise exception 'No se permite emitir certificados en esta edición' using errcode = '42501';
  end if;
  return app.issue_certificate_core(p_enrollment_id, (select auth.uid()), true);
end;
$$;

create function public.revoke_certificate(p_certificate_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_c public.certificates%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select c.* into v_c from public.certificates c where c.id = p_certificate_id;
  if v_c.id is null or not app.can_manage_offering(v_c.offering_id) then
    raise exception 'No se permite revocar este certificado' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'El motivo es obligatorio' using errcode = '22023';
  end if;
  if v_c.status not in ('pending_render', 'issued') then
    raise exception 'El certificado no está vigente' using errcode = '22023';
  end if;
  update public.certificates c
  set status = 'revoked', revoked_at = now(), revoked_reason = trim(p_reason),
      revoked_by = (select auth.uid())
  where c.id = p_certificate_id;
  insert into public.certificate_events (certificate_id, tenant_id, type, actor_id, reason)
  values (p_certificate_id, v_c.tenant_id, 'revoked', (select auth.uid()), trim(p_reason));
end;
$$;

create function public.reissue_certificate(p_certificate_id uuid, p_reason text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_c public.certificates%rowtype;
  v_new uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select c.* into v_c from public.certificates c where c.id = p_certificate_id;
  if v_c.id is null or not app.can_manage_offering(v_c.offering_id) then
    raise exception 'No se permite reemitir este certificado' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'El motivo es obligatorio' using errcode = '22023';
  end if;
  if v_c.status not in ('issued', 'revoked') then
    raise exception 'Solo se reemite un certificado emitido o revocado' using errcode = '22023';
  end if;

  update public.certificates c set status = 'reissued' where c.id = p_certificate_id;
  v_new := app.issue_certificate_core(v_c.enrollment_id, (select auth.uid()), false);
  update public.certificates c set replaced_by = v_new where c.id = p_certificate_id;
  insert into public.certificate_events (certificate_id, tenant_id, type, actor_id, reason)
  values (p_certificate_id, v_c.tenant_id, 'reissued', (select auth.uid()), trim(p_reason));
  return v_new;
end;
$$;

-- Verificación pública: solo datos públicos del titular.
create function public.verify_certificate(p_code text)
returns table (
  status text, holder_name text, course_title text, hours numeric,
  issuers jsonb, instructor_name text, issued_at date, revoked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.status::text, c.student_name, c.course_title, c.hours,
         c.issuer_snapshot, c.instructor_name, c.issued_at::date, c.revoked_at
  from public.certificates c
  where c.code = upper(trim(p_code));
$$;

-- Panel del docente: matrículas con elegibilidad y estado del certificado.
create function public.get_offering_certificates(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null
     or not (app.can_manage_offering(p_offering_id) or app.is_client_coordinator(v_o.client_id)) then
    raise exception 'No se permite ver los certificados de esta edición' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'enrollment_id', e.id,
      'full_name', app.user_display_name(e.user_id),
      'email', u.email,
      'status', e.status,
      'progress_pct', e.progress_pct,
      'final_grade', e.final_grade,
      'completion', app.completion_status(e.id),
      'certificate', (
        select jsonb_build_object(
          'id', c.id, 'code', c.code, 'status', c.status, 'issued_at', c.issued_at,
          'pdf_path', c.pdf_path, 'last_render_error', c.last_render_error,
          'revoked_reason', c.revoked_reason)
        from public.certificates c
        where c.enrollment_id = e.id
        order by c.created_at desc limit 1)
    ) order by u.email)
    from public.enrollments e
    join auth.users u on u.id = e.user_id
    where e.offering_id = p_offering_id and e.status <> 'dropped'
  ), '[]'::jsonb);
end;
$$;

-- Permisos de ejecución
revoke all on function public.evaluate_completion(uuid) from public, anon;
revoke all on function public.issue_certificate(uuid) from public, anon;
revoke all on function public.revoke_certificate(uuid, text) from public, anon;
revoke all on function public.reissue_certificate(uuid, text) from public, anon;
revoke all on function public.get_offering_certificates(uuid) from public, anon;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.evaluate_completion(uuid) to authenticated;
grant execute on function public.issue_certificate(uuid) to authenticated;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;
grant execute on function public.reissue_certificate(uuid, text) to authenticated;
grant execute on function public.get_offering_certificates(uuid) to authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;

revoke all on function app.user_display_name(uuid) from public, anon, authenticated;
revoke all on function app.generate_certificate_code(text) from public, anon, authenticated;
revoke all on function app.completion_status(uuid) from public, anon, authenticated;
revoke all on function app.issue_certificate_core(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function app.auto_issue_certificate() from public, anon, authenticated;
revoke all on function app.can_read_certificate_file(text) from public, anon;
grant execute on function app.can_read_certificate_file(text) to authenticated;

-- Almacenamiento: bucket privado; solo escribe el servicio (render).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy certificates_files_select on storage.objects
  for select to authenticated using (
    bucket_id = 'certificates' and app.can_read_certificate_file(name)
  );
