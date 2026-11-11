-- Guía enlazada: context opcional, ranking por grupo, marcado completo del ítem y recuperación de clase activa.
do $$
declare d text; o text; n text;
begin
  d := pg_get_functiondef('app.live_valid_activity(text,jsonb)'::regprocedure);
  o := 'p_config := p_config - ''help'' - ''indicator_label'';';
  n := 'if p_config ? ''context'' and (jsonb_typeof(p_config->''context'') <> ''string'' or length(p_config->>''context'') > 6000) then return false; end if;
  p_config := p_config - ''help'' - ''indicator_label'' - ''context'';';
  if position(o in d) = 0 then raise exception 'patch live_valid_activity no aplica'; end if;
  execute replace(d, o, n);

  d := pg_get_functiondef('app.live_rank_detail(uuid)'::regprocedure);
  o := E'select id,config,opened_at from public.live_runs\n    where session_id=p_session_id and type=''quiz'' and (status=''closed'' or reveal)';
  n := E'select lr.id,lr.config,lr.opened_at from public.live_runs lr join public.live_activities la on la.id=lr.activity_id\n    where lr.session_id=p_session_id and lr.type=''quiz'' and (lr.status=''closed'' or lr.reveal)\n    and la.plan_item_id is not distinct from (select la2.plan_item_id from public.live_runs r2 join public.live_activities la2 on la2.id=r2.activity_id where r2.session_id=p_session_id and r2.type=''quiz'' order by r2.opened_at desc,r2.id desc limit 1)';
  if position(o in d) = 0 then raise exception 'patch live_rank_detail no aplica'; end if;
  execute replace(d, o, n);
end $$;

create or replace function app.live_mark_plan_done(p_run_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.session_plan_progress(tenant_id,offering_id,item_id,done,done_at,done_by)
  select s.tenant_id,s.offering_id,a.plan_item_id,true,now(),auth.uid()
  from public.live_runs r
  join public.live_activities a on a.id=r.activity_id
  join public.live_sessions s on s.id=r.session_id
  where r.id=p_run_id and a.plan_item_id is not null
    and not exists (
      select 1 from public.live_activities a2
      where a2.plan_item_id=a.plan_item_id
        and not exists (select 1 from public.live_runs r2
          where r2.activity_id=a2.id and r2.session_id=s.id and r2.status='closed'))
  on conflict (offering_id,item_id) do update set done=true,
    done_at=coalesce(public.session_plan_progress.done_at,excluded.done_at),
    done_by=coalesce(public.session_plan_progress.done_by,excluded.done_by);
$$;
revoke all on function app.live_mark_plan_done(uuid) from public,anon,authenticated;

create or replace function public.get_offering_live_session(p_offering_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  select id into v_id from public.live_sessions
    where offering_id=p_offering_id and status='active' limit 1;
  if v_id is null then return null; end if;
  return public.get_live_control_state(v_id);
end $$;
revoke all on function public.get_offering_live_session(uuid) from public,anon,authenticated;
grant execute on function public.get_offering_live_session(uuid) to authenticated;
