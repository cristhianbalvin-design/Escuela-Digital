-- Estado de cada bloque durante una clase en vivo, con cronómetro persistente.
-- Sin fila = pendiente. Solo un bloque corre a la vez. El tiempo transcurrido se guarda en el servidor,
-- así sobrevive a recargas y cambios de dispositivo.
create table if not exists public.live_block_states (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  item_id uuid not null references public.lesson_plan_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  state text not null check (state in ('active', 'paused', 'done', 'skipped')),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  running_since timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id, item_id),
  check ((state = 'active') = (running_since is not null))
);
alter table public.live_block_states enable row level security;
revoke all on public.live_block_states from anon, authenticated;

create or replace function public.get_session_blocks(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_session(p_session_id) then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  return jsonb_build_object('server_now', now(), 'blocks', coalesce((select jsonb_agg(jsonb_build_object(
    'item_id', b.item_id, 'state', b.state, 'elapsed_seconds', b.elapsed_seconds, 'running_since', b.running_since)
    order by b.updated_at) from public.live_block_states b where b.session_id = p_session_id), '[]'::jsonb));
end $$;
revoke all on function public.get_session_blocks(uuid) from public, anon;
grant execute on function public.get_session_blocks(uuid) to authenticated;

-- Acciones: start (inicia o reanuda), pause, finish, skip, reset. Iniciar un bloque pausa el que estaba corriendo.
create or replace function public.set_session_block(p_session_id uuid, p_item_id uuid, p_action text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; b public.live_block_states%rowtype;
begin
  select * into s from public.live_sessions where id = p_session_id for update;
  if s.id is null or not app.live_manage_session(p_session_id) or s.status <> 'active' then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'pause', 'finish', 'skip', 'reset') then
    raise exception 'Acción inválida' using errcode = '23514'; end if;
  if not exists (select 1 from public.lesson_plan_items i where i.id = p_item_id and i.lesson_id = s.lesson_id and i.tenant_id = s.tenant_id) then
    raise exception 'Bloque no disponible' using errcode = '23514'; end if;
  select * into b from public.live_block_states where session_id = s.id and item_id = p_item_id;

  if p_action = 'start' then
    update public.live_block_states x set state = 'paused', elapsed_seconds = x.elapsed_seconds + greatest(0, extract(epoch from now() - x.running_since)::int),
      running_since = null, updated_at = now() where x.session_id = s.id and x.state = 'active' and x.item_id <> p_item_id;
    insert into public.live_block_states(session_id, item_id, tenant_id, state, elapsed_seconds, running_since)
      values (s.id, p_item_id, s.tenant_id, 'active', case when b.state = 'done' then 0 else coalesce(b.elapsed_seconds, 0) end, now())
      on conflict (session_id, item_id) do update set state = 'active', running_since = now(), updated_at = now(),
        elapsed_seconds = case when public.live_block_states.state = 'done' then 0 else public.live_block_states.elapsed_seconds end
        where public.live_block_states.state <> 'active';
  elsif p_action = 'reset' then
    delete from public.live_block_states where session_id = s.id and item_id = p_item_id;
  else
    insert into public.live_block_states(session_id, item_id, tenant_id, state, elapsed_seconds, running_since)
      values (s.id, p_item_id, s.tenant_id, case p_action when 'pause' then 'paused' when 'finish' then 'done' else 'skipped' end, 0, null)
      on conflict (session_id, item_id) do update set
        elapsed_seconds = public.live_block_states.elapsed_seconds + case when public.live_block_states.state = 'active'
          then greatest(0, extract(epoch from now() - public.live_block_states.running_since)::int) else 0 end,
        state = case p_action when 'pause' then case when public.live_block_states.state = 'active' then 'paused' else public.live_block_states.state end
          when 'finish' then 'done' else 'skipped' end,
        running_since = null, updated_at = now();
  end if;
  return public.get_session_blocks(p_session_id);
end $$;
revoke all on function public.set_session_block(uuid, uuid, text) from public, anon;
grant execute on function public.set_session_block(uuid, uuid, text) to authenticated;
