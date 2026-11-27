-- Archivos de los recursos de la ficha de actividad.
-- Bucket privado: el docente sube desde la plataforma; el alumno descarga solo mediante la función de borde
-- `sheet-file`, que valida el código de clase y el token y emite un enlace temporal (nunca se expone la ruta).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheet-files', 'sheet-files', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/markdown', 'text/plain'])
on conflict (id) do nothing;

-- Ruta: <tenant>/<lección>/<bloque>/<uuid>-<nombre>. Gestiona quien puede gestionar la lección.
create or replace function app.can_manage_sheet_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lessons l
    where l.id::text = split_part(p_path, '/', 2) and l.tenant_id::text = split_part(p_path, '/', 1)
      and split_part(p_path, '/', 3) <> '' and split_part(p_path, '/', 4) <> '' and app.live_manage_lesson(l.id));
$$;
revoke all on function app.can_manage_sheet_path(text) from public, anon;
grant execute on function app.can_manage_sheet_path(text) to authenticated;

create policy sheet_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sheet-files' and app.can_manage_sheet_path(name));
create policy sheet_files_select on storage.objects for select to authenticated
  using (bucket_id = 'sheet-files' and app.can_manage_sheet_path(name));
create policy sheet_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sheet-files' and app.can_manage_sheet_path(name));

-- Prefijo de subida para un bloque (el cliente no necesita conocer el tenant).
create or replace function public.get_sheet_upload_prefix(p_lesson_id uuid, p_item_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare l public.lessons%rowtype;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode = '42501'; end if;
  select * into l from public.lessons where id = p_lesson_id;
  if not exists (select 1 from public.lesson_plan_items i where i.id = p_item_id and i.lesson_id = p_lesson_id and i.tenant_id = l.tenant_id) then
    raise exception 'Bloque no disponible' using errcode = '23514'; end if;
  return l.tenant_id::text || '/' || l.id::text || '/' || p_item_id::text || '/';
end $$;
revoke all on function public.get_sheet_upload_prefix(uuid, uuid) from public, anon;
grant execute on function public.get_sheet_upload_prefix(uuid, uuid) to authenticated;

-- Validación de la ficha: ahora cada recurso puede llevar un archivo {path, name, size}.
create or replace function app.sheet_clean(p_sheet jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb; f jsonb; k text; v jsonb; ids text[] := '{}'; pid text;
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
    if jsonb_typeof(x) <> 'object' or x - 'name' - 'audience' - 'status' - 'file' <> '{}'::jsonb
       or jsonb_typeof(x->'name') is distinct from 'string' or length(btrim(x->>'name')) not between 1 and 150
       or (x->>'audience') is null or (x->>'audience') not in ('students', 'teacher')
       or (x->>'status') is null or (x->>'status') not in ('pending', 'ready') then
      raise exception 'Recurso inválido' using errcode = '23514'; end if;
    if x ? 'file' then
      f := x->'file';
      if jsonb_typeof(f) <> 'object' or f - 'path' - 'name' - 'size' <> '{}'::jsonb
         or jsonb_typeof(f->'path') is distinct from 'string'
         or (f->>'path') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,200}$'
         or jsonb_typeof(f->'name') is distinct from 'string' or length(btrim(f->>'name')) not between 1 and 150
         or jsonb_typeof(f->'size') is distinct from 'number' or (f->>'size') !~ '^[0-9]{1,8}$'
         or (f->>'size')::int not between 1 and 26214400 then
        raise exception 'Archivo inválido' using errcode = '23514'; end if;
    end if;
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
        'status', s.value->>'status')
        || case when s.value ? 'file' then jsonb_build_object('file', jsonb_build_object('path', s.value->'file'->>'path',
          'name', btrim(s.value->'file'->>'name'), 'size', (s.value->'file'->>'size')::int)) else '{}'::jsonb end
      order by s.ordinality), '[]'::jsonb) from jsonb_array_elements(resources) with ordinality s(value, ordinality)),
    'deliverable_md', coalesce(p_sheet->>'deliverable_md', ''),
    'teacher', teacher);
end $$;
revoke all on function app.sheet_clean(jsonb) from public, anon, authenticated;

-- Guardado: los archivos deben pertenecer al bloque y existir en el almacén.
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
  if exists (select 1 from jsonb_array_elements(c->'resources') x where x.value ? 'file' and (
      split_part(x.value->'file'->>'path', '/', 1) <> l.tenant_id::text or split_part(x.value->'file'->>'path', '/', 2) <> l.id::text
      or split_part(x.value->'file'->>'path', '/', 3) <> p_item_id::text
      or not exists (select 1 from storage.objects o where o.bucket_id = 'sheet-files' and o.name = x.value->'file'->>'path'))) then
    raise exception 'Archivo no disponible' using errcode = '23514'; end if;
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

-- Proyección del alumno: sin ruta del archivo; cada recurso lleva su posición (idx) para pedir la descarga.
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
    'resources', (select coalesce(jsonb_agg(jsonb_build_object('idx', r.ordinality - 1, 'name', r.value->>'name', 'audience', 'students',
        'status', r.value->>'status')
        || case when r.value ? 'file' then jsonb_build_object('file', jsonb_build_object('name', r.value->'file'->>'name',
          'size', (r.value->'file'->>'size')::int)) else '{}'::jsonb end
      order by r.ordinality), '[]'::jsonb)
      from jsonb_array_elements(f.resources) with ordinality r(value, ordinality) where r.value->>'audience' = 'students'),
    'deliverable_md', f.deliverable_md);
end $$;
revoke all on function public.get_live_published_sheet(text, text) from public;
grant execute on function public.get_live_published_sheet(text, text) to anon, authenticated;

-- Solo para la función de borde (service_role): valida clase + token y devuelve la ruta del archivo de un recurso de alumnos.
create or replace function public.get_sheet_file_for_student(p_code text, p_token text, p_idx integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; p public.live_participants%rowtype; f public.plan_item_sheets%rowtype; x jsonb;
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or p_idx is null or p_idx < 0 or p_idx > 14 then
    raise exception 'Credenciales inválidas' using errcode = '42501'; end if;
  select * into s from public.live_sessions where code = p_code;
  select * into p from public.live_participants where session_id = s.id and token_hash = extensions.digest(decode(p_token, 'hex'), 'sha256');
  if s.id is null or p.id is null or s.status <> 'active' or s.published_item_id is null then
    raise exception 'Credenciales inválidas' using errcode = '42501'; end if;
  select * into f from public.plan_item_sheets where item_id = s.published_item_id and lesson_id = s.lesson_id and tenant_id = s.tenant_id;
  x := f.resources -> p_idx;
  if f.item_id is null or x is null or x->>'audience' <> 'students' or not (x ? 'file') then
    raise exception 'Archivo no disponible' using errcode = '23514'; end if;
  return jsonb_build_object('path', x->'file'->>'path', 'name', x->'file'->>'name');
end $$;
revoke all on function public.get_sheet_file_for_student(text, text, integer) from public, anon, authenticated;
grant execute on function public.get_sheet_file_for_student(text, text, integer) to service_role;
