create function app.live_mark_plan_done(p_run_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.session_plan_progress(tenant_id,offering_id,item_id,done,done_at,done_by)
  select s.tenant_id,s.offering_id,a.plan_item_id,true,now(),auth.uid()
  from public.live_runs r
  join public.live_activities a on a.id=r.activity_id
  join public.live_sessions s on s.id=r.session_id
  where r.id=p_run_id and a.plan_item_id is not null
  on conflict (offering_id,item_id) do update set done=true,
    done_at=coalesce(public.session_plan_progress.done_at,excluded.done_at),
    done_by=coalesce(public.session_plan_progress.done_by,excluded.done_by);
$$;
revoke all on function app.live_mark_plan_done(uuid) from public,anon,authenticated;

create function public.get_live_activities(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'plan_item_id',a.plan_item_id,
    'title',a.title,'type',a.type,'config',a.config,'position',a.position) order by a.position)
    from public.live_activities a where a.lesson_id=p_lesson_id),'[]'::jsonb);
end $$;

create function public.save_live_activities(p_lesson_id uuid,p_items jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.lessons%rowtype; x jsonb; v_id uuid; v_plan uuid; v_type text; v_config jsonb;
  v_ids uuid[] := '{}'; v_pos integer := 0;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode='42501'; end if;
  select * into l from public.lessons where id=p_lesson_id for update;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500 then
    raise exception 'Actividades inválidas' using errcode='23514'; end if;
  -- Liberar las posiciones antes de reordenar sin violar la unicidad.
  update public.live_activities set position=position+1000000 where lesson_id=l.id;
  for x in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(x)<>'object' or x - 'id' - 'plan_item_id' - 'title' - 'type' - 'config' <> '{}'::jsonb or
       jsonb_typeof(x->'title')<>'string' or length(btrim(x->>'title')) not between 1 and 200 then
      raise exception 'Actividad inválida' using errcode='23514'; end if;
    v_id := coalesce(nullif(x->>'id','')::uuid,gen_random_uuid());
    v_plan := nullif(x->>'plan_item_id','')::uuid;
    v_type := x->>'type';
    v_config := x->'config';
    if v_type='wordcloud' and v_config='{}'::jsonb then v_config:='{"max_answers":3}'::jsonb; end if;
    if v_id=any(v_ids) or not app.live_valid_activity(v_type,v_config) or
       exists(select 1 from public.live_activities a where a.id=v_id and a.lesson_id<>l.id) or
       (v_plan is not null and not exists(select 1 from public.lesson_plan_items i
         where i.id=v_plan and i.lesson_id=l.id and i.tenant_id=l.tenant_id)) then
      raise exception 'Actividad inválida' using errcode='23514'; end if;
    v_ids:=array_append(v_ids,v_id);
    insert into public.live_activities(id,tenant_id,lesson_id,plan_item_id,title,type,config,position)
      values(v_id,l.tenant_id,l.id,v_plan,btrim(x->>'title'),v_type,v_config,v_pos)
      on conflict(id) do update set plan_item_id=excluded.plan_item_id,title=excluded.title,
        type=excluded.type,config=excluded.config,position=excluded.position;
    v_pos:=v_pos+1;
  end loop;
  if exists(select 1 from public.live_activities a join public.live_runs r on r.activity_id=a.id
    where a.lesson_id=l.id and not(a.id=any(v_ids))) then
    raise exception 'Una actividad utilizada no se puede eliminar' using errcode='23514'; end if;
  delete from public.live_activities where lesson_id=l.id and not(id=any(v_ids));
  return public.get_live_activities(l.id);
end $$;

create function public.get_live_control_state(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; v_runs jsonb; v_count integer;
begin
  select * into s from public.live_sessions where id=p_session_id;
  if s.id is null or not app.can_manage_offering(s.offering_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  select count(*)::integer into v_count from public.live_participants p where p.session_id=s.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'activity_id',r.activity_id,
    'title',r.title,'type',r.type,'config',r.config,'status',r.status,
    'show_results',r.show_results,'opened_at',r.opened_at,'closed_at',r.closed_at,
    'results',app.live_results(r.id,true)) order by r.opened_at,r.id),'[]'::jsonb)
    into v_runs from public.live_runs r where r.session_id=s.id;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'offering_id',s.offering_id,
    'lesson_id',s.lesson_id,'code',s.code,'status',s.status,'access_mode',s.access_mode,
    'ask_name',s.ask_name,'ask_company',s.ask_company,'created_at',s.created_at,
    'ended_at',s.ended_at),'activities',public.get_live_activities(s.lesson_id),
    'runs',v_runs,'participant_count',v_count);
end $$;

