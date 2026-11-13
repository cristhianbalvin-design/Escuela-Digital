-- Presentación (PDF convertido en láminas) por sesión y pantalla del proyector controlada por el docente.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('presentations', 'presentations', true, 5242880, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;

-- Ruta: <lesson_id>/<carpeta>/<n>.jpg
create or replace function app.can_edit_presentation_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{1,3}\.(jpg|webp|png)$' then
    return false; end if;
  return app.live_manage_lesson(split_part(p_name, '/', 1)::uuid);
end $$;
revoke all on function app.can_edit_presentation_path(text) from public, anon;
grant execute on function app.can_edit_presentation_path(text) to authenticated;

drop policy if exists presentation_upload on storage.objects;
create policy presentation_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'presentations' and app.can_edit_presentation_path(name));
drop policy if exists presentation_update on storage.objects;
create policy presentation_update on storage.objects for update to authenticated
  using (bucket_id = 'presentations' and app.can_edit_presentation_path(name))
  with check (bucket_id = 'presentations' and app.can_edit_presentation_path(name));
drop policy if exists presentation_delete on storage.objects;
create policy presentation_delete on storage.objects for delete to authenticated
  using (bucket_id = 'presentations' and app.can_edit_presentation_path(name));

create table if not exists public.lesson_presentations (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  tenant_id uuid not null,
  file_name text not null check (length(file_name) between 1 and 200),
  folder text not null,
  page_count integer not null check (page_count between 1 and 300),
  aspect numeric not null default 1.7778 check (aspect between 0.3 and 4),
  updated_at timestamptz not null default now()
);
alter table public.lesson_presentations enable row level security;
revoke all on public.lesson_presentations from anon, authenticated;

create table if not exists public.live_screens (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  tenant_id uuid not null,
  mode text not null default 'activity' check (mode in ('slides','activity','join')),
  slide integer not null default 1 check (slide between 1 and 300),
  updated_at timestamptz not null default now()
);
alter table public.live_screens enable row level security;
revoke all on public.live_screens from anon, authenticated;

create or replace function app.presentation_json(p_lesson_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('file_name', p.file_name, 'folder', p.folder, 'page_count', p.page_count,
    'aspect', p.aspect, 'updated_at', p.updated_at)
  from public.lesson_presentations p where p.lesson_id = p_lesson_id;
$$;
revoke all on function app.presentation_json(uuid) from public, anon, authenticated;

create or replace function public.get_lesson_presentation(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  return app.presentation_json(p_lesson_id);
end $$;

create or replace function public.save_lesson_presentation(p_lesson_id uuid, p_file_name text, p_folder text, p_page_count integer, p_aspect numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare l public.lessons%rowtype;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  if p_folder is null or p_folder !~ ('^' || p_lesson_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or length(btrim(coalesce(p_file_name, ''))) not between 1 and 200
     or p_page_count is null or p_page_count not between 1 and 300
     or p_aspect is null or p_aspect not between 0.3 and 4 then
    raise exception 'Presentación inválida' using errcode = '23514'; end if;
  select * into l from public.lessons where id = p_lesson_id;
  insert into public.lesson_presentations(lesson_id, tenant_id, file_name, folder, page_count, aspect, updated_at)
  values (p_lesson_id, l.tenant_id, btrim(p_file_name), p_folder, p_page_count, round(p_aspect, 4), now())
  on conflict (lesson_id) do update set file_name = excluded.file_name, folder = excluded.folder,
    page_count = excluded.page_count, aspect = excluded.aspect, updated_at = now();
  return app.presentation_json(p_lesson_id);
end $$;

create or replace function public.delete_lesson_presentation(p_lesson_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  delete from public.lesson_presentations where lesson_id = p_lesson_id;
  return null;
end $$;

create or replace function app.live_screen_json(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mode', coalesce(x.mode, 'activity'), 'slide', coalesce(x.slide, 1),
    'updated_at', x.updated_at, 'presentation', app.presentation_json(s.lesson_id))
  from public.live_sessions s left join public.live_screens x on x.session_id = s.id
  where s.id = p_session_id;
$$;
revoke all on function app.live_screen_json(uuid) from public, anon, authenticated;

create or replace function public.get_live_screen(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype;
begin
  select * into s from public.live_sessions where id = p_session_id;
  if s.id is null or not app.can_manage_offering(s.offering_id) then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  return app.live_screen_json(s.id);
end $$;

create or replace function public.set_live_screen(p_session_id uuid, p_mode text, p_slide integer) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; v_pages integer;
begin
  select * into s from public.live_sessions where id = p_session_id;
  if s.id is null or not app.can_manage_offering(s.offering_id) or s.status <> 'active' then
    raise exception 'Clase no disponible' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('slides','activity','join') then
    raise exception 'Pantalla inválida' using errcode = '23514'; end if;
  select page_count into v_pages from public.lesson_presentations where lesson_id = s.lesson_id;
  if p_mode = 'slides' and v_pages is null then
    raise exception 'La sesión no tiene presentación' using errcode = '23514'; end if;
  insert into public.live_screens(session_id, tenant_id, mode, slide, updated_at)
  values (s.id, s.tenant_id, p_mode, greatest(1, least(coalesce(p_slide, 1), coalesce(v_pages, 1))), now())
  on conflict (session_id) do update set mode = excluded.mode, slide = excluded.slide, updated_at = now();
  return app.live_screen_json(s.id);
end $$;

revoke all on function public.get_lesson_presentation(uuid), public.save_lesson_presentation(uuid,text,text,integer,numeric),
  public.delete_lesson_presentation(uuid), public.get_live_screen(uuid), public.set_live_screen(uuid,text,integer) from public, anon;
grant execute on function public.get_lesson_presentation(uuid), public.save_lesson_presentation(uuid,text,text,integer,numeric),
  public.delete_lesson_presentation(uuid), public.get_live_screen(uuid), public.set_live_screen(uuid,text,integer) to authenticated;

-- El proyector recibe la pantalla sólo cuando el docente ya la usó (compatibilidad con clientes estrictos).
do $$
declare d text; o text;
begin
  d := pg_get_functiondef('public.get_projector_state(text)'::regprocedure);
  o := '''run'',v_run) ||';
  if position(o in d) = 0 then raise exception 'patch proyector no aplica'; end if;
  execute replace(d, o, '''run'',v_run) ||
    case when exists(select 1 from public.live_screens x where x.session_id = s.id) then jsonb_build_object(''screen'', app.live_screen_json(s.id)) else ''{}''::jsonb end ||');
end $$;
