-- Fase B+C: rondas competitivas y evaluación ciega. Acceso exclusivamente por RPC.
alter table public.live_activities drop constraint if exists live_activities_type_check;
alter table public.live_activities add constraint live_activities_type_check
  check (type in ('poll_single','poll_multi','vote','wordcloud','open','scale','quiz','compare'));
alter table public.live_runs add column reveal boolean not null default false;
alter table public.live_runs add column show_ranking boolean not null default false;

create or replace function app.live_public_config(p_type text,p_config jsonb,p_reveal boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_reveal then p_config
    when p_type='quiz' then p_config - 'correct' - 'explanation'
    when p_type='compare' then jsonb_set(p_config,'{options}',coalesce((
      select jsonb_agg(o.value - 'real_name' order by o.ordinality)
      from jsonb_array_elements(p_config->'options') with ordinality o(value,ordinality)), '[]'::jsonb))
    else p_config end;
$$;

create or replace function app.live_valid_activity(p_type text,p_config jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; v_ids text[] := '{}'; v_count integer; v_min integer; v_max integer;
begin
  if jsonb_typeof(p_config) <> 'object' then return false; end if;
  if p_config ? 'help' and (jsonb_typeof(p_config->'help') <> 'string' or
    length(btrim(p_config->>'help')) not between 1 and 200) then return false; end if;
  if p_config ? 'indicator_label' and (jsonb_typeof(p_config->'indicator_label') <> 'string' or
    length(btrim(p_config->>'indicator_label')) not between 1 and 60) then return false; end if;
  if p_type in ('quiz','compare') and p_config ? 'indicator_label' then return false; end if;
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
  elsif p_type='quiz' then
    if p_config - 'options' - 'correct' - 'explanation' - 'seconds' - 'concept' <> '{}'::jsonb or
       jsonb_typeof(p_config->'options') is distinct from 'array' or jsonb_typeof(p_config->'correct') is distinct from 'string' or
       jsonb_typeof(p_config->'seconds') is distinct from 'number' or (p_config->>'seconds') !~ '^[0-9]+$' or
       length(p_config->>'seconds')>3 or (p_config->>'seconds')::integer not between 5 and 120 or
       (p_config ? 'explanation' and (jsonb_typeof(p_config->'explanation')<>'string' or length(p_config->>'explanation')>400)) or
       (p_config ? 'concept' and (jsonb_typeof(p_config->'concept')<>'string' or length(p_config->>'concept')>80)) then return false; end if;
    if jsonb_array_length(p_config->'options') not between 2 and 6 then return false; end if;
    for x in select value from jsonb_array_elements(p_config->'options') loop
      if jsonb_typeof(x) is distinct from 'object' or x - 'id' - 'label'<>'{}'::jsonb or
         jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'label') is distinct from 'string' or
         length(btrim(x->>'id')) not between 1 and 100 or length(btrim(x->>'label')) not between 1 and 200 or
         x->>'id'=any(v_ids) then return false; end if;
      v_ids:=array_append(v_ids,x->>'id');
    end loop;
    return p_config->>'correct'=any(v_ids);
  elsif p_type='compare' then
    if p_config - 'description' - 'options' - 'criteria' - 'scale_max' - 'final_question' - 'ask_comment' - 'comment_max'<>'{}'::jsonb or
       jsonb_typeof(p_config->'options') is distinct from 'array' or jsonb_typeof(p_config->'criteria') is distinct from 'array' or
       jsonb_typeof(p_config->'final_question') is distinct from 'string' or length(p_config->>'final_question')>200 or
       jsonb_typeof(p_config->'ask_comment') is distinct from 'boolean' or
       jsonb_typeof(p_config->'comment_max') is distinct from 'number' or (p_config->>'comment_max') !~ '^[0-9]+$' or
       length(p_config->>'comment_max')>3 or (p_config->>'comment_max')::integer not between 0 and 200 or
       (p_config ? 'description' and (jsonb_typeof(p_config->'description')<>'string' or length(p_config->>'description')>2000)) or
       (p_config ? 'scale_max' and (jsonb_typeof(p_config->'scale_max')<>'number' or
         (p_config->>'scale_max') !~ '^[0-9]+$' or length(p_config->>'scale_max')>2 or
         (p_config->>'scale_max')::integer not between 3 and 10)) then return false; end if;
    if jsonb_array_length(p_config->'options') not between 2 and 5 or
       jsonb_array_length(p_config->'criteria') not between 1 and 10 then return false; end if;
    for x in select value from jsonb_array_elements(p_config->'options') loop
      if jsonb_typeof(x) is distinct from 'object' or x - 'id' - 'label' - 'content' - 'real_name'<>'{}'::jsonb or
         jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'label') is distinct from 'string' or
         jsonb_typeof(x->'content') is distinct from 'string' or jsonb_typeof(x->'real_name') is distinct from 'string' or
         length(btrim(x->>'id')) not between 1 and 100 or length(btrim(x->>'label')) not between 1 and 200 or
         length(x->>'content')>20000 or length(x->>'real_name')>60 or x->>'id'=any(v_ids) then return false; end if;
      v_ids:=array_append(v_ids,x->>'id');
    end loop;
    v_ids:='{}';
    for x in select value from jsonb_array_elements(p_config->'criteria') loop
      if jsonb_typeof(x) is distinct from 'object' or x - 'id' - 'label' - 'description'<>'{}'::jsonb or
         jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'label') is distinct from 'string' or
         jsonb_typeof(x->'description') is distinct from 'string' or length(btrim(x->>'id')) not between 1 and 100 or
         length(btrim(x->>'label')) not between 1 and 80 or length(x->>'description')>300 or
         x->>'id'=any(v_ids) then return false; end if;
      v_ids:=array_append(v_ids,x->>'id');
    end loop;
    return true;
  end if;
  return false;
