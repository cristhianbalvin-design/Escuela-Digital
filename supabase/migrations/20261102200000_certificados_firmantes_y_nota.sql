-- 1) La verificación pública muestra a los firmantes del certificado (no el usuario interno).
create or replace function public.verify_certificate(p_code text)
returns table(status text, holder_name text, course_title text, hours numeric, issuers jsonb,
  instructor_name text, issued_at date, revoked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.status::text, c.student_name, c.course_title, c.hours, c.issuer_snapshot,
         coalesce(
           (select string_agg(s.value ->> 'name', ', ' order by s.ord)
            from jsonb_array_elements(
              case when jsonb_typeof(c.template_snapshot -> 'signers') = 'array'
                   then c.template_snapshot -> 'signers' else '[]'::jsonb end
            ) with ordinality as s(value, ord)
            where coalesce(s.value ->> 'name', '') <> ''),
           c.instructor_name),
         c.issued_at::date, c.revoked_at
  from public.certificates c
  where c.code = upper(trim(p_code));
$$;

-- 2) El certificado guarda si debe mostrar la nota (regla show_grade de la edición; por defecto no).
create or replace function app.issue_certificate_core(p_enrollment_id uuid, p_actor uuid, p_check boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  v_show_grade boolean;
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
  v_show_grade := coalesce(v_o.completion_rules ->> 'show_grade', 'false') = 'true';

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
      'signers', v_signers,
      'show_grade', v_show_grade
    ),
    p_actor
  ) returning id into v_id;

  insert into public.certificate_events (certificate_id, tenant_id, type, actor_id)
  values (v_id, v_o.tenant_id, 'created', p_actor);
  return v_id;
end;
$$;
