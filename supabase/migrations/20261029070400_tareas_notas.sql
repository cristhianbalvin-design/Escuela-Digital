-- Paso 9B (4/4): tareas con archivos (Storage privado), calificación con rúbrica,
-- cola de corrección, libro de notas y nota final (0-20).

-- ---------------------------------------------------------------------------
-- Bucket privado de entregas: {tenant}/{edición}/{matrícula}/{tarea}/{archivo}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions', 'submissions', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'application/zip'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.submission_enrollment(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,200}$'
    then split_part(p_name, '/', 3)::uuid
  end;
$$;

-- El alumno dueño puede subir archivos a una tarea de su edición que admite archivos.
create or replace function app.can_upload_submission(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enr uuid := app.submission_enrollment(p_name);
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
begin
  if v_enr is null or (select auth.uid()) is null then
    return false;
  end if;

  select e.* into v_e from public.enrollments e where e.id = v_enr;
  if v_e.id is null
     or v_e.user_id <> (select auth.uid())
     or v_e.status <> 'active'
     or v_e.tenant_id::text <> split_part(p_name, '/', 1)
     or v_e.offering_id::text <> split_part(p_name, '/', 2) then
    return false;
  end if;

  select o.* into v_o from public.offerings o where o.id = v_e.offering_id and o.deleted_at is null;
  if v_o.id is null or v_o.status not in ('open', 'running') then
    return false;
  end if;

  return exists (
    select 1 from public.assignments a
    where a.id::text = split_part(p_name, '/', 4)
      and a.version_id = v_o.version_id
      and 'file' = any (a.submission_types)
  );
end;
$$;

create or replace function app.can_read_submission_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enr uuid := app.submission_enrollment(p_name);
  v_user uuid;
begin
  if v_enr is null or (select auth.uid()) is null then
    return false;
  end if;
  select e.user_id into v_user from public.enrollments e where e.id = v_enr;
  if v_user is null then
    return false;
  end if;
  return v_user = (select auth.uid()) or app.can_manage_enrollment(v_enr);
end;
$$;

create or replace function app.can_delete_submission_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_upload_submission(p_name)
     and not exists (
       select 1 from public.submissions s
       where s.enrollment_id = app.submission_enrollment(p_name)
         and s.assignment_id::text = split_part(p_name, '/', 4)
         and s.status = 'graded'
     );
$$;

revoke all on function app.submission_enrollment(text) from public, anon, authenticated;
revoke all on function app.can_upload_submission(text) from public, anon, authenticated;
revoke all on function app.can_read_submission_file(text) from public, anon, authenticated;
revoke all on function app.can_delete_submission_file(text) from public, anon, authenticated;
grant execute on function app.submission_enrollment(text) to authenticated;
grant execute on function app.can_upload_submission(text) to authenticated;
grant execute on function app.can_read_submission_file(text) to authenticated;
grant execute on function app.can_delete_submission_file(text) to authenticated;

create policy submissions_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and app.can_upload_submission(name));
create policy submissions_files_select on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and app.can_read_submission_file(name));
create policy submissions_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and app.can_delete_submission_file(name));

