-- Reiniciar resultados también desmarca como "hecho" los bloques afectados (los marcó live_mark_plan_done al cerrar su última ronda).
create or replace function public.reset_live_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare r public.live_runs%rowtype; s public.live_sessions%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or not app.live_manage_session(r.session_id) then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  select * into s from public.live_sessions where id=r.session_id;
  update public.session_plan_progress p set done=false, done_at=null, done_by=null
  where p.offering_id=s.offering_id and p.done and p.item_id in (
    select a.plan_item_id from public.live_activities a
    where a.plan_item_id is not null and (a.id=r.activity_id or r.config->'questions' @> jsonb_build_array(jsonb_build_object('id', a.id::text))));
  delete from public.live_runs where id=r.id;
  return public.get_live_control_state(r.session_id);
end $function$;

create or replace function public.reset_live_session_results(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.live_sessions%rowtype;
begin
  select * into s from public.live_sessions where id=p_session_id for update;
  if s.id is null or not app.can_manage_offering(s.offering_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  update public.session_plan_progress p set done=false, done_at=null, done_by=null
  where p.offering_id=s.offering_id and p.done and p.item_id in (
    select a.plan_item_id from public.live_runs r join public.live_activities a
      on a.id=r.activity_id or r.config->'questions' @> jsonb_build_array(jsonb_build_object('id', a.id::text))
    where r.session_id=s.id and a.plan_item_id is not null);
  delete from public.live_runs where session_id=s.id;
  return public.get_live_control_state(s.id);
end $function$;
