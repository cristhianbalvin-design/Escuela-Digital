create function public.join_live_session(p_code text,p_name text,p_company text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; v_token text; v_user uuid; v_participant uuid;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or
     length(coalesce(p_name,''))>200 or length(coalesce(p_company,''))>200 then
    raise exception 'Código o datos inválidos' using errcode='23514'; end if;
  select * into s from public.live_sessions where code=p_code for update;
  if s.id is null or s.status<>'active' then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  v_user:=auth.uid();
  if s.access_mode='enrolled' or (s.access_mode='both' and v_user is not null and
     exists(select 1 from public.enrollments e where e.offering_id=s.offering_id
       and e.user_id=v_user and e.status in ('active','completed'))) then
    if v_user is null or not exists(select 1 from public.enrollments e
      join public.tenant_members tm on tm.tenant_id=e.tenant_id and tm.user_id=e.user_id
      where e.offering_id=s.offering_id and e.tenant_id=s.tenant_id and e.user_id=v_user
        and e.status in ('active','completed') and tm.status='active' and tm.role='student') then
      raise exception 'Matrícula no disponible' using errcode='42501'; end if;
  elsif s.access_mode='guest' or s.access_mode='both' then
    v_user:=null;
  else
    raise exception 'Acceso no disponible' using errcode='42501';
  end if;
  if s.ask_name and length(btrim(coalesce(p_name,'')))=0 then
    raise exception 'Nombre requerido' using errcode='23514'; end if;
  if s.ask_company and length(btrim(coalesce(p_company,'')))=0 then
    raise exception 'Empresa requerida' using errcode='23514'; end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  if v_user is not null then
    select id into v_participant from public.live_participants
      where session_id=s.id and user_id=v_user for update;
  end if;
  if v_participant is null then
    insert into public.live_participants(tenant_id,session_id,token_hash,user_id,name,company)
      values(s.tenant_id,s.id,extensions.digest(decode(v_token,'hex'),'sha256'),v_user,
        case when s.ask_name then btrim(p_name) end,case when s.ask_company then btrim(p_company) end)
      returning id into v_participant;
  else
    update public.live_participants set token_hash=extensions.digest(decode(v_token,'hex'),'sha256'),
      name=case when s.ask_name then btrim(p_name) end,
      company=case when s.ask_company then btrim(p_company) end where id=v_participant;
  end if;
  return jsonb_build_object('token',v_token,'state',public.get_live_state(s.code,v_token));
end $$;

create function public.get_live_state(p_code text,p_token text) returns jsonb
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
        'status',r.status,'show_results',r.show_results,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'results',case when r.show_results then app.live_results(r.id,false) else null end);
    end if;
  end if;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'code',s.code,
    'status',s.status,'ask_name',s.ask_name,'ask_company',s.ask_company),
    'participant',jsonb_build_object('id',p.id,'name',p.name,'company',p.company),
    'run',v_run,'my_response',v_answer);
end $$;

create function public.submit_live_response(p_code text,p_token text,p_run_id uuid,p_answer jsonb) returns jsonb
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
  if p.id is null or r.id is null or r.status<>'open' or
     not app.live_valid_answer(r.type,r.config,p_answer) then
    raise exception 'Respuesta no disponible o inválida' using errcode='23514'; end if;
  insert into public.live_responses(tenant_id,run_id,participant_id,answer)
    values(s.tenant_id,r.id,p.id,p_answer)
    on conflict(run_id,participant_id) do update set answer=excluded.answer,submitted_at=now();
  return public.get_live_state(s.code,p_token);
end $$;

create function public.get_projector_state(p_code text) returns jsonb
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
        'status',r.status,'show_results',r.show_results,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'results',case when r.show_results then app.live_results(r.id,false) else null end);
    end if;
  end if;
  return jsonb_build_object('session',jsonb_build_object('code',s.code,'status',s.status),
    'run',v_run);
end $$;

-- Las cuatro RPC del enlace público admiten anon y authenticated; el token sólo se devuelve al ingresar.
revoke all on function public.join_live_session(text,text,text),public.get_live_state(text,text),
  public.submit_live_response(text,text,uuid,jsonb),public.get_projector_state(text)
  from public,anon,authenticated;
grant execute on function public.join_live_session(text,text,text),public.get_live_state(text,text),
  public.submit_live_response(text,text,uuid,jsonb),public.get_projector_state(text)
  to anon,authenticated;