-- ---------------------------------------------------------------------------
-- Alumno: ver tarea y entregar
-- ---------------------------------------------------------------------------
create or replace function public.get_assignment_for_student(p_enrollment_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc record;
  v_a public.assignments%rowtype;
  v_s public.submissions%rowtype;
  v_rubric jsonb;
  v_scores jsonb;
  v_reason text;
begin
  select * into v_acc from app.student_activity_access(p_enrollment_id, 'assignment', p_assignment_id);

  select a.* into v_a
  from public.assignments a where a.id = p_assignment_id and a.version_id = v_acc.o_version;
  if v_a.id is null then
    raise exception 'Actividad no disponible' using errcode = '42501';
  end if;

  select s.* into v_s
  from public.submissions s where s.assignment_id = v_a.id and s.enrollment_id = p_enrollment_id;

  if v_a.rubric_id is not null then
    select jsonb_build_object('id', r.id, 'title', r.title, 'criteria', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title,
        'levels', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', l.id, 'label', l.label, 'descriptor', l.descriptor, 'points', l.points
                   ) order by l.position), '[]'::jsonb)
                   from public.rubric_levels l where l.criterion_id = c.id)
      ) order by c.position), '[]'::jsonb)
      from public.rubric_criteria c where c.rubric_id = r.id))
      into v_rubric
    from public.rubrics r where r.id = v_a.rubric_id;
  end if;

  if v_s.id is not null and v_s.status = 'graded' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'criterion_id', ss.criterion_id, 'level_id', ss.level_id,
             'points', ss.points, 'comment', ss.comment)), '[]'::jsonb)
      into v_scores
    from public.submission_scores ss where ss.submission_id = v_s.id;
  end if;

  if v_s.id is not null and v_s.status = 'graded' then
    v_reason := 'graded';
  elsif v_a.due_at is not null and now() > v_a.due_at and not v_a.allow_late then
    v_reason := 'closed';
  end if;

  return jsonb_build_object(
    'assignment_id', v_a.id,
    'title', v_a.title,
    'instructions', v_a.instructions,
    'submission_types', to_jsonb(v_a.submission_types),
    'due_at', v_a.due_at,
    'allow_late', v_a.allow_late,
    'late_penalty_pct', v_a.late_penalty_pct,
    'max_score', v_a.max_score,
    'rubric', v_rubric,
    'storage_prefix', v_acc.o_tenant::text || '/' || v_acc.o_offering::text || '/'
                      || p_enrollment_id::text || '/' || v_a.id::text || '/',
    'can_submit', v_reason is null,
    'reason', v_reason,
    'submission', case when v_s.id is null then null else jsonb_build_object(
      'id', v_s.id, 'status', v_s.status, 'submitted_at', v_s.submitted_at, 'is_late', v_s.is_late,
      'text', v_s.text, 'link', v_s.link, 'files', v_s.files,
      'score', v_s.score, 'raw_score', v_s.raw_score, 'feedback', v_s.feedback,
      'graded_at', v_s.graded_at, 'rubric_scores', v_scores) end
  );
end;
$$;

