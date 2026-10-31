-- Progreso de lecciones del estudiante y avance de la matrícula.
create type public.lesson_progress_status as enum (
  'in_progress', 'completed'
);

alter table public.enrollments
  add constraint enrollments_tenant_client_id_unique
  unique (tenant_id, client_id, id);

create table public.lesson_progress (
  enrollment_id uuid not null,
  lesson_id uuid not null references public.lessons (id),
  tenant_id uuid not null,
  client_id uuid not null,
  status public.lesson_progress_status not null default 'in_progress',
  completed_at timestamptz,
  last_position_seconds integer not null default 0,
  time_spent_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, lesson_id),
  constraint lesson_progress_enrollment_fk
    foreign key (tenant_id, client_id, enrollment_id)
    references public.enrollments (tenant_id, client_id, id),
  constraint lesson_progress_position_nonneg check (
    last_position_seconds >= 0 and time_spent_seconds >= 0
  ),
  constraint lesson_progress_completed_at_status check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create index lesson_progress_lesson_idx
  on public.lesson_progress (lesson_id);
create index lesson_progress_tenant_client_enrollment_idx
  on public.lesson_progress (tenant_id, client_id, enrollment_id);

create trigger lesson_progress_touch
  before update on public.lesson_progress
  for each row execute function app.touch_updated_at();

-- La lección debe pertenecer a la versión fijada de la edición.
create function app.guard_lesson_progress()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.enrollment_id is distinct from old.enrollment_id
       or new.lesson_id is distinct from old.lesson_id
       or new.tenant_id is distinct from old.tenant_id
       or new.client_id is distinct from old.client_id
     ) then
    raise exception 'La identidad del progreso es inmutable'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.enrollments e
    join public.offerings o
      on o.tenant_id = e.tenant_id
     and o.id = e.offering_id
    join public.lessons l
      on l.tenant_id = o.tenant_id
     and l.version_id = o.version_id
    where e.id = new.enrollment_id
      and l.id = new.lesson_id
  ) then
    raise exception 'La lección no pertenece a la versión de la edición'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger lesson_progress_guard
  before insert or update on public.lesson_progress
  for each row execute function app.guard_lesson_progress();

revoke all on function app.guard_lesson_progress()
  from public, anon, authenticated;

-- Fecha efectiva de apertura de un módulo en una edición.
create function app.module_unlock_at(
  p_offering_id uuid,
  p_module_id uuid
)
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select case
    when s.scheduled_at is null then o.starts_at
    when o.starts_at is null then s.scheduled_at
    else greatest(o.starts_at, s.scheduled_at)
  end
  from public.offerings o
  cross join lateral (
    select coalesce(
      (o.release_schedule -> 'modules' ->> p_module_id::text)
        ::timestamptz,
      o.starts_at
    ) as scheduled_at
  ) s
  where o.id = p_offering_id;
$$;

revoke all on function app.module_unlock_at(uuid, uuid)
  from public, anon, authenticated;

revoke all on public.lesson_progress from public, anon, authenticated;
grant select on public.lesson_progress to authenticated;
grant all on public.lesson_progress to service_role;

alter table public.lesson_progress enable row level security;

create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using (
    exists (
      select 1
      from public.enrollments e
      where e.id = lesson_progress.enrollment_id
        and (
          (
            e.user_id = (select auth.uid())
            and app.has_tenant_role(
              e.tenant_id,
              array['student']::public.tenant_role[]
            )
          )
          or app.can_manage_offering(e.offering_id)
          or app.is_client_coordinator(e.client_id)
        )
    )
  );

create function public.mark_lesson_progress(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_status public.lesson_progress_status,
  p_position_seconds integer default null,
  p_time_spent_delta integer default 0
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_offering public.offerings%rowtype;
  v_module_id uuid;
  v_unlock timestamptz;
  v_total integer;
  v_done integer;
  v_pct numeric(5, 2);
  v_delta integer := least(greatest(coalesce(p_time_spent_delta, 0), 0), 3600);
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'El estado es obligatorio'
      using errcode = '23514';
  end if;

  select e.*
    into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if v_enrollment.id is null
     or v_enrollment.user_id <> (select auth.uid())
     or v_enrollment.status not in ('active', 'completed')
     or not app.has_tenant_role(
       v_enrollment.tenant_id,
       array['student']::public.tenant_role[]
     ) then
    raise exception 'No se permite registrar progreso en esta matrícula'
      using errcode = '42501';
  end if;

  select o.*
    into v_offering
  from public.offerings o
  where o.id = v_enrollment.offering_id
    and o.deleted_at is null;

  if v_offering.id is null then
    raise exception 'Edición no disponible'
      using errcode = '42501';
  end if;

  select l.module_id
    into v_module_id
  from public.lessons l
  where l.id = p_lesson_id
    and l.tenant_id = v_offering.tenant_id
    and l.version_id = v_offering.version_id;

  if v_module_id is null then
    raise exception 'La lección no pertenece a esta edición'
      using errcode = '23514';
  end if;

  v_unlock := app.module_unlock_at(v_offering.id, v_module_id);
  if v_unlock is not null and v_unlock > now() then
    raise exception 'La lección todavía no está disponible'
      using errcode = '23514';
  end if;

  insert into public.lesson_progress as lp (
    enrollment_id, lesson_id, tenant_id, client_id, status,
    completed_at, last_position_seconds, time_spent_seconds
  )
  values (
    p_enrollment_id, p_lesson_id, v_enrollment.tenant_id,
    v_enrollment.client_id, p_status,
    case when p_status = 'completed' then now() end,
    greatest(coalesce(p_position_seconds, 0), 0), v_delta
  )
  on conflict (enrollment_id, lesson_id) do update
  set status = case
        when lp.status = 'completed' then 'completed'::public.lesson_progress_status
        else excluded.status
      end,
      completed_at = case
        when lp.status = 'completed' then lp.completed_at
        when excluded.status = 'completed' then now()
        else null
      end,
      last_position_seconds = case
        when p_position_seconds is null then lp.last_position_seconds
        else greatest(p_position_seconds, 0)
      end,
      time_spent_seconds = lp.time_spent_seconds + v_delta;

  -- Avance: lecciones obligatorias completadas (todas si ninguna lo es).
  select count(*) filter (where l.is_required),
         count(*)
    into v_total, v_done
  from public.lessons l
  where l.tenant_id = v_offering.tenant_id
    and l.version_id = v_offering.version_id;

  if v_total > 0 then
    select count(*)
      into v_done
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.enrollment_id = p_enrollment_id
      and lp.status = 'completed'
      and l.is_required;
  else
    select count(*) into v_total
    from public.lessons l
    where l.tenant_id = v_offering.tenant_id
      and l.version_id = v_offering.version_id;
    select count(*)
      into v_done
    from public.lesson_progress lp
    where lp.enrollment_id = p_enrollment_id
      and lp.status = 'completed';
  end if;

  v_pct := case
    when v_total = 0 then 0
    else round(100.0 * v_done / v_total, 2)
  end;

  update public.enrollments e
  set progress_pct = v_pct,
      last_activity_at = now()
  where e.id = p_enrollment_id;

  return jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'lesson_id', p_lesson_id,
    'progress_pct', v_pct
  );
end;
$$;

revoke all on function public.mark_lesson_progress(
  uuid, uuid, public.lesson_progress_status, integer, integer
) from public, anon, authenticated;
grant execute on function public.mark_lesson_progress(
  uuid, uuid, public.lesson_progress_status, integer, integer
) to authenticated;
