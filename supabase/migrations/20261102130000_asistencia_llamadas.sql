-- Asistencia: llamadas por edición, cierre con reapertura y porcentaje por alumno.
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
create type public.attendance_session_status as enum ('open', 'closed');

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  offering_id uuid not null references public.offerings (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  session_date date not null,
  status public.attendance_session_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attendance_sessions_offering_idx
  on public.attendance_sessions (offering_id, session_date, created_at);
create index attendance_sessions_tenant_idx on public.attendance_sessions (tenant_id);

create table public.attendance_records (
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status public.attendance_status not null,
  note text check (note is null or char_length(note) <= 300),
  marked_by uuid references auth.users (id),
  marked_at timestamptz not null default now(),
  primary key (session_id, enrollment_id)
);
create index attendance_records_enrollment_idx on public.attendance_records (enrollment_id);
create index attendance_records_tenant_idx on public.attendance_records (tenant_id);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('closed', 'reopened')),
  reason text check (reason is null or char_length(reason) <= 500),
  actor_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index attendance_events_session_idx on public.attendance_events (session_id, created_at);
create index attendance_events_tenant_idx on public.attendance_events (tenant_id);

create trigger attendance_sessions_touch before update on public.attendance_sessions
  for each row execute function app.touch_updated_at();

alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_events enable row level security;

revoke all on public.attendance_sessions, public.attendance_records, public.attendance_events
  from anon, authenticated;
grant select on public.attendance_sessions, public.attendance_records, public.attendance_events
  to authenticated;

create policy attendance_sessions_select on public.attendance_sessions
  for select to authenticated using (
    app.can_manage_offering(offering_id)
    or app.is_client_coordinator((select o.client_id from public.offerings o where o.id = offering_id))
  );
create policy attendance_records_select on public.attendance_records
  for select to authenticated using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_id and app.can_manage_offering(s.offering_id)
    )
  );
create policy attendance_events_select on public.attendance_events
  for select to authenticated using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_id and app.can_manage_offering(s.offering_id)
    )
  );