create or replace function public.submit_assignment(
  p_enrollment_id uuid,
  p_assignment_id uuid,
  p_text text default null,
  p_link text default null,
  p_files jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc record;
  v_a public.assignments%rowtype;
  v_s public.submissions%rowtype;
  v_text text := nullif(btrim(p_text), '');
  v_link text := nullif(btrim(p_link), '');
  v_prefix text;
  v_files jsonb := '[]'::jsonb;
  v_f jsonb;
  v_path text;
  v_obj record;
  v_late boolean;
  v_id uuid;
begin
  select * into v_acc from app.student_activity_access(p_enrollment_id, 'assignment', p_assignment_id);

  perform 1 from public.enrollments e where e.id = p_enrollment_id for update;

  select a.* into v_a
  from public.assignments a where a.id = p_assignment_id and a.version_id = v_acc.o_version;
  if v_a.id is null then
    raise exception 'Actividad no disponible' using errcode = '42501';
  end if;

  select s.* into v_s
  from public.submissions s where s.assignment_id = v_a.id and s.enrollment_id = p_enrollment_id
  for update;

  if v_s.id is not null and v_s.status = 'graded' then
    raise exception 'La tarea ya fue calificada' using errcode = '23514';
  end if;

  v_late := v_a.due_at is not null and now() > v_a.due_at;
  if v_late and not v_a.allow_late then
    raise exception 'La fecha de entrega venció' using errcode = '23514';
  end if;

  if p_files is null or jsonb_typeof(p_files) <> 'array' then
    raise exception 'Archivos no válidos' using errcode = '23514';
  end if;
  if jsonb_array_length(p_files) > 5 then
    raise exception 'Máximo 5 archivos' using errcode = '23514';
  end if;

  if v_text is not null and (not ('text' = any (v_a.submission_types)) or length(v_text) > 20000) then
    raise exception 'Texto no permitido en esta tarea' using errcode = '23514';
  end if;
  if v_link is not null and (not ('link' = any (v_a.submission_types))
       or length(v_link) > 2000 or v_link !~* '^https?://[^\s]+$') then
    raise exception 'Enlace no válido o no permitido en esta tarea' using errcode = '23514';
  end if;
  if jsonb_array_length(p_files) > 0 and not ('file' = any (v_a.submission_types)) then
    raise exception 'Archivos no permitidos en esta tarea' using errcode = '23514';
  end if;

  v_prefix := v_acc.o_tenant::text || '/' || v_acc.o_offering::text || '/'
              || p_enrollment_id::text || '/' || v_a.id::text || '/';

  for v_f in select * from jsonb_array_elements(p_files) loop
    v_path := case when jsonb_typeof(v_f) = 'string' then v_f #>> '{}' else v_f ->> 'path' end;
    if v_path is null or left(v_path, length(v_prefix)) <> v_prefix
       or position('/' in substr(v_path, length(v_prefix) + 1)) > 0 then
      raise exception 'Archivo no válido' using errcode = '23514';
    end if;
    select o.name, o.metadata into v_obj
    from storage.objects o where o.bucket_id = 'submissions' and o.name = v_path;
    if v_obj.name is null then
      raise exception 'El archivo no se subió correctamente' using errcode = '23514';
    end if;
    v_files := v_files || jsonb_build_array(jsonb_build_object(
      'path', v_path,
      'name', substr(v_path, length(v_prefix) + 1),
      'size', (v_obj.metadata ->> 'size')::bigint,
      'mime', v_obj.metadata ->> 'mimetype'
    ));
  end loop;

  if v_text is null and v_link is null and jsonb_array_length(v_files) = 0 then
    raise exception 'La entrega está vacía' using errcode = '23514';
  end if;

  if v_s.id is null then
    insert into public.submissions (
      tenant_id, client_id, assignment_id, enrollment_id, status, submitted_at, is_late, text, link, files
    )
    values (v_acc.o_tenant, v_acc.o_client, v_a.id, p_enrollment_id, 'submitted', now(), v_late,
            v_text, v_link, v_files)
    returning id into v_id;
  else
    update public.submissions s
    set submitted_at = now(), is_late = v_late, text = v_text, link = v_link, files = v_files
    where s.id = v_s.id;
    v_id := v_s.id;
  end if;

  perform app.complete_activity_lesson(p_enrollment_id, 'assignment', v_a.id);

  return jsonb_build_object('submission_id', v_id, 'is_late', v_late);
end;
$$;

-- ---------------------------------------------------------------------------
-- Docente: calificar entrega (rúbrica o puntaje directo)
-- ---------------------------------------------------------------------------
create or replace function public.grade_submission(
  p_submission_id uuid,
  p_scores jsonb default null,
  p_feedback text default null,
  p_raw_score numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.submissions%rowtype;
  v_a public.assignments%rowtype;
  v_rubric_max numeric;
  v_sum numeric;
  v_raw numeric;
  v_score numeric;
  v_n integer;
  v_item uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select s.* into v_s from public.submissions s where s.id = p_submission_id for update;
  if v_s.id is null or not app.can_manage_enrollment(v_s.enrollment_id) then
    raise exception 'No se permite calificar esta entrega' using errcode = '42501';
  end if;

  select a.* into v_a from public.assignments a where a.id = v_s.assignment_id;

  if v_a.rubric_id is not null then
    if p_scores is null or jsonb_typeof(p_scores) <> 'array' then
      raise exception 'Califica todos los criterios de la rúbrica' using errcode = '23514';
    end if;

    select count(*) into v_n from public.rubric_criteria c where c.rubric_id = v_a.rubric_id;
    if jsonb_array_length(p_scores) <> v_n
       or (select count(distinct x ->> 'criterion_id') from jsonb_array_elements(p_scores) x) <> v_n then
      raise exception 'Califica todos los criterios de la rúbrica' using errcode = '23514';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_scores) x
      where not exists (
        select 1
        from public.rubric_levels l
        join public.rubric_criteria c on c.id = l.criterion_id
        where c.rubric_id = v_a.rubric_id
          and c.id::text = (x ->> 'criterion_id')
          and l.id::text = (x ->> 'level_id')
      )
    ) then
      raise exception 'Nivel de rúbrica no válido' using errcode = '23514';
    end if;

    select coalesce(sum(m.mx), 0) into v_rubric_max
    from (
      select max(l.points) as mx
      from public.rubric_criteria c
      join public.rubric_levels l on l.criterion_id = c.id
      where c.rubric_id = v_a.rubric_id
      group by c.id
    ) m;

    select coalesce(sum(l.points), 0) into v_sum
    from jsonb_array_elements(p_scores) x
    join public.rubric_levels l on l.id::text = (x ->> 'level_id');

    v_raw := case when v_rubric_max = 0 then 0 else round(v_sum / v_rubric_max * v_a.max_score, 2) end;
  else
    if p_raw_score is null or p_raw_score < 0 or p_raw_score > v_a.max_score then
      raise exception 'El puntaje debe estar entre 0 y %', v_a.max_score using errcode = '23514';
    end if;
    v_raw := p_raw_score;
  end if;

  v_score := v_raw;
  if v_s.is_late and v_a.late_penalty_pct > 0 then
    v_score := round(v_raw * (1 - v_a.late_penalty_pct / 100.0), 2);
  end if;

  delete from public.submission_scores ss where ss.submission_id = v_s.id;
  if v_a.rubric_id is not null then
    insert into public.submission_scores (submission_id, criterion_id, tenant_id, level_id, points, comment)
    select v_s.id, (x ->> 'criterion_id')::uuid, v_s.tenant_id, l.id, l.points,
           nullif(btrim(x ->> 'comment'), '')
    from jsonb_array_elements(p_scores) x
    join public.rubric_levels l on l.id::text = (x ->> 'level_id');
  end if;

  update public.submissions s
  set status = 'graded', raw_score = v_raw, score = v_score,
      feedback = nullif(btrim(p_feedback), ''),
      graded_by = (select auth.uid()), graded_at = now()
  where s.id = v_s.id;

  select gi.id into v_item
  from public.grade_items gi
  where gi.version_id = v_a.version_id and gi.source_type = 'assignment' and gi.source_id = v_a.id;

  if v_item is not null then
    insert into public.grades as g (
      enrollment_id, grade_item_id, tenant_id, client_id, score, max_score, graded_by, graded_at
    )
    values (v_s.enrollment_id, v_item, v_s.tenant_id, v_s.client_id, v_score, v_a.max_score,
            (select auth.uid()), now())
    on conflict (enrollment_id, grade_item_id) do update
    set score = excluded.score, max_score = excluded.max_score,
        graded_by = excluded.graded_by, graded_at = now()
    where g.adjusted_reason is null;
  end if;

  return jsonb_build_object('raw_score', v_raw, 'score', v_score, 'max_score', v_a.max_score,
                            'is_late', v_s.is_late);
