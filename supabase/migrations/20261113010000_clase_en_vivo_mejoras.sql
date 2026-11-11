-- Mejoras de clase en vivo. Las tablas siguen accesibles solo por RPC.

alter table public.live_runs add column if not exists paused boolean not null default false;

create or replace function app.live_valid_activity(p_type text, p_config jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; v_ids text[] := '{}'; v_count integer; v_min integer; v_max integer;
begin
  if jsonb_typeof(p_config) <> 'object' then return false; end if;
  if p_config ? 'help' and (jsonb_typeof(p_config->'help') <> 'string' or
    length(btrim(p_config->>'help')) not between 1 and 200) then return false; end if;
  if p_config ? 'indicator_label' and (jsonb_typeof(p_config->'indicator_label') <> 'string' or
    length(btrim(p_config->>'indicator_label')) not between 1 and 60) then return false; end if;
  p_config := p_config - 'help' - 'indicator_label';
  if p_type in ('poll_single','vote','poll_multi') then
    if p_config - 'options' - 'max_choices' <> '{}'::jsonb or
       (p_type <> 'poll_multi' and p_config ? 'max_choices') or
       jsonb_typeof(p_config->'options') <> 'array' then return false; end if;
    v_count := jsonb_array_length(p_config->'options');
    if v_count not between 2 and 20 then return false; end if;
    for x in select value from jsonb_array_elements(p_config->'options') loop
      if jsonb_typeof(x) <> 'object' or x - 'id' - 'label' - 'score' <> '{}'::jsonb or
         jsonb_typeof(x->'id') <> 'string' or jsonb_typeof(x->'label') <> 'string' or
         length(btrim(x->>'id')) not between 1 and 100 or
         length(btrim(x->>'label')) not between 1 and 200 or
         x->>'id' = any(v_ids) or
         (x ? 'score' and (jsonb_typeof(x->'score') <> 'number' or
           (x->>'score') !~ '^[0-9]+$' or length(x->>'score') > 3 or
           (x->>'score')::integer not between 0 and 100)) then return false; end if;
      v_ids := array_append(v_ids, x->>'id');
    end loop;
    if p_type = 'poll_multi' and p_config ? 'max_choices' and
       (jsonb_typeof(p_config->'max_choices') <> 'number' or
        (p_config->>'max_choices') !~ '^[0-9]+$' or
        (p_config->>'max_choices')::integer not between 1 and v_count) then return false; end if;
    return true;
  elsif p_type = 'wordcloud' then
    return p_config - 'max_answers' = '{}'::jsonb and p_config ? 'max_answers' and
      jsonb_typeof(p_config->'max_answers') = 'number' and
      (p_config->>'max_answers') ~ '^[0-9]+$' and
      (p_config->>'max_answers')::integer between 1 and 20;
  elsif p_type = 'open' then
    return p_config = '{}'::jsonb;
  elsif p_type = 'scale' then
    if p_config - 'scale_min' - 'scale_max' - 'labels' <> '{}'::jsonb or
       jsonb_typeof(p_config->'scale_min') <> 'number' or
       jsonb_typeof(p_config->'scale_max') <> 'number' or
       (p_config->>'scale_min') !~ '^-?[0-9]+$' or
       (p_config->>'scale_max') !~ '^-?[0-9]+$' then return false; end if;
    v_min := (p_config->>'scale_min')::integer; v_max := (p_config->>'scale_max')::integer;
    if v_min not between -100 and 100 or v_max not between -100 and 100 or
       v_max <= v_min or v_max-v_min > 20 then return false; end if;
    if p_config ? 'labels' then
      if jsonb_typeof(p_config->'labels') <> 'object' then return false; end if;
      if exists (select 1 from jsonb_each(p_config->'labels') e
        where length(e.key)>10 or jsonb_typeof(e.value)<>'string' or length(btrim(e.value#>>'{}'))>200) then return false; end if;
    end if;
    return true;
  end if;
  return false;
exception when others then return false;
end $$;

create or replace function public.get_live_control_state(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; v_runs jsonb; v_count integer;
begin
  select * into s from public.live_sessions where id=p_session_id;
  if s.id is null or not app.can_manage_offering(s.offering_id) then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  select count(*)::integer into v_count from public.live_participants p where p.session_id=s.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'activity_id',r.activity_id,
    'title',r.title,'type',r.type,'config',r.config,'status',r.status,
    'paused',r.paused,'show_results',r.show_results,'opened_at',r.opened_at,'closed_at',r.closed_at,
    'results',app.live_results(r.id,true)) order by r.opened_at,r.id),'[]'::jsonb)
    into v_runs from public.live_runs r where r.session_id=s.id;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'offering_id',s.offering_id,
    'lesson_id',s.lesson_id,'code',s.code,'status',s.status,'access_mode',s.access_mode,
    'ask_name',s.ask_name,'ask_company',s.ask_company,'created_at',s.created_at,
    'ended_at',s.ended_at),'activities',public.get_live_activities(s.lesson_id),
    'runs',v_runs,'participant_count',v_count);
