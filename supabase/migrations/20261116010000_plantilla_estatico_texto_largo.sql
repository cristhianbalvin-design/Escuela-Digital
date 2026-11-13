-- Texto largo en respuestas abiertas, Plantilla guiada, comparativa no ciega y cuestionario estático.
alter table public.live_activities drop constraint if exists live_activities_type_check;
alter table public.live_activities add constraint live_activities_type_check
  check (type in ('poll_single','poll_multi','vote','wordcloud','open','scale','quiz','compare','opportunity','template'));
alter table public.live_sets drop constraint if exists live_sets_kind_check;
alter table public.live_sets add constraint live_sets_kind_check
  check (kind in ('survey','static_quiz','dynamic_quiz','compare','opportunity','template'));

create or replace function app.live_public_config(p_type text,p_config jsonb,p_reveal boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_reveal then p_config
    when p_type='quiz' then p_config - 'correct' - 'explanation'
    when p_type='compare' and coalesce((p_config->>'blind')::boolean,true) then jsonb_set(p_config,'{options}',coalesce((
      select jsonb_agg(o.value - 'real_name' order by o.ordinality)
      from jsonb_array_elements(p_config->'options') with ordinality o(value,ordinality)), '[]'::jsonb))
    when p_type='static_quiz' then jsonb_set(p_config,'{questions}',coalesce((
      select jsonb_agg(case when q.value->>'type'='quiz'
        then jsonb_set(q.value,'{config}',(q.value->'config') - 'correct' - 'explanation') else q.value end order by q.ordinality)
      from jsonb_array_elements(p_config->'questions') with ordinality q(value,ordinality)), '[]'::jsonb))
    else p_config end;
$$;

create or replace function app.live_static_score(p_config jsonb,p_answer jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'correct',(select count(*)::integer from jsonb_array_elements(p_config->'questions') q
      where q->>'type'='quiz' and p_answer->'answers'->>(q->>'id') = q->'config'->>'correct'),
    'total',(select count(*)::integer from jsonb_array_elements(p_config->'questions') q where q->>'type'='quiz'));
$$;
revoke all on function app.live_static_score(jsonb,jsonb) from public, anon, authenticated;

do $$
declare d text; o text;
begin
  -- Validación de actividades
  d := pg_get_functiondef('app.live_valid_activity(text,jsonb)'::regprocedure);
  o := E'elsif p_type = ''open'' then\n    return p_config = ''{}''::jsonb;';
  if position(o in d) = 0 then raise exception 'patch open (actividad) no aplica'; end if;
  d := replace(d, o, E'elsif p_type = ''open'' then\n    return p_config - ''max_length'' = ''{}''::jsonb and (not p_config ? ''max_length'' or (jsonb_typeof(p_config->''max_length'')=''number'' and (p_config->>''max_length'') ~ ''^[0-9]{3,4}$'' and (p_config->>''max_length'')::integer between 280 and 4000));');
  o := 'p_config - ''description'' - ''options'' - ''criteria'' - ''scale_max'' - ''final_question'' - ''ask_comment'' - ''comment_max''<>''{}''::jsonb';
  if position(o in d) = 0 then raise exception 'patch compare no aplica'; end if;
  d := replace(d, o, 'p_config - ''description'' - ''options'' - ''criteria'' - ''scale_max'' - ''final_question'' - ''ask_comment'' - ''comment_max'' - ''blind''<>''{}''::jsonb or (p_config ? ''blind'' and jsonb_typeof(p_config->''blind'')<>''boolean'')');
  o := 'elsif p_type=''opportunity'' then';
  if position(o in d) = 0 then raise exception 'patch template (actividad) no aplica'; end if;
  execute replace(d, o, E'elsif p_type=''template'' then\n'
    '    if p_config - ''fields'' <> ''{}''::jsonb or jsonb_typeof(p_config->''fields'') is distinct from ''array''\n'
    '       or jsonb_array_length(p_config->''fields'') not between 1 and 15 then return false; end if;\n'
    '    for x in select value from jsonb_array_elements(p_config->''fields'') loop\n'
    '      if jsonb_typeof(x) is distinct from ''object'' or x - ''id'' - ''label'' - ''kind'' - ''required'' - ''options'' - ''help'' <> ''{}''::jsonb\n'
    '         or jsonb_typeof(x->''id'') is distinct from ''string'' or length(btrim(x->>''id'')) not between 1 and 100 or x->>''id''=any(v_ids)\n'
    '         or jsonb_typeof(x->''label'') is distinct from ''string'' or length(btrim(x->>''label'')) not between 1 and 200\n'
    '         or x->>''kind'' is null or x->>''kind'' not in (''text'',''long'',''select'')\n'
    '         or (x ? ''required'' and jsonb_typeof(x->''required'')<>''boolean'')\n'
    '         or (x ? ''help'' and (jsonb_typeof(x->''help'')<>''string'' or length(x->>''help'')>300))\n'
    '         or (x->>''kind''=''select'' and (jsonb_typeof(x->''options'') is distinct from ''array'' or jsonb_array_length(x->''options'') not between 2 and 20\n'
    '             or exists(select 1 from jsonb_array_elements(x->''options'') e where jsonb_typeof(e)<>''string'' or length(btrim(e#>>''{}'')) not between 1 and 80)))\n'
    '         or (x->>''kind''<>''select'' and x ? ''options'') then return false; end if;\n'
    '      v_ids:=array_append(v_ids,x->>''id'');\n'
    '    end loop;\n'
    '    return true;\n'
    '  elsif p_type=''opportunity'' then');

  -- Validación de respuestas
  d := pg_get_functiondef('app.live_valid_answer(text,jsonb,jsonb)'::regprocedure);
  o := 'return jsonb_typeof(p_answer)=''string'' and length(btrim(p_answer#>>''{}'')) between 1 and 280;';
  if position(o in d) = 0 then raise exception 'patch open (respuesta) no aplica'; end if;
  d := replace(d, o, 'return jsonb_typeof(p_answer)=''string'' and length(btrim(p_answer#>>''{}'')) between 1 and coalesce((p_config->>''max_length'')::integer,280);');
  o := 'elsif p_type=''opportunity'' then';
  if position(o in d) = 0 then raise exception 'patch template (respuesta) no aplica'; end if;
  execute replace(d, o, E'elsif p_type=''template'' then\n'
    '    return jsonb_typeof(p_answer)=''object''\n'
    '      and not exists(select 1 from jsonb_each(p_answer) e where jsonb_typeof(e.value)<>''string'' or not exists(\n'
    '        select 1 from jsonb_array_elements(p_config->''fields'') f where f->>''id''=e.key\n'
    '          and length(e.value#>>''{}'') <= case f->>''kind'' when ''long'' then 4000 else 300 end\n'
    '          and (f->>''kind''<>''select'' or length(e.value#>>''{}'')=0 or f->''options'' ? (e.value#>>''{}''))))\n'
    '      and not exists(select 1 from jsonb_array_elements(p_config->''fields'') f\n'
    '        where coalesce((f->>''required'')::boolean,false) and length(btrim(coalesce(p_answer->>(f->>''id''),'''')))=0);\n'
    '  elsif p_type=''static_quiz'' then\n'
    '    if jsonb_typeof(p_answer)<>''object'' or p_answer - ''answers'' - ''done'' <> ''{}''::jsonb\n'
    '       or jsonb_typeof(p_answer->''answers'')<>''object'' or jsonb_typeof(p_answer->''done'')<>''boolean'' then return false; end if;\n'
    '    return not exists(select 1 from jsonb_each(p_answer->''answers'') e where not exists(\n'
    '      select 1 from jsonb_array_elements(p_config->''questions'') q\n'
    '      where q->>''id''=e.key and q->>''type''<>''static_quiz'' and app.live_valid_answer(q->>''type'',q->''config'',e.value)));\n'
    '  elsif p_type=''opportunity'' then');

  -- Resultados
  d := pg_get_functiondef('app.live_results(uuid,boolean)'::regprocedure);
  o := 'elsif r.type in (''open'',''opportunity'') then';
  if position(o in d) = 0 then raise exception 'patch resultados (lista) no aplica'; end if;
  d := replace(d, o, 'elsif r.type in (''open'',''opportunity'',''template'') then');
  o := '''real_name'',case when r.reveal or p_control then';
  if position(o in d) = 0 then raise exception 'patch resultados (comparativa) no aplica'; end if;
  d := replace(d, o, '''real_name'',case when r.reveal or p_control or not coalesce((r.config->>''blind'')::boolean,true) then');
  o := 'case when r.type=''compare'' and (r.reveal or p_control) then jsonb_build_object(''comments'',v_comments) else ''{}''::jsonb end;';
  if position(o in d) = 0 then raise exception 'patch resultados (final) no aplica'; end if;
  execute replace(d, o, 'case when r.type=''compare'' and (r.reveal or p_control) then jsonb_build_object(''comments'',v_comments) else ''{}''::jsonb end ||
    case when r.type=''static_quiz'' then jsonb_build_object(
      ''completed'',(select count(*)::integer from public.live_responses a
        where a.run_id=r.id and not a.hidden and coalesce((a.answer->>''done'')::boolean,false)),
      ''questions'',(select coalesce(jsonb_agg(jsonb_build_object(''id'',q.value->>''id'',''title'',q.value->>''title'',''type'',q.value->>''type'',
        ''answered'',(select count(*)::integer from public.live_responses a where a.run_id=r.id and not a.hidden and a.answer->''answers'' ? (q.value->>''id'')),
        ''correct_percent'',case when q.value->>''type''=''quiz'' and (r.reveal or p_control) then (select case when count(*)=0 then 0 else
          round(count(*) filter (where a.answer->''answers''->>(q.value->>''id'') = q.value->''config''->>''correct'')*100.0/count(*))::integer end
          from public.live_responses a where a.run_id=r.id and not a.hidden and a.answer->''answers'' ? (q.value->>''id'')) else null end,
        ''options'',coalesce((select jsonb_agg(jsonb_build_object(''id'',o.value->>''id'',''label'',o.value->>''label'',
          ''count'',(select count(*)::integer from public.live_responses a where a.run_id=r.id and not a.hidden and
            (a.answer->''answers''->>(q.value->>''id'') = o.value->>''id'' or (jsonb_typeof(a.answer->''answers''->(q.value->>''id''))=''array'' and a.answer->''answers''->(q.value->>''id'') ? (o.value->>''id'')))),
          ''correct'',case when q.value->>''type''=''quiz'' and (r.reveal or p_control) then o.value->>''id''=q.value->''config''->>''correct'' else null end) order by o.ordinality)
          from jsonb_array_elements(q.value->''config''->''options'') with ordinality o(value,ordinality)),''[]''::jsonb))
        order by q.ordinality),''[]''::jsonb) from jsonb_array_elements(r.config->''questions'') with ordinality q(value,ordinality)))
    else ''{}''::jsonb end;');

  -- Puntaje propio del cuestionario estático
  d := pg_get_functiondef('public.get_live_state(text,text)'::regprocedure);
  o := '''run'',v_run,''my_response'',v_answer) ||';
  if position(o in d) = 0 then raise exception 'patch estado no aplica'; end if;
  execute replace(d, o, '''run'',v_run,''my_response'',v_answer,''my_score'',case when v_run is not null and r.type=''static_quiz'' and coalesce((v_answer->>''done'')::boolean,false) then app.live_static_score(r.config,v_answer) else null end) ||');

  -- Al terminar el cuestionario, el alumno ya no puede cambiar sus respuestas.
  d := pg_get_functiondef('public.submit_live_response(text,text,uuid,jsonb)'::regprocedure);
  o := '(r.type=''quiz'' and r.reveal) or';
  if position(o in d) = 0 then raise exception 'patch envío no aplica'; end if;
  execute replace(d, o, '(r.type=''quiz'' and r.reveal) or
     (r.type=''static_quiz'' and exists(select 1 from public.live_responses x where x.run_id=r.id and x.participant_id=p.id and coalesce((x.answer->>''done'')::boolean,false))) or');

  -- El bloque se marca al cerrar el cuestionario estático, que agrupa todas sus preguntas.
  d := pg_get_functiondef('app.live_mark_plan_done(uuid)'::regprocedure);
  o := 'where r2.activity_id=a2.id and r2.session_id=s.id and r2.status=''closed''';
  if position(o in d) = 0 then raise exception 'patch marcado no aplica'; end if;
  execute replace(d, o, 'where (r2.activity_id=a2.id or r2.config->''questions'' @> jsonb_build_array(jsonb_build_object(''id'',a2.id::text))) and r2.session_id=s.id and r2.status=''closed''');

  d := pg_get_functiondef('public.save_live_set(uuid,jsonb)'::regprocedure);
  o := 'if v_kind not in (''survey'',''static_quiz'',''dynamic_quiz'',''compare'',''opportunity'')';
  if position(o in d) = 0 then raise exception 'patch tipos de actividad no aplica'; end if;
  execute replace(d, o, 'if v_kind not in (''survey'',''static_quiz'',''dynamic_quiz'',''compare'',''opportunity'',''template'')');
end $$;

-- Lanzar un cuestionario estático: una sola ronda con todas sus preguntas; cada alumno avanza a su ritmo.
create or replace function public.launch_live_set(p_session_id uuid, p_set_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; st public.live_sets%rowtype; v_first uuid; v_questions jsonb;
begin
  select * into s from public.live_sessions where id=p_session_id for update;
  if s.id is null or not app.can_manage_offering(s.offering_id) or s.status<>'active' then
    raise exception 'Clase no disponible' using errcode='42501'; end if;
  select * into st from public.live_sets where id=p_set_id and lesson_id=s.lesson_id;
  if st.id is null or st.kind<>'static_quiz' then
    raise exception 'Actividad no disponible' using errcode='23514'; end if;
  if exists(select 1 from public.live_runs where session_id=s.id and status='open') then
    raise exception 'Hay una ronda abierta' using errcode='23514'; end if;
  select (array_agg(a.id order by a.position))[1],
    coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'type',a.type,'config',a.config) order by a.position),'[]'::jsonb)
    into v_first, v_questions from public.live_activities a where a.set_id=st.id and a.type<>'compare';
  if v_first is null then raise exception 'La actividad no tiene preguntas' using errcode='23514'; end if;
  insert into public.live_runs(tenant_id,session_id,activity_id,title,type,config)
    values(s.tenant_id,s.id,v_first,st.title,'static_quiz',jsonb_build_object('questions',v_questions));
  return public.get_live_control_state(s.id);
end $$;
revoke all on function public.launch_live_set(uuid,uuid) from public, anon, authenticated;
grant execute on function public.launch_live_set(uuid,uuid) to authenticated;
