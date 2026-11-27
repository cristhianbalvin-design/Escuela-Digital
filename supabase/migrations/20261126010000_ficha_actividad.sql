-- Ficha de actividad por bloque del guion: guía estructurada + herramienta enchufable.
-- Parte pública (la ve el alumno cuando el docente la publica) y parte privada (solo gestores).
-- La herramienta puede ser: 'none' (sin herramienta), 'native' (actividades en vivo de SENDA del bloque)
-- o 'external' (otro sitio web que se abre en otra pestaña; SENDA no ejecuta ni verifica esa herramienta).

create table if not exists public.plan_item_sheets (
  item_id uuid primary key references public.lesson_plan_items(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tool_kind text not null default 'none' check (tool_kind in ('none', 'native', 'external')),
  tool_name text check (tool_name is null or length(tool_name) between 1 and 80),
  tool_url text check (tool_url is null or (length(tool_url) <= 500 and tool_url ~ '^https://[^[:space:]<>"'']+$')),
  tool_feature text check (tool_feature is null or length(tool_feature) between 1 and 120),
  objective text not null default '' check (length(objective) <= 600),
  context_md text not null default '' check (length(context_md) <= 6000),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 20),
  prompts jsonb not null default '[]'::jsonb check (jsonb_typeof(prompts) = 'array' and jsonb_array_length(prompts) <= 10),
  resources jsonb not null default '[]'::jsonb check (jsonb_typeof(resources) = 'array' and jsonb_array_length(resources) <= 15),
  deliverable_md text not null default '' check (length(deliverable_md) <= 3000),
  teacher jsonb not null default '{}'::jsonb check (jsonb_typeof(teacher) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists plan_item_sheets_lesson on public.plan_item_sheets(lesson_id);
alter table public.plan_item_sheets enable row level security;
revoke all on public.plan_item_sheets from anon, authenticated;

-- Qué bloque tiene publicado el docente para los alumnos de la clase en vivo (uno a la vez).
alter table public.live_sessions
  add column if not exists published_item_id uuid references public.lesson_plan_items(id) on delete set null,
  add column if not exists published_at timestamptz;

-- Registro de publicaciones y retiros.
create table if not exists public.plan_sheet_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  item_id uuid,
  action text not null check (action in ('publish', 'unpublish')),
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists plan_sheet_events_session on public.plan_sheet_events(session_id);
alter table public.plan_sheet_events enable row level security;
revoke all on public.plan_sheet_events from anon, authenticated;

-- Validación estricta del documento de la ficha (la misma regla se repite en el cliente con zod).
create or replace function app.sheet_clean(p_sheet jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb; k text; v jsonb; ids text[] := '{}'; pid text;
  steps jsonb; prompts jsonb; resources jsonb; teacher jsonb;
  tool_kind text; tool_name text; tool_url text; tool_feature text;
begin
  if p_sheet is null or jsonb_typeof(p_sheet) <> 'object'
     or p_sheet - 'tool_kind' - 'tool_name' - 'tool_url' - 'tool_feature' - 'objective' - 'context_md'
        - 'steps' - 'prompts' - 'resources' - 'deliverable_md' - 'teacher' <> '{}'::jsonb then
    raise exception 'Ficha inválida' using errcode = '23514'; end if;

  tool_kind := coalesce(p_sheet->>'tool_kind', 'none');
  if tool_kind not in ('none', 'native', 'external') then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  foreach k in array array['tool_name', 'tool_url', 'tool_feature', 'objective', 'context_md', 'deliverable_md'] loop
    if p_sheet ? k and jsonb_typeof(p_sheet->k) not in ('string', 'null') then
      raise exception 'Ficha inválida' using errcode = '23514'; end if;
  end loop;
  tool_name := nullif(btrim(coalesce(p_sheet->>'tool_name', '')), '');
  tool_url := nullif(btrim(coalesce(p_sheet->>'tool_url', '')), '');
  tool_feature := nullif(btrim(coalesce(p_sheet->>'tool_feature', '')), '');
  if tool_name is not null and length(tool_name) > 80 then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  if tool_feature is not null and length(tool_feature) > 120 then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  if tool_url is not null and (length(tool_url) > 500 or tool_url !~ '^https://[^[:space:]<>"'']+$') then
    raise exception 'El enlace debe empezar con https://' using errcode = '23514'; end if;
  if length(coalesce(p_sheet->>'objective', '')) > 600 or length(coalesce(p_sheet->>'context_md', '')) > 6000
     or length(coalesce(p_sheet->>'deliverable_md', '')) > 3000 then
    raise exception 'Ficha inválida' using errcode = '23514'; end if;

  prompts := coalesce(p_sheet->'prompts', '[]'::jsonb);
  if jsonb_typeof(prompts) <> 'array' or jsonb_array_length(prompts) > 10 then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  for x in select value from jsonb_array_elements(prompts) loop
    if jsonb_typeof(x) <> 'object' or x - 'id' - 'title' - 'text' <> '{}'::jsonb
       or jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'title') is distinct from 'string'
       or jsonb_typeof(x->'text') is distinct from 'string'
       or length(x->>'id') not between 1 and 40 or (x->>'id') !~ '^[A-Za-z0-9_-]+$'
       or length(btrim(x->>'title')) not between 1 and 120 or length(btrim(x->>'text')) not between 1 and 6000
       or (x->>'id') = any(ids) then
      raise exception 'Prompt inválido' using errcode = '23514'; end if;
    ids := array_append(ids, x->>'id');
  end loop;

  steps := coalesce(p_sheet->'steps', '[]'::jsonb);
  if jsonb_typeof(steps) <> 'array' or jsonb_array_length(steps) > 20 then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  for x in select value from jsonb_array_elements(steps) loop
    if jsonb_typeof(x) <> 'object' or x - 'text' - 'minutes' - 'prompt_id' <> '{}'::jsonb
       or jsonb_typeof(x->'text') is distinct from 'string' or length(btrim(x->>'text')) not between 1 and 1000
       or (x ? 'minutes' and jsonb_typeof(x->'minutes') not in ('number', 'null'))
       or (x ? 'prompt_id' and jsonb_typeof(x->'prompt_id') not in ('string', 'null')) then
      raise exception 'Paso inválido' using errcode = '23514'; end if;
    if jsonb_typeof(x->'minutes') = 'number' and ((x->>'minutes') !~ '^[0-9]{1,3}$' or (x->>'minutes')::int not between 1 and 240) then
      raise exception 'Paso inválido' using errcode = '23514'; end if;
    pid := case when jsonb_typeof(x->'prompt_id') = 'string' then x->>'prompt_id' else null end;
    if pid is not null and not (pid = any(ids)) then raise exception 'Paso inválido' using errcode = '23514'; end if;
  end loop;

  resources := coalesce(p_sheet->'resources', '[]'::jsonb);
  if jsonb_typeof(resources) <> 'array' or jsonb_array_length(resources) > 15 then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  for x in select value from jsonb_array_elements(resources) loop
    if jsonb_typeof(x) <> 'object' or x - 'name' - 'audience' - 'status' <> '{}'::jsonb
       or jsonb_typeof(x->'name') is distinct from 'string' or length(btrim(x->>'name')) not between 1 and 150
       or (x->>'audience') is null or (x->>'audience') not in ('students', 'teacher')
       or (x->>'status') is null or (x->>'status') not in ('pending', 'ready') then
      raise exception 'Recurso inválido' using errcode = '23514'; end if;
  end loop;

  teacher := coalesce(p_sheet->'teacher', '{}'::jsonb);
  if jsonb_typeof(teacher) <> 'object'
     or teacher - 'intro' - 'prep' - 'expected' - 'solution' - 'rubric' - 'errors' - 'contingency' - 'closing' <> '{}'::jsonb then
    raise exception 'Ficha inválida' using errcode = '23514'; end if;
  for k, v in select * from jsonb_each(teacher) loop
    if jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 6000 then raise exception 'Ficha inválida' using errcode = '23514'; end if;
  end loop;

  return jsonb_build_object(
    'tool_kind', tool_kind, 'tool_name', tool_name, 'tool_url', tool_url, 'tool_feature', tool_feature,
    'objective', btrim(coalesce(p_sheet->>'objective', '')), 'context_md', coalesce(p_sheet->>'context_md', ''),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('text', btrim(s.value->>'text'),
        'minutes', case when jsonb_typeof(s.value->'minutes') = 'number' then (s.value->>'minutes')::int else null end,
        'prompt_id', case when jsonb_typeof(s.value->'prompt_id') = 'string' then s.value->>'prompt_id' else null end)
      order by s.ordinality), '[]'::jsonb) from jsonb_array_elements(steps) with ordinality s(value, ordinality)),
    'prompts', (select coalesce(jsonb_agg(jsonb_build_object('id', s.value->>'id', 'title', btrim(s.value->>'title'),
        'text', s.value->>'text') order by s.ordinality), '[]'::jsonb) from jsonb_array_elements(prompts) with ordinality s(value, ordinality)),
    'resources', (select coalesce(jsonb_agg(jsonb_build_object('name', btrim(s.value->>'name'), 'audience', s.value->>'audience',
        'status', s.value->>'status') order by s.ordinality), '[]'::jsonb) from jsonb_array_elements(resources) with ordinality s(value, ordinality)),
    'deliverable_md', coalesce(p_sheet->>'deliverable_md', ''),
    'teacher', teacher);
