-- Reiniciar resultados: elimina la ronda (y sus respuestas) para poder lanzarla de nuevo.
create or replace function public.reset_live_run(p_run_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or not app.live_manage_session(r.session_id) then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  delete from public.live_runs where id=r.id;
  return public.get_live_control_state(r.session_id);
end $$;

create or replace function public.reset_live_session_results(p_session_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype;
begin
  select * into s from public.live_sessions where id=p_session_id for update;
  if s.id is null or not app.can_manage_offering(s.offering_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  delete from public.live_runs where session_id=s.id;
  return public.get_live_control_state(s.id);
end $$;

revoke all on function public.reset_live_run(uuid),public.reset_live_session_results(uuid) from public,anon,authenticated;
grant execute on function public.reset_live_run(uuid),public.reset_live_session_results(uuid) to authenticated;
