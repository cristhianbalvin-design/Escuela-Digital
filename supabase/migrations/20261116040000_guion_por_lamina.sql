-- Guion del docente por lámina; sobrevive al reemplazo del PDF (se guarda por número de lámina).
create table if not exists public.lesson_slide_notes (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  slide integer not null check (slide between 1 and 300),
  tenant_id uuid not null,
  notes text not null check (length(notes) <= 6000),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, slide)
);
alter table public.lesson_slide_notes enable row level security;
revoke all on public.lesson_slide_notes from anon, authenticated;

create or replace function app.slide_notes_json(p_lesson_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slide', n.slide, 'notes', n.notes) order by n.slide), '[]'::jsonb)
  from public.lesson_slide_notes n where n.lesson_id = p_lesson_id;
$$;
revoke all on function app.slide_notes_json(uuid) from public, anon, authenticated;

create or replace function public.get_slide_notes(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  return app.slide_notes_json(p_lesson_id);
end $$;

-- p_notes: [{slide, notes}]; un texto vacío borra la nota de esa lámina.
create or replace function public.save_slide_notes(p_lesson_id uuid, p_notes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.lessons%rowtype; x jsonb;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  if jsonb_typeof(p_notes) is distinct from 'array' or jsonb_array_length(p_notes) > 300 then
    raise exception 'Guion inválido' using errcode = '23514'; end if;
  select * into l from public.lessons where id = p_lesson_id;
  for x in select value from jsonb_array_elements(p_notes) loop
    if jsonb_typeof(x) is distinct from 'object' or x - 'slide' - 'notes' <> '{}'::jsonb
       or jsonb_typeof(x->'slide') is distinct from 'number' or (x->>'slide') !~ '^[0-9]{1,3}$'
       or (x->>'slide')::integer not between 1 and 300
       or jsonb_typeof(x->'notes') is distinct from 'string' or length(x->>'notes') > 6000 then
      raise exception 'Guion inválido' using errcode = '23514'; end if;
    if length(btrim(x->>'notes')) = 0 then
      delete from public.lesson_slide_notes where lesson_id = p_lesson_id and slide = (x->>'slide')::integer;
    else
      insert into public.lesson_slide_notes(lesson_id, slide, tenant_id, notes, updated_at)
      values (p_lesson_id, (x->>'slide')::integer, l.tenant_id, x->>'notes', now())
      on conflict (lesson_id, slide) do update set notes = excluded.notes, updated_at = now();
    end if;
  end loop;
  return app.slide_notes_json(p_lesson_id);
end $$;

revoke all on function public.get_slide_notes(uuid), public.save_slide_notes(uuid, jsonb) from public, anon;
grant execute on function public.get_slide_notes(uuid), public.save_slide_notes(uuid, jsonb) to authenticated;

-- Láminas a 3840 px: margen para imágenes de hasta 15 MB.
update storage.buckets set file_size_limit = 15728640 where id = 'presentations';
