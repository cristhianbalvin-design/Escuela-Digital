-- Lista las clases en vivo de una edición y lección (para Resultados).
create or replace function public.list_live_sessions(p_offering_id uuid, p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'status',s.status,
      'created_at',s.created_at,'ended_at',s.ended_at,
      'participant_count',(select count(*)::integer from public.live_participants p where p.session_id=s.id),
      'run_count',(select count(*)::integer from public.live_runs r where r.session_id=s.id))
      order by s.created_at desc)
    from public.live_sessions s where s.offering_id=p_offering_id and s.lesson_id=p_lesson_id),'[]'::jsonb);
end $$;
revoke all on function public.list_live_sessions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_live_sessions(uuid,uuid) to authenticated;