end;
$$;

-- ---------------------------------------------------------------------------
-- Docente: cola de corrección, notas manuales, libro de notas, nota final
-- ---------------------------------------------------------------------------
create or replace function public.get_grading_queue(p_offering_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.offerings%rowtype;
  v_subs jsonb;
  v_atts jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite ver la cola de esta edición' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'submission_id', s.id, 'assignment_id', a.id, 'assignment_title', a.title,
           'enrollment_id', e.id, 'student_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           'student_email', u.email, 'status', s.status, 'submitted_at', s.submitted_at,
           'is_late', s.is_late, 'score', s.score, 'max_score', a.max_score
         ) order by (s.status = 'graded'), s.submitted_at), '[]'::jsonb)
    into v_subs
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.enrollments e on e.id = s.enrollment_id
  join auth.users u on u.id = e.user_id
  where e.offering_id = p_offering_id and a.version_id = v_o.version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'attempt_id', at.id, 'attempt_no', at.attempt_no, 'assessment_id', ass.id,
           'assessment_title', ass.title, 'enrollment_id', e.id,
           'student_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           'student_email', u.email, 'submitted_at', at.submitted_at
         ) order by at.submitted_at), '[]'::jsonb)
    into v_atts
  from public.attempts at
  join public.assessments ass on ass.id = at.assessment_id
  join public.enrollments e on e.id = at.enrollment_id
  join auth.users u on u.id = e.user_id
  where e.offering_id = p_offering_id and ass.version_id = v_o.version_id and at.status = 'submitted';

  return jsonb_build_object('submissions', v_subs, 'attempts', v_atts);
end;
$$;

