-- Clase en vivo: acceso exclusivamente por RPC. Las tablas no se exponen por PostgREST.
create table public.live_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  plan_item_id uuid references public.lesson_plan_items(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  type text not null check (type in ('poll_single','poll_multi','vote','wordcloud','open','scale')),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, lesson_id, id),
  unique (lesson_id, position)
);
create index live_activities_lesson_idx on public.live_activities(tenant_id, lesson_id, position);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offering_id uuid not null references public.offerings(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'active' check (status in ('active','ended')),
  access_mode text not null check (access_mode in ('enrolled','guest','both')),
  ask_name boolean not null,
  ask_company boolean not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null))
);
create unique index live_sessions_one_active_per_offering on public.live_sessions(offering_id) where status = 'active';
create index live_sessions_tenant_lesson_idx on public.live_sessions(tenant_id, lesson_id);

create table public.live_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  token_hash bytea not null unique,
  user_id uuid references auth.users(id) on delete set null,
  name text check (name is null or length(name) <= 200),
  company text check (company is null or length(company) <= 200),
  joined_at timestamptz not null default now(),
  unique (session_id, id)
);
create index live_participants_session_idx on public.live_participants(session_id);

create table public.live_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  activity_id uuid not null references public.live_activities(id) on delete restrict,
  title text not null,
  type text not null,
  config jsonb not null,
  status text not null default 'open' check (status in ('open','closed')),
  show_results boolean not null default false,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);
create unique index live_runs_one_open_per_session on public.live_runs(session_id) where status = 'open';
create index live_runs_session_idx on public.live_runs(session_id, opened_at desc);

create table public.live_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.live_runs(id) on delete cascade,
  participant_id uuid not null references public.live_participants(id) on delete cascade,
  answer jsonb not null,
  hidden boolean not null default false,
  pinned boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (run_id, participant_id)
);
create index live_responses_run_idx on public.live_responses(run_id);

create table public.live_term_moderation (
  run_id uuid not null references public.live_runs(id) on delete cascade,
  term text not null check (length(term) between 1 and 30),
  merged_into text check (merged_into is null or length(merged_into) between 1 and 30),
  hidden boolean not null default false,
  primary key (run_id, term),
  check (merged_into is null or merged_into <> term)
);

alter table public.live_activities enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_runs enable row level security;
alter table public.live_responses enable row level security;
alter table public.live_term_moderation enable row level security;
revoke all on public.live_activities, public.live_sessions, public.live_participants,
  public.live_runs, public.live_responses, public.live_term_moderation from public, anon, authenticated;

create function app.live_manage_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_edit_plan(p_lesson_id) or exists (
    select 1 from public.lessons l join public.offerings o
      on o.tenant_id = l.tenant_id and o.version_id = l.version_id
    where l.id = p_lesson_id and app.can_manage_offering(o.id));
$$;

create function app.live_manage_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.live_sessions s
    where s.id = p_session_id and app.can_manage_offering(s.offering_id));
$$;

create function app.live_normalize_term(p_term text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(p_term,'')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create function app.live_valid_activity(p_type text, p_config jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; v_ids text[] := '{}'; v_count integer; v_min integer; v_max integer;
begin
  if jsonb_typeof(p_config) <> 'object' then return false; end if;
  if p_type in ('poll_single','vote','poll_multi') then
    if p_config - 'options' - 'max_choices' <> '{}'::jsonb or
       (p_type <> 'poll_multi' and p_config ? 'max_choices') or
       jsonb_typeof(p_config->'options') <> 'array' then return false; end if;
    v_count := jsonb_array_length(p_config->'options');
    if v_count not between 2 and 20 then return false; end if;
    for x in select value from jsonb_array_elements(p_config->'options') loop
      if jsonb_typeof(x) <> 'object' or x - 'id' - 'label' <> '{}'::jsonb or
         jsonb_typeof(x->'id') <> 'string' or jsonb_typeof(x->'label') <> 'string' or
         length(btrim(x->>'id')) not between 1 and 100 or
         length(btrim(x->>'label')) not between 1 and 200 or
         x->>'id' = any(v_ids) then return false; end if;
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

create function app.live_valid_answer(p_type text, p_config jsonb, p_answer jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; v_ids text[] := '{}'; v_limit integer; v_value integer;
begin
  if p_type in ('poll_single','vote') then
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
  end if;
  return false;
exception when others then return false;
end $$;

-- El resultado público nunca incluye nombres ni respuestas ocultas.
create function app.live_results(p_run_id uuid, p_control boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.live_runs%rowtype; v_total integer; v_rows jsonb; v_average numeric; v_responses jsonb;
begin
  select * into r from public.live_runs where id=p_run_id;
  if r.id is null then raise exception 'Ronda no disponible' using errcode='42501'; end if;
  select count(*)::integer into v_total from public.live_responses a where a.run_id=r.id and not a.hidden;
  if r.type in ('poll_single','vote','poll_multi') then
    select coalesce(jsonb_agg(jsonb_build_object('id',o.value->>'id','label',o.value->>'label',
      'count',q.n,'percent',case when v_total=0 then 0 else round(q.n*100.0/v_total)::integer end)
      order by o.ordinality),'[]'::jsonb) into v_rows
    from jsonb_array_elements(r.config->'options') with ordinality o(value,ordinality)
    cross join lateral (select count(*)::integer n from public.live_responses a
      where a.run_id=r.id and not a.hidden and
      (a.answer=o.value->'id' or (r.type='poll_multi' and jsonb_typeof(a.answer)='array' and a.answer ? (o.value->>'id')))) q;
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
  if p_control then
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'answer',a.answer,'hidden',a.hidden,
      'pinned',a.pinned,'participant_name',case when p_control then p.name else null end)
      order by a.pinned desc,a.submitted_at,a.id),'[]'::jsonb) into v_responses
    from public.live_responses a join public.live_participants p on p.id=a.participant_id
    where a.run_id=r.id;
  elsif r.type = 'open' then
    -- Respuestas abiertas visibles: sin nombres; las ocultas nunca salen.
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'answer',a.answer,'hidden',false,
      'pinned',a.pinned,'participant_name',null) order by a.pinned desc,a.submitted_at,a.id),'[]'::jsonb)
      into v_responses from public.live_responses a where a.run_id=r.id and not a.hidden;
  else v_responses := '[]'::jsonb; end if;
  return jsonb_build_object('total',v_total,'rows',v_rows,'average',v_average,'responses',v_responses);
end $$;

revoke all on function app.live_manage_lesson(uuid),app.live_manage_session(uuid),
  app.live_normalize_term(text),app.live_valid_activity(text,jsonb),
  app.live_valid_answer(text,jsonb,jsonb),app.live_results(uuid,boolean)
  from public,anon,authenticated;