exception when others then return false;
end $$;

create or replace function app.live_rank_detail(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with rounds as (
    select id,config,opened_at from public.live_runs
    where session_id=p_session_id and type='quiz' and (status='closed' or reveal)
  ), attempts as (
    select p.id participant_id,coalesce(p.name,'Participante') name,r.id run_id,r.opened_at,
      (a.id is not null) answered,
      (a.answer=to_jsonb(r.config->>'correct') and not a.hidden) correct,
      case when a.answer=to_jsonb(r.config->>'correct') and not a.hidden then
        round(500 + 500 * greatest(0,(r.config->>'seconds')::numeric -
          extract(epoch from (a.submitted_at-r.opened_at))) / (r.config->>'seconds')::numeric)::integer
      else 0 end points
    from public.live_participants p cross join rounds r
    left join public.live_responses a on a.run_id=r.id and a.participant_id=p.id
    where p.session_id=p_session_id
  ), grouped as (
    select *,sum(case when correct then 0 else 1 end) over
      (partition by participant_id order by opened_at,run_id) streak_group
    from attempts
  ), streaks as (
    select *,case when correct then sum(case when correct then 1 else 0 end) over
      (partition by participant_id,streak_group order by opened_at,run_id) else 0 end streak
    from grouped
  ), totals as (
    select p.id participant_id,coalesce(p.name,'Participante') name,
      coalesce(sum(s.points),0)::integer points,
      count(*) filter (where s.correct)::integer correct,
      count(*) filter (where s.answered)::integer answered,
      coalesce(max(s.streak),0)::integer best_streak,
      coalesce((array_agg(s.streak order by s.opened_at desc,s.run_id desc))[1],0)::integer streak_current
    from public.live_participants p left join streaks s on s.participant_id=p.id
    where p.session_id=p_session_id group by p.id,p.name
  ), ranked as (
    select *,row_number() over (order by points desc,correct desc,answered desc,participant_id)::integer rank
    from totals
  )
  select coalesce(jsonb_agg(to_jsonb(ranked) order by rank),'[]'::jsonb) from ranked;
$$;

create or replace function app.live_ranking(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.value - 'streak_current' order by x.ordinality),'[]'::jsonb)
  from jsonb_array_elements(app.live_rank_detail(p_session_id)) with ordinality x(value,ordinality);
$$;