create or replace function public.set_manual_grade(
  p_enrollment_id uuid,
  p_grade_item_id uuid,
  p_score numeric,
  p_comment text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_gi public.grade_items%rowtype;
  v_g public.grades%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null or not app.can_manage_enrollment(p_enrollment_id) then
    raise exception 'No se permite calificar esta matrícula' using errcode = '42501';
  end if;

  select o.* into v_o from public.offerings o where o.id = v_e.offering_id;
  select gi.* into v_gi from public.grade_items gi
  where gi.id = p_grade_item_id and gi.version_id = v_o.version_id and gi.tenant_id = v_o.tenant_id;
  if v_gi.id is null then
    raise exception 'Elemento de nota no válido' using errcode = '23514';
  end if;
  if p_score is null or p_score < 0 then
    raise exception 'Puntaje no válido' using errcode = '23514';
  end if;

  if v_gi.source_type = 'manual' then
    if p_score > v_gi.max_score then
      raise exception 'El puntaje máximo es %', v_gi.max_score using errcode = '23514';
    end if;
    insert into public.grades as g (
      enrollment_id, grade_item_id, tenant_id, client_id, score, max_score, graded_by, comment, graded_at
    )
    values (p_enrollment_id, v_gi.id, v_e.tenant_id, v_e.client_id, p_score, v_gi.max_score,
            (select auth.uid()), nullif(btrim(p_comment), ''), now())
    on conflict (enrollment_id, grade_item_id) do update
    set score = excluded.score, graded_by = excluded.graded_by,
        comment = excluded.comment, graded_at = now();
  else
    select g.* into v_g from public.grades g
    where g.enrollment_id = p_enrollment_id and g.grade_item_id = v_gi.id;
    if v_g.enrollment_id is null then
      raise exception 'Todavía no hay una nota calculada para ajustar' using errcode = '23514';
    end if;
    if v_reason is null then
      raise exception 'Indica el motivo del ajuste' using errcode = '23514';
    end if;
    if p_score > v_g.max_score then
      raise exception 'El puntaje máximo es %', v_g.max_score using errcode = '23514';
    end if;
    update public.grades g
    set score = p_score, graded_by = (select auth.uid()), comment = nullif(btrim(p_comment), ''),
        adjusted_reason = v_reason, graded_at = now()
    where g.enrollment_id = p_enrollment_id and g.grade_item_id = v_gi.id;
  end if;
end;
$$;

create or replace function public.get_gradebook(p_offering_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_o public.offerings%rowtype;
  v_items jsonb;
  v_students jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null
     or not (app.can_manage_offering(p_offering_id) or app.is_client_coordinator(v_o.client_id)) then
    raise exception 'No se permite ver las notas de esta edición' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', gi.id, 'title', gi.title, 'source_type', gi.source_type,
           'source_id', gi.source_id, 'weight', gi.weight, 'max_score', gi.max_score
         ) order by gi.source_type, gi.created_at), '[]'::jsonb)
    into v_items
  from public.grade_items gi
  where gi.tenant_id = v_o.tenant_id and gi.version_id = v_o.version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'enrollment_id', e.id, 'user_id', e.user_id, 'email', u.email,
           'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           'status', e.status, 'saved_final_grade', e.final_grade,
           'grades', (select coalesce(jsonb_object_agg(g.grade_item_id, jsonb_build_object(
                        'score', g.score, 'max_score', g.max_score, 'adjusted', g.adjusted_reason is not null,
                        'adjusted_reason', g.adjusted_reason)), '{}'::jsonb)
                      from public.grades g where g.enrollment_id = e.id),
           'summary', app.grade_summary(e.id, false)
         ) order by u.email), '[]'::jsonb)
    into v_students
  from public.enrollments e
  join auth.users u on u.id = e.user_id
  where e.offering_id = p_offering_id and e.status <> 'dropped';

  return jsonb_build_object('items', v_items, 'students', v_students);
end;
$$;

-- Guarda la nota final (0-20) de quienes ya tienen todas las notas.
create or replace function public.finalize_final_grades(p_offering_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.offerings%rowtype;
  v_e record;
  v_final numeric;
  v_n integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite cerrar notas de esta edición' using errcode = '42501';
  end if;

  for v_e in
    select e.id from public.enrollments e
    where e.offering_id = p_offering_id and e.status in ('active', 'completed')
  loop
    v_final := nullif(app.grade_summary(v_e.id, false) ->> 'final', '')::numeric;
    if v_final is not null then
      update public.enrollments e set final_grade = v_final where e.id = v_e.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public.get_assignment_for_student(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_assignment(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.grade_submission(uuid, jsonb, text, numeric) from public, anon, authenticated;
revoke all on function public.get_grading_queue(uuid) from public, anon, authenticated;
revoke all on function public.set_manual_grade(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.get_gradebook(uuid) from public, anon, authenticated;
revoke all on function public.finalize_final_grades(uuid) from public, anon, authenticated;

grant execute on function public.get_assignment_for_student(uuid, uuid) to authenticated;
grant execute on function public.submit_assignment(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.grade_submission(uuid, jsonb, text, numeric) to authenticated;
grant execute on function public.get_grading_queue(uuid) to authenticated;
grant execute on function public.set_manual_grade(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.get_gradebook(uuid) to authenticated;
grant execute on function public.finalize_final_grades(uuid) to authenticated;