end $$;
revoke all on function app.sheet_clean(jsonb) from public, anon, authenticated;

-- Proyección completa para gestores.
create or replace function app.sheet_json(s public.plan_item_sheets) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('item_id', s.item_id, 'tool_kind', s.tool_kind, 'tool_name', s.tool_name, 'tool_url', s.tool_url,
    'tool_feature', s.tool_feature, 'objective', s.objective, 'context_md', s.context_md, 'steps', s.steps, 'prompts', s.prompts,
    'resources', s.resources, 'deliverable_md', s.deliverable_md, 'teacher', s.teacher, 'updated_at', s.updated_at);
$$;
revoke all on function app.sheet_json(public.plan_item_sheets) from public, anon, authenticated;

create or replace function public.get_plan_item_sheets(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(app.sheet_json(s) order by s.item_id), '[]'::jsonb)
    from public.plan_item_sheets s where s.lesson_id = p_lesson_id);
end $$;
revoke all on function public.get_plan_item_sheets(uuid) from public, anon;
grant execute on function public.get_plan_item_sheets(uuid) to authenticated;

-- p_sheet null borra la ficha del bloque.
create or replace function public.save_plan_item_sheet(p_lesson_id uuid, p_item_id uuid, p_sheet jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.lessons%rowtype; c jsonb; r public.plan_item_sheets%rowtype;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  select * into l from public.lessons where id = p_lesson_id;
  if not exists (select 1 from public.lesson_plan_items i where i.id = p_item_id and i.lesson_id = p_lesson_id and i.tenant_id = l.tenant_id) then
    raise exception 'Bloque no disponible' using errcode = '23514'; end if;
  if p_sheet is null or p_sheet = 'null'::jsonb then
    delete from public.plan_item_sheets where item_id = p_item_id;
    return null;
  end if;
  c := app.sheet_clean(p_sheet);
  insert into public.plan_item_sheets(item_id, lesson_id, tenant_id, tool_kind, tool_name, tool_url, tool_feature, objective,
    context_md, steps, prompts, resources, deliverable_md, teacher, updated_at)
  values (p_item_id, l.id, l.tenant_id, c->>'tool_kind', c->>'tool_name', c->>'tool_url', c->>'tool_feature', c->>'objective',
    c->>'context_md', c->'steps', c->'prompts', c->'resources', c->>'deliverable_md', c->'teacher', now())
  on conflict (item_id) do update set tool_kind = excluded.tool_kind, tool_name = excluded.tool_name, tool_url = excluded.tool_url,
    tool_feature = excluded.tool_feature, objective = excluded.objective, context_md = excluded.context_md, steps = excluded.steps,
    prompts = excluded.prompts, resources = excluded.resources, deliverable_md = excluded.deliverable_md, teacher = excluded.teacher,
    updated_at = now();
  select * into r from public.plan_item_sheets where item_id = p_item_id;
  return app.sheet_json(r);
end $$;
revoke all on function public.save_plan_item_sheet(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_plan_item_sheet(uuid, uuid, jsonb) to authenticated;

-- Publicar (p_item_id) o retirar (null) la ficha de un bloque para los alumnos de la clase en vivo.
create or replace function public.publish_plan_item_sheet(p_session_id uuid, p_item_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype;
begin
  select * into s from public.live_sessions where id = p_session_id for update;
  if s.id is null or not app.live_manage_session(p_session_id) or s.status <> 'active' then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  if p_item_id is not null and not exists (
    select 1 from public.plan_item_sheets x where x.item_id = p_item_id and x.lesson_id = s.lesson_id and x.tenant_id = s.tenant_id) then
    raise exception 'El bloque no tiene ficha' using errcode = '23514'; end if;
  if s.published_item_id is distinct from p_item_id then
    update public.live_sessions set published_item_id = p_item_id, published_at = case when p_item_id is null then null else now() end
      where id = s.id;
    insert into public.plan_sheet_events(tenant_id, session_id, item_id, action, actor_id)
      values (s.tenant_id, s.id, coalesce(p_item_id, s.published_item_id), case when p_item_id is null then 'unpublish' else 'publish' end, auth.uid());
  end if;
  return jsonb_build_object('item_id', p_item_id, 'published_at', (select published_at from public.live_sessions where id = s.id));
end $$;
revoke all on function public.publish_plan_item_sheet(uuid, uuid) from public, anon;
grant execute on function public.publish_plan_item_sheet(uuid, uuid) to authenticated;

create or replace function public.get_session_publication(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype;
begin
  select * into s from public.live_sessions where id = p_session_id;
  if s.id is null or not app.live_manage_session(p_session_id) then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  return jsonb_build_object('item_id', s.published_item_id, 'published_at', s.published_at);
end $$;
revoke all on function public.get_session_publication(uuid) from public, anon;
grant execute on function public.get_session_publication(uuid) to authenticated;

-- Lo único que ve el alumno: la parte pública de la ficha publicada, nunca la parte privada.
create or replace function public.get_live_published_sheet(p_code text, p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; p public.live_participants%rowtype; f public.plan_item_sheets%rowtype; i public.lesson_plan_items%rowtype;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Credenciales inválidas' using errcode = '42501'; end if;
  select * into s from public.live_sessions where code = p_code;
  select * into p from public.live_participants where session_id = s.id and token_hash = extensions.digest(decode(p_token, 'hex'), 'sha256');
  if s.id is null or p.id is null then raise exception 'Credenciales inválidas' using errcode = '42501'; end if;
  if s.status <> 'active' or s.published_item_id is null then return null; end if;
  select * into f from public.plan_item_sheets where item_id = s.published_item_id and lesson_id = s.lesson_id and tenant_id = s.tenant_id;
  select * into i from public.lesson_plan_items where id = s.published_item_id;
  if f.item_id is null or i.id is null then return null; end if;
  return jsonb_build_object('item_id', f.item_id, 'title', i.title, 'minutes', i.minutes, 'published_at', s.published_at,
    'tool_kind', f.tool_kind, 'tool_name', f.tool_name, 'tool_url', f.tool_url, 'tool_feature', f.tool_feature,
    'objective', f.objective, 'context_md', f.context_md, 'steps', f.steps, 'prompts', f.prompts,
    'resources', (select coalesce(jsonb_agg(r.value order by r.ordinality), '[]'::jsonb)
      from jsonb_array_elements(f.resources) with ordinality r(value, ordinality) where r.value->>'audience' = 'students'),
    'deliverable_md', f.deliverable_md);
end $$;
revoke all on function public.get_live_published_sheet(text, text) from public;
grant execute on function public.get_live_published_sheet(text, text) to anon, authenticated;
