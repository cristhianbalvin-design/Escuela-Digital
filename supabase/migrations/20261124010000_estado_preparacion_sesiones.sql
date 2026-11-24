create function public.get_course_prep_status(p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.lessons l where l.version_id = p_version_id)
     and not exists (select 1 from public.lessons l where l.version_id = p_version_id and app.live_manage_lesson(l.id)) then
    raise exception 'Versión no disponible' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'lesson_id', l.id, 'materials', r.materials, 'teacher_files', r.teacher_files,
    'has_text', coalesce(length(btrim(l.content->>'text')) > 0, false),
    'slides', coalesce(p.page_count, 0), 'slide_notes', n.slide_notes,
    'blocks', b.blocks, 'plan_minutes', b.plan_minutes,
    'activities', a.activities, 'activity_notes', a.activity_notes, 'taught', s.taught
  ) order by l.position, l.id), '[]'::jsonb)
  from public.lessons l
  left join public.lesson_presentations p on p.lesson_id = l.id
  cross join lateral (select count(*) filter (where audience = 'students') as materials,
    count(*) filter (where audience = 'teachers') as teacher_files
    from public.lesson_resources where lesson_id = l.id) r
  cross join lateral (select count(*) as slide_notes from public.lesson_slide_notes
    where lesson_id = l.id and length(btrim(notes)) > 0 and slide <= coalesce(p.page_count, 0)) n
  cross join lateral (select count(*) as blocks, coalesce(sum(minutes), 0) as plan_minutes
    from public.lesson_plan_items where lesson_id = l.id) b
  cross join lateral (select count(*) as activities, count(*) filter (where exists (
    select 1 from public.live_teacher_notes n where n.target_id = x.id and n.lesson_id = l.id and length(btrim(n.notes)) > 0
  )) as activity_notes from public.live_sets x where x.lesson_id = l.id) a
  cross join lateral (select count(*) as taught from public.live_sessions where lesson_id = l.id) s
  where l.version_id = p_version_id and app.live_manage_lesson(l.id));
end $$;
revoke all on function public.get_course_prep_status(uuid) from public, anon;
grant execute on function public.get_course_prep_status(uuid) to authenticated;