-- Porcentaje de asistencia de una matrícula: solo cuenta llamadas cerradas en las que
-- el alumno tiene registro. Presente, tarde y justificada suman asistencia.
create function app.attendance_pct(p_enrollment_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when count(*) = 0 then null
    else round(100.0 * count(*) filter (where r.status in ('present', 'late', 'excused')) / count(*), 2)
  end
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  where r.enrollment_id = p_enrollment_id and s.status = 'closed';
$$;
revoke all on function app.attendance_pct(uuid) from public, anon, authenticated;

create function public.create_attendance_session(p_offering_id uuid, p_title text, p_date date)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite tomar asistencia en esta edición' using errcode = '42501';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'El título debe tener entre 1 y 120 caracteres' using errcode = '23514';
  end if;
  if p_date is null then
    raise exception 'La fecha es obligatoria' using errcode = '23514';
  end if;
  insert into public.attendance_sessions (tenant_id, offering_id, title, session_date, created_by)
  values (v_o.tenant_id, v_o.id, v_title, p_date, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_attendance_session(p_session_id uuid, p_title text, p_date date)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select s.* into v_s from public.attendance_sessions s where s.id = p_session_id for update;
  if v_s.id is null or not app.can_manage_offering(v_s.offering_id) then
    raise exception 'No se permite modificar esta llamada' using errcode = '42501';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La llamada está cerrada' using errcode = '23514';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 or p_date is null then
    raise exception 'Datos de la llamada no válidos' using errcode = '23514';
  end if;
  update public.attendance_sessions s set title = v_title, session_date = p_date where s.id = p_session_id;
end;
$$;

create function public.delete_attendance_session(p_session_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s public.attendance_sessions%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select s.* into v_s from public.attendance_sessions s where s.id = p_session_id for update;
  if v_s.id is null or not app.can_manage_offering(v_s.offering_id) then
    raise exception 'No se permite eliminar esta llamada' using errcode = '42501';
  end if;
  if v_s.status <> 'open' then
    raise exception 'Reabre la llamada antes de eliminarla' using errcode = '23514';
  end if;
  delete from public.attendance_sessions s where s.id = p_session_id;
end;
$$;

-- p_marks: [{"enrollment_id": uuid, "status": "present|late|absent|excused", "note": text|null}]
create function public.set_attendance(p_session_id uuid, p_marks jsonb)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_m jsonb;
  v_enrollment uuid;
  v_status public.attendance_status;
  v_note text;
  v_n integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select s.* into v_s from public.attendance_sessions s where s.id = p_session_id for update;
  if v_s.id is null or not app.can_manage_offering(v_s.offering_id) then
    raise exception 'No se permite tomar asistencia en esta llamada' using errcode = '42501';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La llamada está cerrada' using errcode = '23514';
  end if;
  if jsonb_typeof(p_marks) <> 'array' then
    raise exception 'Marcas no válidas' using errcode = '23514';
  end if;
  if jsonb_array_length(p_marks) > 1000 then
    raise exception 'Demasiadas marcas en una sola operación' using errcode = '23514';
  end if;

  for v_m in select * from jsonb_array_elements(p_marks) loop
    v_enrollment := (v_m ->> 'enrollment_id')::uuid;
    v_status := (v_m ->> 'status')::public.attendance_status;
    v_note := nullif(btrim(coalesce(v_m ->> 'note', '')), '');
    if v_note is not null and char_length(v_note) > 300 then
      raise exception 'La nota no puede superar 300 caracteres' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.enrollments e
      where e.id = v_enrollment and e.offering_id = v_s.offering_id
        and e.status in ('active', 'completed')
    ) then
      raise exception 'Matrícula no válida para esta edición' using errcode = '23514';
    end if;
    insert into public.attendance_records as r (session_id, enrollment_id, tenant_id, status, note, marked_by, marked_at)
    values (v_s.id, v_enrollment, v_s.tenant_id, v_status, v_note, (select auth.uid()), now())
    on conflict (session_id, enrollment_id) do update
      set status = excluded.status, note = excluded.note,
          marked_by = excluded.marked_by, marked_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Cierra la llamada: los alumnos sin marca quedan como falta.
create function public.close_attendance_session(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_auto integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select s.* into v_s from public.attendance_sessions s where s.id = p_session_id for update;
  if v_s.id is null or not app.can_manage_offering(v_s.offering_id) then
    raise exception 'No se permite cerrar esta llamada' using errcode = '42501';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La llamada ya está cerrada' using errcode = '23514';
  end if;

  with ins as (
    insert into public.attendance_records (session_id, enrollment_id, tenant_id, status, marked_by, marked_at)
    select v_s.id, e.id, v_s.tenant_id, 'absent', (select auth.uid()), now()
    from public.enrollments e
    where e.offering_id = v_s.offering_id and e.status in ('active', 'completed')
      and not exists (
        select 1 from public.attendance_records r
        where r.session_id = v_s.id and r.enrollment_id = e.id
      )
    returning 1
  )
  select count(*)::integer into v_auto from ins;

  update public.attendance_sessions s
  set status = 'closed', closed_at = now(), closed_by = (select auth.uid())
  where s.id = v_s.id;
  insert into public.attendance_events (session_id, tenant_id, type, actor_id)
  values (v_s.id, v_s.tenant_id, 'closed', (select auth.uid()));
  return jsonb_build_object('auto_absent', v_auto);
end;
$$;

create function public.reopen_attendance_session(p_session_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select s.* into v_s from public.attendance_sessions s where s.id = p_session_id for update;
  if v_s.id is null or not app.can_manage_offering(v_s.offering_id) then
    raise exception 'No se permite reabrir esta llamada' using errcode = '42501';
  end if;
  if v_s.status <> 'closed' then
    raise exception 'La llamada ya está abierta' using errcode = '23514';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Indica el motivo (3 a 500 caracteres)' using errcode = '23514';
  end if;
  update public.attendance_sessions s
  set status = 'open', closed_at = null, closed_by = null
  where s.id = v_s.id;
  insert into public.attendance_events (session_id, tenant_id, type, reason, actor_id)
  values (v_s.id, v_s.tenant_id, 'reopened', v_reason, (select auth.uid()));
end;
$$;

-- Hoja de una llamada: alumnos activos/completados con su marca (si existe).
create function public.get_attendance_sheet(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.attendance_sessions%rowtype;
  v_students jsonb;
  v_events jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select s.* into v_s from public.attendance_sessions s where s.id = p_session_id;
  if v_s.id is null or not app.can_manage_offering(v_s.offering_id) then
    raise exception 'No se permite ver esta llamada' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'enrollment_id', e.id, 'email', u.email,
           'full_name', app.user_display_name(e.user_id),
           'status', r.status, 'note', r.note
         ) order by app.user_display_name(e.user_id), u.email), '[]'::jsonb)
  into v_students
  from public.enrollments e
  join auth.users u on u.id = e.user_id
  left join public.attendance_records r on r.session_id = v_s.id and r.enrollment_id = e.id
  where e.offering_id = v_s.offering_id and e.status in ('active', 'completed');

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', ev.type, 'reason', ev.reason, 'created_at', ev.created_at,
           'actor', app.user_display_name(ev.actor_id)
         ) order by ev.created_at), '[]'::jsonb)
  into v_events
  from public.attendance_events ev where ev.session_id = v_s.id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_s.id, 'offering_id', v_s.offering_id, 'title', v_s.title,
      'session_date', v_s.session_date, 'status', v_s.status, 'closed_at', v_s.closed_at),
    'students', v_students,
    'events', v_events);
