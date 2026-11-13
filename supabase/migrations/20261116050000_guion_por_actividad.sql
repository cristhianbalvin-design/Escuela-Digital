-- Guion del docente para cada actividad interactiva y cada pregunta. Nunca llega a los alumnos.
create table if not exists public.live_teacher_notes (
  target_id uuid primary key,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  tenant_id uuid not null,
  notes text not null check (length(notes) <= 6000),
  updated_at timestamptz not null default now()
);
create index if not exists live_teacher_notes_lesson on public.live_teacher_notes(lesson_id);
alter table public.live_teacher_notes enable row level security;
revoke all on public.live_teacher_notes from anon, authenticated;

create or replace function app.live_notes_json(p_lesson_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('target_id', n.target_id, 'notes', n.notes) order by n.updated_at), '[]'::jsonb)
  from public.live_teacher_notes n where n.lesson_id = p_lesson_id
    and (exists(select 1 from public.live_sets s where s.id = n.target_id)
      or exists(select 1 from public.live_activities a where a.id = n.target_id));
$$;
revoke all on function app.live_notes_json(uuid) from public, anon, authenticated;

create or replace function public.get_live_notes(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  return app.live_notes_json(p_lesson_id);
end $$;

-- p_notes: [{target_id, notes}] con target = actividad (live_sets) o pregunta (live_activities) de la lección; vacío borra.
create or replace function public.save_live_notes(p_lesson_id uuid, p_notes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.lessons%rowtype; x jsonb; v_target uuid;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  if jsonb_typeof(p_notes) is distinct from 'array' or jsonb_array_length(p_notes) > 500 then
    raise exception 'Guion inválido' using errcode = '23514'; end if;
  select * into l from public.lessons where id = p_lesson_id;
  for x in select value from jsonb_array_elements(p_notes) loop
    if jsonb_typeof(x) is distinct from 'object' or x - 'target_id' - 'notes' <> '{}'::jsonb
       or jsonb_typeof(x->'target_id') is distinct from 'string'
       or (x->>'target_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x->'notes') is distinct from 'string' or length(x->>'notes') > 6000 then
      raise exception 'Guion inválido' using errcode = '23514'; end if;
    v_target := (x->>'target_id')::uuid;
    if not exists(select 1 from public.live_sets s where s.id = v_target and s.lesson_id = p_lesson_id)
       and not exists(select 1 from public.live_activities a where a.id = v_target and a.lesson_id = p_lesson_id) then
      raise exception 'Actividad no disponible' using errcode = '23514'; end if;
    if length(btrim(x->>'notes')) = 0 then
      delete from public.live_teacher_notes where target_id = v_target;
    else
      insert into public.live_teacher_notes(target_id, lesson_id, tenant_id, notes, updated_at)
      values (v_target, p_lesson_id, l.tenant_id, x->>'notes', now())
      on conflict (target_id) do update set notes = excluded.notes, updated_at = now();
    end if;
  end loop;
  return app.live_notes_json(p_lesson_id);
end $$;

revoke all on function public.get_live_notes(uuid), public.save_live_notes(uuid, jsonb) from public, anon;
grant execute on function public.get_live_notes(uuid), public.save_live_notes(uuid, jsonb) to authenticated;