create or replace function app.live_results(p_run_id uuid,p_control boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.live_runs%rowtype; v_total integer; v_rows jsonb; v_average numeric; v_responses jsonb;
  v_matrix jsonb; v_comments jsonb; v_correct_percent integer; v_avg_seconds numeric;
begin
  select * into r from public.live_runs where id=p_run_id;
  if r.id is null then raise exception 'Ronda no disponible' using errcode='42501'; end if;
  select count(*)::integer into v_total from public.live_responses a where a.run_id=r.id and not a.hidden;
  if r.type in ('poll_single','vote','poll_multi','quiz') then
    select coalesce(jsonb_agg(jsonb_build_object('id',o.value->>'id','label',o.value->>'label',
      'count',q.n,'percent',case when v_total=0 then 0 else round(q.n*100.0/v_total)::integer end) ||
      case when r.type='quiz' then jsonb_build_object('correct',case when r.reveal or p_control then o.value->>'id'=r.config->>'correct' else null end) else '{}'::jsonb end
      order by o.ordinality),'[]'::jsonb) into v_rows
    from jsonb_array_elements(r.config->'options') with ordinality o(value,ordinality)
    cross join lateral (select count(*)::integer n from public.live_responses a
      where a.run_id=r.id and not a.hidden and
      (a.answer=o.value->'id' or (r.type='poll_multi' and jsonb_typeof(a.answer)='array' and a.answer ? (o.value->>'id')))) q;
    if r.type='quiz' and (r.reveal or p_control) then
      select case when v_total=0 then 0 else round(count(*) filter (where a.answer=to_jsonb(r.config->>'correct'))*100.0/v_total)::integer end,
        avg(greatest(0,extract(epoch from (a.submitted_at-r.opened_at))))
      into v_correct_percent,v_avg_seconds from public.live_responses a where a.run_id=r.id and not a.hidden;
    end if;
  elsif r.type='scale' then
    select coalesce(jsonb_agg(jsonb_build_object('value',v.n,'count',q.n,
      'percent',case when v_total=0 then 0 else round(q.n*100.0/v_total)::integer end)
      order by v.n),'[]'::jsonb) into v_rows
    from generate_series((r.config->>'scale_min')::integer,(r.config->>'scale_max')::integer) v(n)
    cross join lateral (select count(*)::integer n from public.live_responses a
      where a.run_id=r.id and not a.hidden and a.answer=to_jsonb(v.n)) q;
    select avg((a.answer#>>'{}')::numeric) into v_average from public.live_responses a
      where a.run_id=r.id and not a.hidden;
  elsif r.type='wordcloud' then
    with terms as (select app.live_normalize_term(x.value#>>'{}') term
      from public.live_responses a cross join lateral jsonb_array_elements(a.answer) x(value)
      where a.run_id=r.id and not a.hidden), mapped as (
      select coalesce(m.merged_into,t.term) term from terms t
      left join public.live_term_moderation m on m.run_id=r.id and m.term=t.term
      left join public.live_term_moderation target on target.run_id=r.id and target.term=m.merged_into
      where coalesce(m.hidden,false)=false and coalesce(target.hidden,false)=false)
    select coalesce(jsonb_agg(jsonb_build_object('term',q.term,'count',q.n) order by q.n desc,q.term),'[]'::jsonb)
      into v_rows from (select term,count(*)::integer n from mapped group by term) q;
  else v_rows := '[]'::jsonb;
  end if;
  if r.type='compare' then
    select coalesce(jsonb_agg(jsonb_build_object('option_id',o.value->>'id','label',o.value->>'label',
      'real_name',case when r.reveal or p_control then o.value->>'real_name' else null end,
      'criteria',coalesce((select jsonb_agg(jsonb_build_object('criterion_id',c.value->>'id',
        'average',(select avg((a.answer->'ratings'->(o.value->>'id')->>(c.value->>'id'))::numeric)
          from public.live_responses a where a.run_id=r.id and not a.hidden)) order by c.ordinality)
        from jsonb_array_elements(r.config->'criteria') with ordinality c(value,ordinality)),'[]'::jsonb),
      'overall',(select avg((cell.value#>>'{}')::numeric) from public.live_responses a
        cross join lateral jsonb_each(a.answer->'ratings'->(o.value->>'id')) cell
        where a.run_id=r.id and not a.hidden),
      'votes',q.votes,'vote_percent',case when v_total=0 then 0 else round(q.votes*100.0/v_total)::integer end)
      order by o.ordinality),'[]'::jsonb) into v_matrix
    from jsonb_array_elements(r.config->'options') with ordinality o(value,ordinality)
    cross join lateral (select count(*)::integer votes from public.live_responses a
      where a.run_id=r.id and not a.hidden and a.answer->>'choice'=o.value->>'id') q;
    if r.reveal or p_control then
      select coalesce(jsonb_agg(a.answer->>'comment' order by a.submitted_at,a.id),'[]'::jsonb)
      into v_comments from public.live_responses a where a.run_id=r.id and not a.hidden and a.answer ? 'comment';
    end if;
  end if;
  if p_control then
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'answer',a.answer,'hidden',a.hidden,
      'pinned',a.pinned,'participant_name',case when p_control then p.name else null end)
      order by a.pinned desc,a.submitted_at,a.id),'[]'::jsonb) into v_responses
    from public.live_responses a join public.live_participants p on p.id=a.participant_id
    where a.run_id=r.id;
  elsif r.type = 'open' then
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'answer',a.answer,'hidden',false,
      'pinned',a.pinned,'participant_name',null) order by a.pinned desc,a.submitted_at,a.id),'[]'::jsonb)
      into v_responses from public.live_responses a where a.run_id=r.id and not a.hidden;
  else v_responses := '[]'::jsonb; end if;
  return jsonb_build_object('total',v_total,'rows',v_rows,'average',v_average,'responses',v_responses) ||
    case when r.type='quiz' and (r.reveal or p_control) then jsonb_build_object('correct_percent',v_correct_percent,'avg_seconds',v_avg_seconds) else '{}'::jsonb end ||
    case when r.type='compare' then jsonb_build_object('matrix',v_matrix) else '{}'::jsonb end ||
    case when r.type='compare' and (r.reveal or p_control) then jsonb_build_object('comments',v_comments) else '{}'::jsonb end;