end;
$$;

-- Resumen de la edición: llamadas y porcentaje por alumno (solo llamadas cerradas).
create function public.get_attendance_summary(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_sessions jsonb;
  v_students jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null
     or not (app.can_manage_offering(p_offering_id) or app.is_client_coordinator(v_o.client_id)) then
    raise exception 'No se permite ver la asistencia de esta edición' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'title', s.title, 'session_date', s.session_date, 'status', s.status,
           'present', (select count(*) from public.attendance_records r where r.session_id = s.id and r.status = 'present'),
           'late', (select count(*) from public.attendance_records r where r.session_id = s.id and r.status = 'late'),
           'excused', (select count(*) from public.attendance_records r where r.session_id = s.id and r.status = 'excused'),
           'absent', (select count(*) from public.attendance_records r where r.session_id = s.id and r.status = 'absent'),
           'marked', (select count(*) from public.attendance_records r where r.session_id = s.id)
         ) order by s.session_date, s.created_at), '[]'::jsonb)
  into v_sessions
  from public.attendance_sessions s where s.offering_id = p_offering_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'enrollment_id', e.id, 'email', u.email,
           'full_name', app.user_display_name(e.user_id),
           'pct', app.attendance_pct(e.id),
           'attended', (select count(*) from public.attendance_records r
                        join public.attendance_sessions s on s.id = r.session_id
                        where r.enrollment_id = e.id and s.status = 'closed'
                          and r.status in ('present', 'late', 'excused')),
           'total', (select count(*) from public.attendance_records r
                     join public.attendance_sessions s on s.id = r.session_id
                     where r.enrollment_id = e.id and s.status = 'closed'),
           'by_session', (select coalesce(jsonb_object_agg(r.session_id, r.status), '{}'::jsonb)
                          from public.attendance_records r where r.enrollment_id = e.id)
         ) order by app.user_display_name(e.user_id), u.email), '[]'::jsonb)
  into v_students
  from public.enrollments e
  join auth.users u on u.id = e.user_id
  where e.offering_id = p_offering_id and e.status in ('active', 'completed');

  return jsonb_build_object('sessions', v_sessions, 'students', v_students);
end;
$$;

-- Vista del alumno: su porcentaje y su estado en cada llamada cerrada.
create function public.get_my_attendance(p_enrollment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null or v_e.user_id <> (select auth.uid()) then
    raise exception 'Matrícula no disponible' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pct', app.attendance_pct(p_enrollment_id),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'title', s.title, 'session_date', s.session_date, 'status', r.status
             ) order by s.session_date, s.created_at), '[]'::jsonb)
      from public.attendance_records r
      join public.attendance_sessions s on s.id = r.session_id
      where r.enrollment_id = p_enrollment_id and s.status = 'closed'));
end;
$$;

revoke all on function public.create_attendance_session(uuid, text, date),
  public.update_attendance_session(uuid, text, date),
  public.delete_attendance_session(uuid),
  public.set_attendance(uuid, jsonb),
  public.close_attendance_session(uuid),
  public.reopen_attendance_session(uuid, text),
  public.get_attendance_sheet(uuid),
  public.get_attendance_summary(uuid),
  public.get_my_attendance(uuid)
  from public, anon;
grant execute on function public.create_attendance_session(uuid, text, date),
  public.update_attendance_session(uuid, text, date),
  public.delete_attendance_session(uuid),
  public.set_attendance(uuid, jsonb),
  public.close_attendance_session(uuid),
  public.reopen_attendance_session(uuid, text),
  public.get_attendance_sheet(uuid),
  public.get_attendance_summary(uuid),
  public.get_my_attendance(uuid)
  to authenticated;

-- Regla de finalización: asistencia mínima (min_attendance_pct).
create or replace function app.completion_status(p_enrollment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_rules jsonb;
  v_defaults jsonb;
  v_unmet jsonb := '[]'::jsonb;
  v_final numeric;
  v_required numeric;
  v_pct numeric;
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

  v_required := nullif(v_rules ->> 'min_attendance_pct', '')::numeric;
  if v_required is not null then
    v_pct := app.attendance_pct(p_enrollment_id);
    if v_pct is null or v_pct < v_required then
      v_unmet := v_unmet || jsonb_build_array(jsonb_build_object(
        'code', 'min_attendance_pct', 'required', v_required, 'actual', v_pct));
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
