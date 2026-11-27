-- Proyector de la ficha publicada: el proyector (solo con el código, como get_projector_state) muestra la parte
-- pública de la ficha, el tiempo del bloque y, si el docente lo elige, un prompt en grande.
alter table public.live_sessions add column if not exists projector_focus jsonb;
alter table public.live_sessions drop constraint if exists live_sessions_projector_focus_chk;
alter table public.live_sessions add constraint live_sessions_projector_focus_chk check (
  projector_focus is null or (jsonb_typeof(projector_focus) = 'object'
    and projector_focus ? 'item_id' and projector_focus ? 'prompt_id'
    and length(projector_focus->>'prompt_id') between 1 and 40));

create or replace function public.set_projector_prompt(p_session_id uuid, p_prompt_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; f public.plan_item_sheets%rowtype;
begin
  select * into s from public.live_sessions where id = p_session_id for update;
  if s.id is null or not app.live_manage_session(p_session_id) or s.status <> 'active' then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  if p_prompt_id is null then
    update public.live_sessions set projector_focus = null where id = s.id;
    return jsonb_build_object('item_id', s.published_item_id, 'prompt_id', null);
  end if;
  if length(p_prompt_id) not between 1 and 40 or s.published_item_id is null then
    raise exception 'Prompt no disponible' using errcode = '23514'; end if;
  select * into f from public.plan_item_sheets where item_id = s.published_item_id and lesson_id = s.lesson_id and tenant_id = s.tenant_id;
  if f.item_id is null or not exists (select 1 from jsonb_array_elements(f.prompts) x where x.value->>'id' = p_prompt_id) then
    raise exception 'Prompt no disponible' using errcode = '23514'; end if;
  update public.live_sessions set projector_focus = jsonb_build_object('item_id', f.item_id, 'prompt_id', p_prompt_id) where id = s.id;
  return jsonb_build_object('item_id', f.item_id, 'prompt_id', p_prompt_id);
end $$;
revoke all on function public.set_projector_prompt(uuid, text) from public, anon;
grant execute on function public.set_projector_prompt(uuid, text) to authenticated;

create or replace function public.get_projector_sheet(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; f public.plan_item_sheets%rowtype; i public.lesson_plan_items%rowtype; b public.live_block_states%rowtype; focus text;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'Código inválido' using errcode = '22023'; end if;
  select * into s from public.live_sessions where code = p_code;
  if s.id is null or s.status <> 'active' or s.published_item_id is null then return null; end if;
  select * into f from public.plan_item_sheets where item_id = s.published_item_id and lesson_id = s.lesson_id and tenant_id = s.tenant_id;
  select * into i from public.lesson_plan_items where id = s.published_item_id;
  if f.item_id is null or i.id is null then return null; end if;
  select * into b from public.live_block_states where session_id = s.id and item_id = f.item_id;
  if s.projector_focus->>'item_id' = f.item_id::text
     and exists (select 1 from jsonb_array_elements(f.prompts) x where x.value->>'id' = s.projector_focus->>'prompt_id') then
    focus := s.projector_focus->>'prompt_id'; end if;
  return jsonb_build_object(
    'sheet', jsonb_build_object('item_id', f.item_id, 'title', i.title, 'minutes', i.minutes, 'published_at', s.published_at,
      'tool_kind', f.tool_kind, 'tool_name', f.tool_name, 'tool_url', f.tool_url, 'tool_feature', f.tool_feature,
      'objective', f.objective, 'context_md', f.context_md, 'steps', f.steps, 'prompts', f.prompts,
      'resources', (select coalesce(jsonb_agg(jsonb_build_object('idx', r.ordinality - 1, 'name', r.value->>'name', 'audience', 'students',
          'status', r.value->>'status') order by r.ordinality), '[]'::jsonb)
        from jsonb_array_elements(f.resources) with ordinality r(value, ordinality) where r.value->>'audience' = 'students'),
      'deliverable_md', f.deliverable_md),
    'focus_prompt', focus,
    'block', case when b.item_id is null then null else jsonb_build_object('state', b.state, 'elapsed_seconds', b.elapsed_seconds, 'running_since', b.running_since) end,
    'server_now', now());
end $$;
revoke all on function public.get_projector_sheet(text) from public;
grant execute on function public.get_projector_sheet(text) to anon, authenticated;
