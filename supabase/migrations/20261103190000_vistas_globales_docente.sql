-- Vistas globales del docente: todas las ediciones que puede gestionar, dentro de la escuela activa.

-- Agenda: sesiones programadas entre dos fechas (máximo 400 días).
create function public.get_my_schedule(p_tenant_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'El rango de fechas no es válido' using errcode = '23514';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'offering_id', o.id,
      'offering_title', o.title,
      'client_name', c.name,
      'offering_status', o.status,
      'lesson_title', l.title,
      'module_title', m.title,
      'session_date', s.session_date,
      'start_time', s.start_time,
      'end_time', s.end_time
    ) order by s.session_date, s.start_time nulls last, o.title, m.position, l.position)
    from public.offering_sessions s
    join public.offerings o on o.id = s.offering_id
    join public.clients c on c.id = o.client_id
    join public.lessons l on l.id = s.lesson_id
    join public.modules m on m.id = l.module_id
    where o.tenant_id = p_tenant_id
      and o.deleted_at is null
      and o.status <> 'archived'
      and s.session_date between p_from and p_to
      and app.can_manage_offering(o.id)
  ), '[]'::jsonb);
end;
$$;

-- Directorio de estudiantes: una fila por persona, con sus matrículas en las ediciones gestionadas.
create function public.list_my_students(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.sort_name)
    from (
      select
        e.user_id,
        u.email::text as email,
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') as full_name,
        sd.phone, sd.job_title, sd.company,
        lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email::text)) as sort_name,
        jsonb_agg(jsonb_build_object(
          'offering_id', o.id,
          'enrollment_id', e.id,
          'title', o.title,
          'client_name', c.name,
          'offering_status', o.status,
          'status', e.status,
          'progress_pct', e.progress_pct
        ) order by o.created_at desc) as editions
      from public.enrollments e
      join public.offerings o on o.id = e.offering_id
      join public.clients c on c.id = o.client_id
      join auth.users u on u.id = e.user_id
      left join public.student_details sd on sd.tenant_id = e.tenant_id and sd.user_id = e.user_id
      where o.tenant_id = p_tenant_id
        and o.deleted_at is null
        and app.can_manage_offering(o.id)
      group by e.user_id, u.email, u.raw_user_meta_data, sd.phone, sd.job_title, sd.company
      limit 2000
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Analítica: una fila por edición con matrículas, avance y asistencia.
create function public.get_my_analytics(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'offering_id', o.id,
      'title', o.title,
      'client_name', c.name,
      'status', o.status,
      'starts_at', o.starts_at,
      'ends_at', o.ends_at,
      'enrolled', (select count(*) from public.enrollments e
                   where e.offering_id = o.id and e.status <> 'dropped'),
      'completed', (select count(*) from public.enrollments e
                    where e.offering_id = o.id and e.status = 'completed'),
      'dropped', (select count(*) from public.enrollments e
                  where e.offering_id = o.id and e.status = 'dropped'),
      'avg_progress', (select round(avg(e.progress_pct), 1) from public.enrollments e
                       where e.offering_id = o.id and e.status <> 'dropped'),
      'closed_sessions', (select count(*) from public.attendance_sessions a
                          where a.offering_id = o.id and a.status = 'closed'),
      'attendance_pct', (
        select round(100.0 * count(*) filter (where r.status in ('present', 'late', 'excused'))
                     / nullif(count(*), 0), 1)
        from public.attendance_sessions a
        join public.attendance_records r on r.session_id = a.id
        join public.enrollments e on e.id = r.enrollment_id and e.status <> 'dropped'
        where a.offering_id = o.id and a.status = 'closed')
    ) order by o.created_at desc)
    from public.offerings o
    join public.clients c on c.id = o.client_id
    where o.tenant_id = p_tenant_id
      and o.deleted_at is null
      and o.status <> 'archived'
      and app.can_manage_offering(o.id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_my_schedule(uuid, date, date),
  public.list_my_students(uuid), public.get_my_analytics(uuid) from public, anon;
grant execute on function public.get_my_schedule(uuid, date, date),
  public.list_my_students(uuid), public.get_my_analytics(uuid) to authenticated;