end $$;

create or replace function public.get_live_state(p_code text,p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; p public.live_participants%rowtype;
  r public.live_runs%rowtype; v_answer jsonb; v_run jsonb;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or
     p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Credenciales inválidas' using errcode='42501'; end if;
  select * into s from public.live_sessions where code=p_code;
  select * into p from public.live_participants
    where session_id=s.id and token_hash=extensions.digest(decode(p_token,'hex'),'sha256');
  if s.id is null or p.id is null then
    raise exception 'Credenciales inválidas' using errcode='42501'; end if;
  v_run:=null; v_answer:=null;
  if s.status='active' then
    select * into r from public.live_runs where session_id=s.id order by opened_at desc,id desc limit 1;
    if r.id is not null then
      select a.answer into v_answer from public.live_responses a
        where a.run_id=r.id and a.participant_id=p.id and not a.hidden;
      v_run:=jsonb_build_object('id',r.id,'title',r.title,'type',r.type,'config',r.config,
        'status',r.status,'paused',r.paused,'show_results',r.show_results,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'results',case when r.show_results then app.live_results(r.id,false) else null end);
    end if;
  end if;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'code',s.code,
    'status',s.status,'ask_name',s.ask_name,'ask_company',s.ask_company),
    'participant',jsonb_build_object('id',p.id,'name',p.name,'company',p.company),
    'run',v_run,'my_response',v_answer);
end $$;

create or replace function public.get_projector_state(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; r public.live_runs%rowtype; v_run jsonb;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'Código inválido' using errcode='42501'; end if;
  select * into s from public.live_sessions where code=p_code;
  if s.id is null then raise exception 'Clase no disponible' using errcode='42501'; end if;
  v_run:=null;
  if s.status='active' then
    select * into r from public.live_runs where session_id=s.id order by opened_at desc,id desc limit 1;
    if r.id is not null then
      v_run:=jsonb_build_object('id',r.id,'title',r.title,'type',r.type,'config',r.config,
        'status',r.status,'paused',r.paused,'show_results',r.show_results,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'results',case when r.show_results then app.live_results(r.id,false) else null end);
    end if;
  end if;
  return jsonb_build_object('session',jsonb_build_object('code',s.code,'status',s.status),
    'run',v_run);
end $$;

create or replace function public.submit_live_response(p_code text,p_token text,p_run_id uuid,p_answer jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; p public.live_participants%rowtype; r public.live_runs%rowtype;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or
     p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Credenciales inválidas' using errcode='42501'; end if;
  select * into s from public.live_sessions where code=p_code for update;
  if s.id is null or s.status<>'active' then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  select * into p from public.live_participants
    where session_id=s.id and token_hash=extensions.digest(decode(p_token,'hex'),'sha256');
  select * into r from public.live_runs where id=p_run_id and session_id=s.id for update;
  if p.id is null or r.id is null or r.status<>'open' or r.paused or
     not app.live_valid_answer(r.type,r.config,p_answer) then
    raise exception 'Respuesta no disponible o inválida' using errcode='23514'; end if;
  insert into public.live_responses(tenant_id,run_id,participant_id,answer)
    values(s.tenant_id,r.id,p.id,p_answer)
    on conflict(run_id,participant_id) do update set answer=excluded.answer,submitted_at=now();
  return public.get_live_state(s.code,p_token);
end $$;

create or replace function public.set_live_run_paused(p_run_id uuid,p_paused boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or p_paused is null or r.status<>'open' or
     not app.live_manage_session(r.session_id) then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  update public.live_runs set paused=p_paused where id=r.id;
  return public.get_live_control_state(r.session_id);
end $$;

revoke all on function app.live_valid_activity(text,jsonb) from public,anon,authenticated;
revoke all on function public.get_live_control_state(uuid),public.set_live_run_paused(uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.get_live_control_state(uuid),public.set_live_run_paused(uuid,boolean)
  to authenticated;
revoke all on function public.get_live_state(text,text),public.get_projector_state(text),
  public.submit_live_response(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_live_state(text,text),public.get_projector_state(text),
  public.submit_live_response(text,text,uuid,jsonb) to anon,authenticated;