create function public.create_live_session(p_offering_id uuid,p_lesson_id uuid,
  p_access_mode text,p_ask_name boolean,p_ask_company boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o public.offerings%rowtype; v_code text; v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea; v_byte integer; v_attempt integer; v_i integer;
begin
  select * into o from public.offerings where id=p_offering_id and deleted_at is null for update;
  if o.id is null or auth.uid() is null or not app.can_manage_offering(o.id) or
     p_access_mode not in ('enrolled','guest','both') or p_access_mode is null or
     p_ask_name is null or p_ask_company is null or
     not exists(select 1 from public.lessons l where l.id=p_lesson_id
       and l.tenant_id=o.tenant_id and l.version_id=o.version_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  if exists(select 1 from public.live_sessions where offering_id=o.id and status='active') then
    raise exception 'Ya existe una clase activa para esta edición' using errcode='23505'; end if;
  for v_attempt in 1..20 loop
    v_code:='';
    while length(v_code)<6 loop
      v_bytes:=extensions.gen_random_bytes(8);
      for v_i in 0..7 loop
        v_byte:=get_byte(v_bytes,v_i);
        if v_byte < (256/length(v_alphabet))*length(v_alphabet) then
          v_code:=v_code || substr(v_alphabet,(v_byte % length(v_alphabet))+1,1);
        end if;
        exit when length(v_code)=6;
      end loop;
    end loop;
    exit when not exists(select 1 from public.live_sessions where code=v_code);
  end loop;
  if exists(select 1 from public.live_sessions where code=v_code) then
    raise exception 'No se pudo generar un código único' using errcode='23505'; end if;
  insert into public.live_sessions(tenant_id,offering_id,lesson_id,code,access_mode,
    ask_name,ask_company,created_by)
    values(o.tenant_id,o.id,p_lesson_id,v_code,p_access_mode,p_ask_name,p_ask_company,auth.uid());
  return public.get_live_control_state((select id from public.live_sessions where code=v_code));
end $$;

create function public.launch_live_run(p_session_id uuid,p_activity_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; a public.live_activities%rowtype;
begin
  select * into s from public.live_sessions where id=p_session_id for update;
  if s.id is null or not app.can_manage_offering(s.offering_id) or s.status<>'active' then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  select * into a from public.live_activities where id=p_activity_id and lesson_id=s.lesson_id
    and tenant_id=s.tenant_id;
  if a.id is null or exists(select 1 from public.live_runs where session_id=s.id and status='open') then
    raise exception 'Actividad no disponible o hay una ronda abierta' using errcode='23514'; end if;
  insert into public.live_runs(tenant_id,session_id,activity_id,title,type,config)
    values(s.tenant_id,s.id,a.id,a.title,a.type,a.config);
  return public.get_live_control_state(s.id);
end $$;

create function public.close_live_run(p_run_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or not app.live_manage_session(r.session_id) or r.status<>'open' then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  update public.live_runs set status='closed',closed_at=now() where id=r.id;
  perform app.live_mark_plan_done(r.id);
  return public.get_live_control_state(r.session_id);
end $$;

create function public.set_live_run_visibility(p_run_id uuid,p_show_results boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or p_show_results is null or not app.live_manage_session(r.session_id) then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  update public.live_runs set show_results=p_show_results where id=r.id;
  return public.get_live_control_state(r.session_id);
end $$;

create function public.moderate_live_response(p_response_id uuid,p_hidden boolean,p_pinned boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.live_responses%rowtype; r public.live_runs%rowtype;
begin
  select * into a from public.live_responses where id=p_response_id for update;
  select * into r from public.live_runs where id=a.run_id;
  if a.id is null or p_hidden is null or p_pinned is null or
     not app.live_manage_session(r.session_id) then
    raise exception 'Respuesta no disponible' using errcode='42501'; end if;
  update public.live_responses set hidden=p_hidden,pinned=p_pinned where id=a.id;
  return public.get_live_control_state(r.session_id);
end $$;

create function public.merge_live_term(p_run_id uuid,p_term text,p_merged_into text,p_hidden boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype; v_term text; v_target text;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  v_term:=app.live_normalize_term(p_term);
  v_target:=case when p_merged_into is null then null else app.live_normalize_term(p_merged_into) end;
  if r.id is null or r.type<>'wordcloud' or not app.live_manage_session(r.session_id) or
     p_hidden is null or length(v_term) not between 1 and 30 or
     (v_target is not null and (length(v_target) not between 1 and 30 or v_target=v_term)) then
    raise exception 'Término no disponible' using errcode='23514'; end if;
  if not p_hidden and v_target is null then
    delete from public.live_term_moderation where run_id=r.id and term=v_term;
  else
    insert into public.live_term_moderation(run_id,term,merged_into,hidden)
      values(r.id,v_term,v_target,p_hidden)
      on conflict(run_id,term) do update set merged_into=excluded.merged_into,hidden=excluded.hidden;
  end if;
  return public.get_live_control_state(r.session_id);
end $$;

create function public.end_live_session(p_session_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype;
begin
  select * into s from public.live_sessions where id=p_session_id for update;
  if s.id is null or not app.can_manage_offering(s.offering_id) or s.status<>'active' then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  perform app.live_mark_plan_done(r.id) from public.live_runs r
    where r.session_id=s.id and r.status='open';
  update public.live_runs set status='closed',closed_at=now()
    where session_id=s.id and status='open';
  update public.live_sessions set status='ended',ended_at=now() where id=s.id;
  return public.get_live_control_state(s.id);
end $$;

revoke all on function public.get_live_activities(uuid),public.save_live_activities(uuid,jsonb),
  public.create_live_session(uuid,uuid,text,boolean,boolean),public.get_live_control_state(uuid),
  public.launch_live_run(uuid,uuid),public.close_live_run(uuid),public.set_live_run_visibility(uuid,boolean),
  public.moderate_live_response(uuid,boolean,boolean),public.merge_live_term(uuid,text,text,boolean),
  public.end_live_session(uuid) from public,anon;
grant execute on function public.get_live_activities(uuid),public.save_live_activities(uuid,jsonb),
  public.create_live_session(uuid,uuid,text,boolean,boolean),public.get_live_control_state(uuid),
  public.launch_live_run(uuid,uuid),public.close_live_run(uuid),public.set_live_run_visibility(uuid,boolean),
  public.moderate_live_response(uuid,boolean,boolean),public.merge_live_term(uuid,text,text,boolean),
  public.end_live_session(uuid) to authenticated;
