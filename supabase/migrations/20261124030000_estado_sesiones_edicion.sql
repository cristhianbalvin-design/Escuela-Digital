create or replace function public.get_offering_sessions_status(p_offering_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not coalesce(app.can_manage_offering(p_offering_id), false) then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'enrolled', (select count(*) from public.enrollments e where e.offering_id = o.id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'lesson_id', l.id, 'materials', resources.n, 'slides', coalesce(p.page_count, 0),
      'blocks', blocks.n, 'activities', activities.n, 'live_classes', live.classes,
      'live_runs', live.runs, 'live_responses', live.responses,
      'attendance_taken', attendance.taken, 'attended', attendance.attended
    ) order by m.position, l.position, l.id)
    from public.lessons l
    join public.modules m on m.id = l.module_id
    left join public.lesson_presentations p on p.lesson_id = l.id
    left join lateral (select count(*) n from public.lesson_resources r where r.lesson_id = l.id and r.audience = 'students') resources on true
    left join lateral (select count(*) n from public.lesson_plan_items b where b.lesson_id = l.id) blocks on true
    left join lateral (select count(*) n from public.live_sets a where a.lesson_id = l.id) activities on true
    left join lateral (
      select count(distinct s.id) classes, count(distinct r.id) runs, count(resp.id) responses
      from public.live_sessions s
      left join public.live_runs r on r.session_id = s.id
      left join public.live_responses resp on resp.run_id = r.id
      where s.offering_id = o.id and s.lesson_id = l.id
    ) live on true
    left join lateral (
      select count(distinct s.id) > 0 taken, count(r.enrollment_id) filter (where r.status in ('present', 'late')) attended
      from public.attendance_sessions s left join public.attendance_records r on r.session_id = s.id
      where s.offering_id = o.id and s.lesson_id = l.id
    ) attendance on true
    where l.version_id = o.version_id), '[]'::jsonb)
  ) from public.offerings o where o.id = p_offering_id);
end $$;
revoke all on function public.get_offering_sessions_status(uuid) from public, anon;
grant execute on function public.get_offering_sessions_status(uuid) to authenticated;
