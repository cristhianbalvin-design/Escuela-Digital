-- Calendario de sesiones por edición, enlazado a lecciones y a llamadas de asistencia.
alter table public.attendance_sessions
  add column lesson_id uuid references public.lessons (id) on delete set null;
create unique index attendance_sessions_offering_lesson_uq
  on public.attendance_sessions (offering_id, lesson_id) where lesson_id is not null;

create table public.offering_sessions (
  offering_id uuid not null references public.offerings (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_date date not null,
  start_time time,
  end_time time,
  primary key (offering_id, lesson_id),
  constraint offering_sessions_times check (
    end_time is null or start_time is null or end_time > start_time)
);
create index offering_sessions_tenant_idx on public.offering_sessions (tenant_id);
create index offering_sessions_date_idx on public.offering_sessions (offering_id, session_date);

alter table public.offering_sessions enable row level security;
revoke all on public.offering_sessions from anon, authenticated;

-- Calendario: el docente ve todas las lecciones; el alumno solo las programadas.
create function public.get_offering_schedule(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_manager boolean;
  v_student boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;
  v_manager := app.can_manage_offering(p_offering_id);
  v_student := exists (
    select 1 from public.enrollments e
    where e.offering_id = p_offering_id and e.user_id = (select auth.uid())
      and e.status in ('active', 'completed'));
  if not v_manager and not v_student then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'lesson_id', l.id,
      'module_title', m.title,
      'lesson_title', l.title,
      'session_date', s.session_date,
      'start_time', s.start_time,
      'end_time', s.end_time,
      'attendance_session_id', case when v_manager then a.id else null end
    ) order by m.position, l.position)
    from public.lessons l
    join public.modules m on m.id = l.module_id
    left join public.offering_sessions s on s.offering_id = p_offering_id and s.lesson_id = l.id
    left join public.attendance_sessions a on a.offering_id = p_offering_id and a.lesson_id = l.id
    where l.version_id = v_o.version_id and (v_manager or s.lesson_id is not null)
  ), '[]'::jsonb);
end;
$$;

-- Guarda el calendario completo (reemplaza): items = [{lesson_id, session_date, start_time, end_time}].
create function public.save_offering_schedule(p_offering_id uuid, p_items jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_item jsonb;
  v_lesson uuid;
  v_date date;
  v_start time;
  v_end time;
  v_ids uuid[] := '{}';
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite editar el calendario de esta edición' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'El calendario no es válido' using errcode = '23514';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'El calendario admite hasta 500 sesiones' using errcode = '23514';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_lesson := (v_item ->> 'lesson_id')::uuid;
    v_date := (v_item ->> 'session_date')::date;
    v_start := nullif(v_item ->> 'start_time', '')::time;
    v_end := nullif(v_item ->> 'end_time', '')::time;
    if v_date is null then
      raise exception 'Cada sesión necesita una fecha' using errcode = '23514';
    end if;
    if v_end is not null and v_start is not null and v_end <= v_start then
      raise exception 'La hora de fin debe ser posterior a la de inicio' using errcode = '23514';
    end if;
    if not exists (select 1 from public.lessons l
                   where l.id = v_lesson and l.version_id = v_o.version_id) then
      raise exception 'La lección no pertenece a esta edición' using errcode = '23514';
    end if;
    v_ids := v_ids || v_lesson;
    insert into public.offering_sessions (offering_id, lesson_id, tenant_id, session_date, start_time, end_time)
    values (v_o.id, v_lesson, v_o.tenant_id, v_date, v_start, v_end)
    on conflict (offering_id, lesson_id) do update
      set session_date = excluded.session_date,
          start_time = excluded.start_time,
          end_time = excluded.end_time;
    update public.attendance_sessions a set session_date = v_date
    where a.offering_id = v_o.id and a.lesson_id = v_lesson and a.status = 'open';
  end loop;

  delete from public.offering_sessions s
  where s.offering_id = v_o.id and not (s.lesson_id = any (v_ids));
end;
$$;

-- Crea una llamada de asistencia por cada sesión programada que aún no tiene una.
create function public.create_attendance_from_schedule(p_offering_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite tomar asistencia en esta edición' using errcode = '42501';
  end if;
  with ins as (
    insert into public.attendance_sessions (tenant_id, offering_id, title, session_date, created_by, lesson_id)
    select v_o.tenant_id, v_o.id, left(m.title || ' · ' || l.title, 120), s.session_date,
           (select auth.uid()), l.id
    from public.offering_sessions s
    join public.lessons l on l.id = s.lesson_id
    join public.modules m on m.id = l.module_id
    where s.offering_id = v_o.id
      and not exists (select 1 from public.attendance_sessions a
                      where a.offering_id = v_o.id and a.lesson_id = l.id)
    returning 1)
  select count(*)::integer into v_count from ins;
  return v_count;
end;
$$;

revoke all on function public.get_offering_schedule(uuid),
  public.save_offering_schedule(uuid, jsonb),
  public.create_attendance_from_schedule(uuid) from public, anon;
grant execute on function public.get_offering_schedule(uuid),
  public.save_offering_schedule(uuid, jsonb),
  public.create_attendance_from_schedule(uuid) to authenticated;