end $$;

create or replace function app.live_valid_answer(p_type text,p_config jsonb,p_answer jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; v_ids text[] := '{}'; v_limit integer; v_value integer; v_option jsonb; v_criterion jsonb; v_cells jsonb;
begin
  if p_type in ('poll_single','vote','quiz') then
    return jsonb_typeof(p_answer)='string' and exists (
      select 1 from jsonb_array_elements(p_config->'options') o where o->>'id'=p_answer#>>'{}');
  elsif p_type = 'poll_multi' then
    if jsonb_typeof(p_answer)<>'array' then return false; end if;
    v_limit := coalesce((p_config->>'max_choices')::integer,jsonb_array_length(p_config->'options'));
    if jsonb_array_length(p_answer) not between 1 and v_limit then return false; end if;
    for x in select value from jsonb_array_elements(p_answer) loop
      if jsonb_typeof(x)<>'string' or x#>>'{}'=any(v_ids) or not exists (
        select 1 from jsonb_array_elements(p_config->'options') o where o->>'id'=x#>>'{}') then return false; end if;
      v_ids := array_append(v_ids,x#>>'{}');
    end loop;
    return true;
  elsif p_type='wordcloud' then
    if jsonb_typeof(p_answer)<>'array' or
       jsonb_array_length(p_answer) not between 1 and (p_config->>'max_answers')::integer then return false; end if;
    for x in select value from jsonb_array_elements(p_answer) loop
      if jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 30 or
         app.live_normalize_term(x#>>'{}')='' then return false; end if;
    end loop;
    return true;
  elsif p_type='open' then
    return jsonb_typeof(p_answer)='string' and length(btrim(p_answer#>>'{}')) between 1 and 280;
  elsif p_type='scale' then
    if jsonb_typeof(p_answer)<>'number' or (p_answer#>>'{}') !~ '^-?[0-9]+$' then return false; end if;
    v_value := (p_answer#>>'{}')::integer;
    return v_value between (p_config->>'scale_min')::integer and (p_config->>'scale_max')::integer;
  elsif p_type='compare' then
    if jsonb_typeof(p_answer)<>'object' or p_answer - 'ratings' - 'choice' - 'comment'<>'{}'::jsonb or
       jsonb_typeof(p_answer->'ratings')<>'object' or jsonb_typeof(p_answer->'choice')<>'string' or
       not exists(select 1 from jsonb_array_elements(p_config->'options') o where o->>'id'=p_answer->>'choice') or
       (p_answer ? 'comment' and (coalesce((p_config->>'ask_comment')::boolean,false)=false or
         jsonb_typeof(p_answer->'comment')<>'string' or length(p_answer->>'comment')>(p_config->>'comment_max')::integer)) or
       (select count(*) from jsonb_object_keys(p_answer->'ratings'))<>jsonb_array_length(p_config->'options') then return false; end if;
    for v_option in select value from jsonb_array_elements(p_config->'options') loop
      v_cells:=p_answer->'ratings'->(v_option->>'id');
      if jsonb_typeof(v_cells)<>'object' or
         (select count(*) from jsonb_object_keys(v_cells))<>jsonb_array_length(p_config->'criteria') then return false; end if;
      for v_criterion in select value from jsonb_array_elements(p_config->'criteria') loop
        x:=v_cells->(v_criterion->>'id');
        if jsonb_typeof(x) is distinct from 'number' or (x#>>'{}') !~ '^[0-9]+$' or length(x#>>'{}')>2 or
           (x#>>'{}')::integer not between 1 and coalesce((p_config->>'scale_max')::integer,5) then return false; end if;
      end loop;
    end loop;
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
    'paused',r.paused,'show_results',r.show_results,'reveal',r.reveal,'show_ranking',r.show_ranking,
    'opened_at',r.opened_at,'closed_at',r.closed_at,
    'results',app.live_results(r.id,true)) order by r.opened_at,r.id),'[]'::jsonb)
    into v_runs from public.live_runs r where r.session_id=s.id;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'offering_id',s.offering_id,
    'lesson_id',s.lesson_id,'code',s.code,'status',s.status,'access_mode',s.access_mode,
    'ask_name',s.ask_name,'ask_company',s.ask_company,'created_at',s.created_at,
    'ended_at',s.ended_at),'activities',public.get_live_activities(s.lesson_id),
    'runs',v_runs,'participant_count',v_count,'ranking',app.live_ranking(s.id));
end $$;

create or replace function public.get_live_state(p_code text,p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; p public.live_participants%rowtype;
  r public.live_runs%rowtype; v_answer jsonb; v_run jsonb; v_ranking jsonb; v_my_rank jsonb;
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
      v_run:=jsonb_build_object('id',r.id,'title',r.title,'type',r.type,
        'config',app.live_public_config(r.type,r.config,r.reveal),
        'status',r.status,'paused',r.paused,'show_results',r.show_results,
        'reveal',r.reveal,'show_ranking',r.show_ranking,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'results',case when r.show_results then app.live_results(r.id,false) else null end);
      if r.show_ranking then
        select coalesce(jsonb_agg(x.value - 'streak_current' order by x.ordinality),'[]'::jsonb)
        into v_ranking from (select * from jsonb_array_elements(app.live_rank_detail(s.id)) with ordinality limit 5) x(value,ordinality);
        select jsonb_build_object('rank',(x.value->>'rank')::integer,'points',(x.value->>'points')::integer,
          'streak_current',(x.value->>'streak_current')::integer) into v_my_rank
        from jsonb_array_elements(app.live_rank_detail(s.id)) x(value)
        where x.value->>'participant_id'=p.id::text;
      end if;
    end if;
  end if;
  return jsonb_build_object('session',jsonb_build_object('id',s.id,'code',s.code,
    'status',s.status,'ask_name',s.ask_name,'ask_company',s.ask_company),
    'participant',jsonb_build_object('id',p.id,'name',p.name,'company',p.company),
    'run',v_run,'my_response',v_answer) ||
    case when r.show_ranking and v_run is not null then jsonb_build_object('ranking',v_ranking,'my_rank',v_my_rank) else '{}'::jsonb end;
end $$;

create or replace function public.get_projector_state(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; r public.live_runs%rowtype; v_run jsonb; v_ranking jsonb;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'Código inválido' using errcode='42501'; end if;
  select * into s from public.live_sessions where code=p_code;
  if s.id is null then raise exception 'Clase no disponible' using errcode='42501'; end if;
  v_run:=null;
  if s.status='active' then
    select * into r from public.live_runs where session_id=s.id order by opened_at desc,id desc limit 1;
    if r.id is not null then
      v_run:=jsonb_build_object('id',r.id,'title',r.title,'type',r.type,
        'config',app.live_public_config(r.type,r.config,r.reveal),
        'status',r.status,'paused',r.paused,'show_results',r.show_results,
        'reveal',r.reveal,'show_ranking',r.show_ranking,'opened_at',r.opened_at,
        'closed_at',r.closed_at,'results',case when r.show_results then app.live_results(r.id,false) else null end);
      if r.show_ranking then
        select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into v_ranking
        from (select * from jsonb_array_elements(app.live_ranking(s.id)) with ordinality limit 5) x(value,ordinality);
      end if;
    end if;
  end if;
  return jsonb_build_object('session',jsonb_build_object('code',s.code,'status',s.status),'run',v_run) ||
    case when r.show_ranking and v_run is not null then jsonb_build_object('ranking',v_ranking) else '{}'::jsonb end;
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
     (r.type='quiz' and r.reveal) or
     (r.type='quiz' and now()>r.opened_at + (r.config->>'seconds')::integer*interval '1 second' + interval '1 second') or
     not app.live_valid_answer(r.type,r.config,p_answer) then
    raise exception 'Respuesta no disponible o inválida' using errcode='23514'; end if;
  if r.type='quiz' then
    insert into public.live_responses(tenant_id,run_id,participant_id,answer)
      values(s.tenant_id,r.id,p.id,p_answer) on conflict(run_id,participant_id) do nothing;
  else
    insert into public.live_responses(tenant_id,run_id,participant_id,answer)
      values(s.tenant_id,r.id,p.id,p_answer)
      on conflict(run_id,participant_id) do update set answer=excluded.answer,submitted_at=now();
  end if;
  return public.get_live_state(s.code,p_token);
end $$;

create or replace function public.set_live_run_reveal(p_run_id uuid,p_reveal boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or p_reveal is null or not app.live_manage_session(r.session_id) then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  update public.live_runs set reveal=p_reveal where id=r.id;
  return public.get_live_control_state(r.session_id);
end $$;

create or replace function public.set_live_run_ranking(p_run_id uuid,p_show boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.live_runs%rowtype;
begin
  select * into r from public.live_runs where id=p_run_id for update;
  if r.id is null or p_show is null or not app.live_manage_session(r.session_id) then
    raise exception 'Ronda no disponible' using errcode='42501'; end if;
  update public.live_runs set show_ranking=p_show where id=r.id;
  return public.get_live_control_state(r.session_id);
end $$;

revoke all on function app.live_public_config(text,jsonb,boolean),app.live_valid_activity(text,jsonb),
  app.live_valid_answer(text,jsonb,jsonb),app.live_rank_detail(uuid),app.live_ranking(uuid),
  app.live_results(uuid,boolean) from public,anon,authenticated;
revoke all on function public.set_live_run_reveal(uuid,boolean),public.set_live_run_ranking(uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.set_live_run_reveal(uuid,boolean),public.set_live_run_ranking(uuid,boolean)
  to authenticated;
revoke all on function public.get_live_control_state(uuid) from public,anon,authenticated;
grant execute on function public.get_live_control_state(uuid) to authenticated;
revoke all on function public.get_live_state(text,text),public.get_projector_state(text),
  public.submit_live_response(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_live_state(text,text),public.get_projector_state(text),
  public.submit_live_response(text,text,uuid,jsonb) to anon,authenticated;

-- Los puntos y las rachas se derivan de todas las rondas ya reveladas o cerradas.
