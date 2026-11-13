-- Tipo `opportunity` (mapa de oportunidades) y quiz formativo (clasificar casos, sin puntos ni ranking).
alter table public.live_activities drop constraint if exists live_activities_type_check;
alter table public.live_activities add constraint live_activities_type_check
  check (type in ('poll_single','poll_multi','vote','wordcloud','open','scale','quiz','compare','opportunity'));

do $$
declare d text; o text; n text;
begin
  d := pg_get_functiondef('app.live_valid_activity(text,jsonb)'::regprocedure);
  o := 'p_config - ''options'' - ''correct'' - ''explanation'' - ''seconds'' - ''concept'' <> ''{}''::jsonb or';
  n := 'p_config - ''options'' - ''correct'' - ''explanation'' - ''seconds'' - ''concept'' - ''formative'' <> ''{}''::jsonb or (p_config ? ''formative'' and jsonb_typeof(p_config->''formative'') <> ''boolean'') or';
  if position(o in d) = 0 then raise exception 'patch quiz formativo no aplica'; end if;
  d := replace(d, o, n);
  o := 'elsif p_type=''compare'' then';
  n := 'elsif p_type=''opportunity'' then
    if p_config - ''areas'' - ''problems'' - ''solutions'' <> ''{}''::jsonb then return false; end if;
    return coalesce((select bool_and(jsonb_typeof(p_config->k)=''array'' and jsonb_array_length(p_config->k) between 2 and 20
      and not exists(select 1 from jsonb_array_elements(p_config->k) e where jsonb_typeof(e)<>''string'' or length(btrim(e#>>''{}'')) not between 1 and 80)
      and (select count(distinct e#>>''{}'') from jsonb_array_elements(p_config->k) e)=jsonb_array_length(p_config->k))
      from unnest(array[''areas'',''problems'',''solutions'']) k), false);
  elsif p_type=''compare'' then';
  if position(o in d) = 0 then raise exception 'patch opportunity (actividad) no aplica'; end if;
  execute replace(d, o, n);

  d := pg_get_functiondef('app.live_valid_answer(text,jsonb,jsonb)'::regprocedure);
  o := 'elsif p_type=''compare'' then';
  n := 'elsif p_type=''opportunity'' then
    return jsonb_typeof(p_answer)=''object'' and p_answer - ''area'' - ''process'' - ''task'' - ''problems'' - ''opportunity'' - ''solution'' - ''impact'' - ''ease'' = ''{}''::jsonb
      and jsonb_typeof(p_answer->''area'')=''string'' and p_config->''areas'' ? (p_answer->>''area'')
      and jsonb_typeof(p_answer->''solution'')=''string'' and p_config->''solutions'' ? (p_answer->>''solution'')
      and jsonb_typeof(p_answer->''process'')=''string'' and length(btrim(p_answer->>''process'')) between 1 and 120
      and jsonb_typeof(p_answer->''task'')=''string'' and length(btrim(p_answer->>''task'')) between 1 and 250
      and jsonb_typeof(p_answer->''opportunity'')=''string'' and length(btrim(p_answer->>''opportunity'')) between 1 and 400
      and jsonb_typeof(p_answer->''problems'')=''array'' and jsonb_array_length(p_answer->''problems'') between 1 and 20
      and not exists(select 1 from jsonb_array_elements(p_answer->''problems'') e where jsonb_typeof(e)<>''string'' or not (p_config->''problems'' ? (e#>>''{}'')))
      and jsonb_typeof(p_answer->''impact'')=''number'' and (p_answer->>''impact'') ~ ''^[1-5]$''
      and jsonb_typeof(p_answer->''ease'')=''number'' and (p_answer->>''ease'') ~ ''^[1-5]$'';
  elsif p_type=''compare'' then';
  if position(o in d) = 0 then raise exception 'patch opportunity (respuesta) no aplica'; end if;
  execute replace(d, o, n);

  -- Las oportunidades visibles se publican sin nombre, igual que las respuestas abiertas.
  d := pg_get_functiondef('app.live_results(uuid,boolean)'::regprocedure);
  o := 'elsif r.type = ''open'' then';
  if position(o in d) = 0 then raise exception 'patch live_results no aplica'; end if;
  execute replace(d, o, 'elsif r.type in (''open'',''opportunity'') then');

  -- El quiz formativo no suma puntos ni entra al ranking.
  d := pg_get_functiondef('app.live_rank_detail(uuid)'::regprocedure);
  o := 'lr.type=''quiz'' and (lr.status=''closed'' or lr.reveal)';
  if position(o in d) = 0 then raise exception 'patch ranking (rondas) no aplica'; end if;
  d := replace(d, o, o || ' and coalesce((lr.config->>''formative'')::boolean,false)=false');
  o := 'r2.type=''quiz'' order by';
  if position(o in d) = 0 then raise exception 'patch ranking (grupo) no aplica'; end if;
  execute replace(d, o, 'r2.type=''quiz'' and coalesce((r2.config->>''formative'')::boolean,false)=false order by');
end $$;
