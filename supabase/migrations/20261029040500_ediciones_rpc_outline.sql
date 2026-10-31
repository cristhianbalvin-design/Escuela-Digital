-- Forma: {"offering_id": uuid, "version_id": uuid, "modules": [...]}.
-- Cada módulo contiene id, title, position, locked, locked_reason,
-- unlock_at y lessons. Cada lección contiene los campos acordados;
-- content aparece solo si está liberada. No se incluyen rutas de recursos.
create function public.get_course_outline(p_offering_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_offering public.offerings%rowtype;
  v_is_manager boolean;
  v_is_student boolean;
  v_now timestamptz := now();
  v_modules jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  select o.*
    into v_offering
  from public.offerings o
  where o.id = p_offering_id
    and o.deleted_at is null;

  if v_offering.id is null then
    raise exception 'Edición no disponible'
      using errcode = '42501';
  end if;

  v_is_manager := app.can_manage_offering(p_offering_id);

  select exists (
    select 1
    from public.enrollments e
    join public.tenant_members tm
      on tm.tenant_id = e.tenant_id
     and tm.user_id = e.user_id
    where e.tenant_id = v_offering.tenant_id
      and e.client_id = v_offering.client_id
      and e.offering_id = v_offering.id
      and e.user_id = (select auth.uid())
      and e.status in ('active', 'completed')
      and tm.status = 'active'
      and tm.role = 'student'
  ) into v_is_student;

  if not v_is_manager and not v_is_student then
    raise exception 'No se permite consultar el contenido de esta edición'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'position', m.position,
        'locked', gate.locked,
        'locked_reason', gate.locked_reason,
        'unlock_at', gate.unlock_at,
        'lessons', coalesce(lesson_list.lessons, '[]'::jsonb)
      )
      order by m.position, m.id
    ),
    '[]'::jsonb
  )
  into v_modules
  from public.modules m
  cross join lateral (
    select coalesce(
      (v_offering.release_schedule -> 'modules' ->> m.id::text)
        ::timestamptz,
      v_offering.starts_at
    ) as scheduled_at
  ) schedule
  cross join lateral (
    select case
      when schedule.scheduled_at is null then v_offering.starts_at
      when v_offering.starts_at is null then schedule.scheduled_at
      else greatest(v_offering.starts_at, schedule.scheduled_at)
    end as unlock_at
  ) effective
  cross join lateral (
    select
      (not v_is_manager
        and effective.unlock_at is not null
        and effective.unlock_at > v_now) as locked,
      case
        when v_is_manager then null::text
        when v_offering.starts_at > v_now then 'not_started'
        when effective.unlock_at > v_now then 'scheduled'
        else null::text
      end as locked_reason,
      effective.unlock_at
  ) gate
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'title', l.title,
        'position', l.position,
        'type', l.type,
        'is_required', l.is_required,
        'est_minutes', l.est_minutes,
        'locked', gate.locked,
        'locked_reason', gate.locked_reason,
        'unlock_at', gate.unlock_at
      )
      || case
        when gate.locked then '{}'::jsonb
        else jsonb_build_object('content', l.content)
      end
      order by l.position, l.id
    ) as lessons
    from public.lessons l
    where l.tenant_id = m.tenant_id
      and l.version_id = m.version_id
      and l.module_id = m.id
  ) lesson_list on true
  where m.tenant_id = v_offering.tenant_id
    and m.version_id = v_offering.version_id;

  return jsonb_build_object(
    'offering_id', v_offering.id,
    'version_id', v_offering.version_id,
    'modules', v_modules
  );
end;
$$;

revoke all on function public.get_course_outline(uuid)
  from public, anon, authenticated;
grant execute on function public.get_course_outline(uuid)
  to authenticated;
