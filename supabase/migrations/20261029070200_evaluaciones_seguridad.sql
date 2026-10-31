-- Paso 9A (2/4): guards, helpers, RLS y permisos de evaluaciones, tareas y notas.
-- Los estudiantes NO leen estas tablas directamente: todo pasa por RPC (siguientes migraciones).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.can_edit_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_versions cv
    where cv.id = p_version_id
      and cv.status = 'draft'
      and app.can_edit_course(cv.course_id)
  );
$$;

create or replace function app.can_read_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_versions cv
    where cv.id = p_version_id
      and (
        app.can_read_course(cv.course_id)
        or app.teaches_offering_version(cv.tenant_id, cv.course_id, cv.id)
      )
  );
$$;

create or replace function app.can_manage_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.id = p_enrollment_id
      and app.can_manage_offering(e.offering_id)
  );
$$;

-- Ajustes del cuestionario: solo claves conocidas y con tipos válidos.
create or replace function app.validate_assessment_settings(p_settings jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  v_opens timestamptz;
  v_closes timestamptz;
  v_cap numeric;
begin
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Los ajustes deben ser un objeto' using errcode = '23514';
  end if;

  for k in select jsonb_object_keys(p_settings) loop
    if k <> all (array[
      'time_limit_minutes', 'max_attempts', 'pass_pct', 'shuffle_questions',
      'shuffle_options', 'show_results', 'opens_at', 'closes_at'
    ]) then
      raise exception 'Ajuste desconocido: %', k using errcode = '23514';
    end if;
    v := p_settings -> k;
    if jsonb_typeof(v) = 'null' then
      continue;
    end if;

    if k in ('time_limit_minutes', 'max_attempts') then
      v_cap := case when k = 'max_attempts' then 20 else 600 end;
      if jsonb_typeof(v) <> 'number'
         or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
         or (v #>> '{}')::numeric < 1
         or (v #>> '{}')::numeric > v_cap then
        raise exception 'Valor no válido para %', k using errcode = '23514';
      end if;
    elsif k = 'pass_pct' then
      if jsonb_typeof(v) <> 'number'
         or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 100 then
        raise exception 'La nota mínima debe estar entre 0 y 100' using errcode = '23514';
      end if;
    elsif k in ('shuffle_questions', 'shuffle_options') then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception 'Valor no válido para %', k using errcode = '23514';
      end if;
    elsif k = 'show_results' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') <> all (array['immediate', 'after_close', 'never']) then
        raise exception 'Valor no válido para show_results' using errcode = '23514';
      end if;
    else
      if jsonb_typeof(v) <> 'string' then
        raise exception 'Fecha no válida para %', k using errcode = '23514';
      end if;
      begin
        perform (v #>> '{}')::timestamptz;
      exception when others then
        raise exception 'Fecha no válida para %', k using errcode = '23514';
      end;
    end if;
  end loop;

  if jsonb_typeof(p_settings -> 'opens_at') = 'string'
     and jsonb_typeof(p_settings -> 'closes_at') = 'string' then
    v_opens := (p_settings ->> 'opens_at')::timestamptz;
    v_closes := (p_settings ->> 'closes_at')::timestamptz;
    if v_closes <= v_opens then
      raise exception 'El cierre debe ser posterior a la apertura' using errcode = '23514';
    end if;
  end if;
end;
$$;

-- Problema de la clave de una pregunta (null = correcta).
create or replace function app.question_key_problem(
  p_question_id uuid,
  p_type public.question_type,
  p_answer jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_opt text;
begin
  if p_type = 'essay' then
    return 'Una pregunta de desarrollo no tiene clave automática';
  end if;

  if p_answer is null or jsonb_typeof(p_answer) <> 'object' then
    return 'La clave debe ser un objeto';
  end if;

  if p_type = 'single' then
    if jsonb_typeof(p_answer -> 'option_id') <> 'string' then
      return 'Indica la opción correcta';
    end if;
    begin
      perform (p_answer ->> 'option_id')::uuid;
    exception when others then
      return 'La opción correcta no es válida';
    end;
    if not exists (
      select 1 from public.question_options o
      where o.question_id = p_question_id and o.id = (p_answer ->> 'option_id')::uuid
    ) then
      return 'La opción correcta no pertenece a la pregunta';
    end if;
  elsif p_type = 'multiple' then
    if jsonb_typeof(p_answer -> 'option_ids') <> 'array'
       or jsonb_array_length(p_answer -> 'option_ids') < 1 then
      return 'Indica al menos una opción correcta';
    end if;
    for v_opt in select jsonb_array_elements_text(p_answer -> 'option_ids') loop
      begin
        perform v_opt::uuid;
      exception when others then
        return 'Una opción correcta no es válida';
      end;
      if not exists (
        select 1 from public.question_options o
        where o.question_id = p_question_id and o.id = v_opt::uuid
      ) then
        return 'Una opción correcta no pertenece a la pregunta';
      end if;
    end loop;
  elsif p_type = 'true_false' then
    if jsonb_typeof(p_answer -> 'value') <> 'boolean' then
      return 'Indica si la afirmación es verdadera o falsa';
    end if;
  elsif p_type = 'short' then
    if jsonb_typeof(p_answer -> 'accepted') <> 'array'
       or jsonb_array_length(p_answer -> 'accepted') < 1
       or exists (
         select 1 from jsonb_array_elements(p_answer -> 'accepted') e
         where jsonb_typeof(e) <> 'string' or length(btrim(e #>> '{}')) = 0
       ) then
      return 'Indica al menos una respuesta aceptada';
    end if;
  end if;

  return null;
end;
$$;

-- Remapea los ids de opciones dentro de una clave (para copiar versiones).
create or replace function app.remap_key(p_type public.question_type, p_answer jsonb, p_map jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'single' then jsonb_build_object(
      'option_id', coalesce(p_map ->> (p_answer ->> 'option_id'), p_answer ->> 'option_id'))
    when 'multiple' then jsonb_build_object(
      'option_ids', (
        select coalesce(jsonb_agg(coalesce(p_map ->> e, e)), '[]'::jsonb)
        from jsonb_array_elements_text(p_answer -> 'option_ids') e))
    else p_answer
  end;
$$;

-- ---------------------------------------------------------------------------
-- Guard común del contenido de actividades (solo borrador + identidad inmutable)
-- ---------------------------------------------------------------------------
create or replace function app.guard_activity_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_status public.course_version_status;
  v_keys text[] := array['id', 'tenant_id', 'version_id'];
  v_type public.question_type;
  v_problem text;
  v_question_type public.question_type;
begin
  if tg_op = 'DELETE' then
    v_version_id := old.version_id;
  else
    v_version_id := new.version_id;
  end if;

  select cv.status into v_status
  from public.course_versions cv
  where cv.id = v_version_id
  for share;

  if tg_op = 'DELETE' and v_status is null then
    return old;
  end if;

  if v_status is distinct from 'draft'::public.course_version_status then
    raise exception 'El contenido solo puede cambiar en una versión borrador'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    v_keys := v_keys || case tg_table_name
      when 'questions' then array['assessment_id', 'type']
      when 'question_options' then array['question_id']
      when 'question_keys' then array['question_id']
      when 'rubric_criteria' then array['rubric_id']
      when 'rubric_levels' then array['criterion_id']
      when 'grade_items' then array['source_type', 'source_id']
      else array[]::text[]
    end;
    if exists (
      select 1 from unnest(v_keys) k
      where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k)
    ) then
      raise exception 'La identidad del elemento es inmutable' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_table_name = 'assessments' then
    perform app.validate_assessment_settings(new.settings);
  elsif tg_table_name = 'question_options' then
    select q.type into v_question_type from public.questions q where q.id = new.question_id;
    if v_question_type not in ('single', 'multiple') then
      raise exception 'Este tipo de pregunta no usa opciones' using errcode = '23514';
    end if;
  elsif tg_table_name = 'question_keys' then
    select q.type into v_type from public.questions q where q.id = new.question_id;
    v_problem := app.question_key_problem(new.question_id, v_type, new.answer);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = '23514';
    end if;
  elsif tg_table_name = 'grade_items' then
    if tg_op = 'UPDATE' and new.source_type <> 'manual'
       and (new.title is distinct from old.title or new.max_score is distinct from old.max_score)
       and pg_trigger_depth() = 1 then
      raise exception 'Solo se pueden ajustar las ponderaciones de este elemento'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger assessments_guard before insert or update or delete on public.assessments
  for each row execute function app.guard_activity_content();
create trigger questions_guard before insert or update or delete on public.questions
  for each row execute function app.guard_activity_content();
create trigger question_options_guard before insert or update or delete on public.question_options
  for each row execute function app.guard_activity_content();
create trigger question_keys_guard before insert or update or delete on public.question_keys
  for each row execute function app.guard_activity_content();
create trigger rubrics_guard before insert or update or delete on public.rubrics
  for each row execute function app.guard_activity_content();
create trigger rubric_criteria_guard before insert or update or delete on public.rubric_criteria
  for each row execute function app.guard_activity_content();
create trigger rubric_levels_guard before insert or update or delete on public.rubric_levels
  for each row execute function app.guard_activity_content();
create trigger assignments_guard before insert or update or delete on public.assignments
  for each row execute function app.guard_activity_content();
create trigger grade_items_guard before insert or update or delete on public.grade_items
  for each row execute function app.guard_activity_content();

-- Cada cuestionario y tarea genera su elemento de nota (ponderación 1 por defecto).
create or replace function app.sync_grade_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.grade_source_type := case tg_table_name
    when 'assessments' then 'assessment'::public.grade_source_type
    else 'assignment'::public.grade_source_type
  end;
begin
  if tg_op = 'INSERT' then
    insert into public.grade_items (tenant_id, version_id, source_type, source_id, title)
    values (new.tenant_id, new.version_id, v_type, new.id, new.title);
    return new;
  elsif tg_op = 'UPDATE' then
    update public.grade_items g
    set title = new.title
    where g.version_id = new.version_id and g.source_type = v_type and g.source_id = new.id
      and g.title is distinct from new.title;
    return new;
  end if;

  delete from public.grade_items g
  where g.version_id = old.version_id and g.source_type = v_type and g.source_id = old.id;
  return old;
end;
$$;

create trigger assessments_grade_item after insert or update of title or delete on public.assessments
  for each row execute function app.sync_grade_item();
create trigger assignments_grade_item after insert or update of title or delete on public.assignments
  for each row execute function app.sync_grade_item();

-- ---------------------------------------------------------------------------
-- Validación al publicar
-- ---------------------------------------------------------------------------
create or replace function app.validate_version_activities(p_version_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_problem text;
  v_ref uuid;
begin
  for r in
    select a.id, a.title from public.assessments a
    where a.version_id = p_version_id
      and not exists (select 1 from public.questions q where q.assessment_id = a.id)
  loop
    raise exception 'El cuestionario "%" no tiene preguntas', r.title using errcode = '23514';
  end loop;

  for r in
    select q.id, q.prompt, q.type, k.answer, a.title as assessment_title,
           (select count(*) from public.question_options o where o.question_id = q.id) as n_options
    from public.questions q
    join public.assessments a on a.id = q.assessment_id
    left join public.question_keys k on k.question_id = q.id
    where q.version_id = p_version_id
  loop
    if r.type in ('single', 'multiple') and r.n_options < 2 then
      raise exception 'Una pregunta de "%" necesita al menos 2 opciones', r.assessment_title
        using errcode = '23514';
    end if;
    if r.type <> 'essay' then
      v_problem := app.question_key_problem(r.id, r.type, r.answer);
      if v_problem is not null then
        raise exception 'En "%": % (pregunta "%")', r.assessment_title, v_problem, left(r.prompt, 60)
          using errcode = '23514';
      end if;
    end if;
  end loop;

  for r in
    select s.id, s.title from public.assignments s
    where s.version_id = p_version_id and s.rubric_id is not null
      and (
        not exists (select 1 from public.rubric_criteria c where c.rubric_id = s.rubric_id)
        or exists (
          select 1 from public.rubric_criteria c
          where c.rubric_id = s.rubric_id
            and not exists (select 1 from public.rubric_levels l where l.criterion_id = c.id)
        )
      )
  loop
    raise exception 'La rúbrica de la tarea "%" está incompleta', r.title using errcode = '23514';
  end loop;

  for r in
    select l.id, l.title, l.type, l.content
    from public.lessons l
    where l.version_id = p_version_id and l.type in ('quiz', 'assignment')
  loop
    begin
      v_ref := (r.content ->> case r.type when 'quiz' then 'assessment_id' else 'assignment_id' end)::uuid;
    exception when others then
      v_ref := null;
    end;
    if v_ref is null
       or (r.type = 'quiz' and not exists (
         select 1 from public.assessments a where a.id = v_ref and a.version_id = p_version_id))
       or (r.type = 'assignment' and not exists (
         select 1 from public.assignments s where s.id = v_ref and s.version_id = p_version_id)) then
      raise exception 'La lección "%" no tiene su actividad asignada', r.title using errcode = '23514';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_version: ahora valida las actividades
-- ---------------------------------------------------------------------------
create or replace function public.publish_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_tenant_id uuid;
  v_status public.course_version_status;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select cv.course_id, cv.tenant_id into v_course_id, v_tenant_id
  from public.course_versions cv where cv.id = p_version_id;

  if v_course_id is null or not app.can_edit_course(v_course_id) then
    raise exception 'No se puede editar este curso' using errcode = '42501';
  end if;

  perform 1 from public.courses c
  where c.id = v_course_id and c.tenant_id = v_tenant_id for update;

  select cv.status into v_status
  from public.course_versions cv
  where cv.id = p_version_id and cv.course_id = v_course_id and cv.tenant_id = v_tenant_id
  for update;

  if v_status is distinct from 'draft'::public.course_version_status then
    raise exception 'Solo se puede publicar un borrador' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.modules m
    join public.lessons l
      on l.tenant_id = m.tenant_id and l.version_id = m.version_id and l.module_id = m.id
    where m.tenant_id = v_tenant_id and m.version_id = p_version_id
  ) then
    raise exception 'La versión necesita al menos un módulo con una lección'
      using errcode = '23514';
  end if;

  perform app.validate_version_activities(p_version_id);

  update public.course_versions cv
  set status = 'published', published_at = now(), published_by = (select auth.uid())
  where cv.id = p_version_id;

  update public.courses c
  set latest_published_version_id = p_version_id, status = 'active'
  where c.id = v_course_id and c.tenant_id = v_tenant_id;

  return p_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_draft_from_version: copia profunda, ahora con actividades
-- ---------------------------------------------------------------------------
create or replace function public.create_draft_from_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.course_versions%rowtype;
  v_new_version_id uuid;
  v_new_module_id uuid;
  v_new_lesson_id uuid;
  v_new_id uuid;
  v_next_number integer;
  v_module record;
  v_lesson record;
  v_a record;
  v_q record;
  v_o record;
  v_c record;
  v_l record;
  v_map jsonb := '{}'::jsonb;
  v_content jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select cv.id, cv.course_id, cv.tenant_id, cv.version_number,
         cv.status, cv.title, cv.summary, cv.hours,
         cv.completion_defaults, cv.published_at, cv.published_by,
         cv.source_version_id, cv.source_tenant_id, cv.created_at, cv.updated_at
    into v_source
  from public.course_versions cv
  where cv.id = p_version_id;

  if v_source.id is null or not app.can_edit_course(v_source.course_id) then
    raise exception 'No se puede editar este curso' using errcode = '42501';
  end if;

  if v_source.status not in ('published', 'retired') then
    raise exception 'La versión de origen debe estar publicada o retirada' using errcode = '23514';
  end if;

  perform 1 from public.courses c
  where c.id = v_source.course_id and c.tenant_id = v_source.tenant_id for update;

  if exists (
    select 1 from public.course_versions cv
    where cv.course_id = v_source.course_id and cv.status = 'draft'
  ) then
    raise exception 'El curso ya tiene un borrador' using errcode = '23505';
  end if;

  select coalesce(max(cv.version_number), 0) + 1 into v_next_number
  from public.course_versions cv where cv.course_id = v_source.course_id;

  insert into public.course_versions (
    course_id, tenant_id, version_number, title, summary, hours,
    completion_defaults, source_version_id, source_tenant_id
  )
  values (
    v_source.course_id, v_source.tenant_id, v_next_number,
    v_source.title, v_source.summary, v_source.hours,
    v_source.completion_defaults, v_source.id, v_source.tenant_id
  )
  returning id into v_new_version_id;

  -- Rúbricas
  for v_a in
    select r.id, r.title from public.rubrics r
    where r.tenant_id = v_source.tenant_id and r.version_id = v_source.id
  loop
    insert into public.rubrics (tenant_id, version_id, title)
    values (v_source.tenant_id, v_new_version_id, v_a.title)
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(v_a.id::text, v_new_id::text);

    for v_c in
      select c.id, c.title, c.position from public.rubric_criteria c
      where c.rubric_id = v_a.id order by c.position
    loop
      insert into public.rubric_criteria (tenant_id, version_id, rubric_id, title, position)
      values (v_source.tenant_id, v_new_version_id, v_new_id, v_c.title, v_c.position)
      returning id into v_new_module_id;

      for v_l in
        select l.label, l.descriptor, l.points, l.position from public.rubric_levels l
        where l.criterion_id = v_c.id order by l.position
      loop
        insert into public.rubric_levels (
          tenant_id, version_id, criterion_id, label, descriptor, points, position
        )
        values (
          v_source.tenant_id, v_new_version_id, v_new_module_id,
          v_l.label, v_l.descriptor, v_l.points, v_l.position
        );
      end loop;
    end loop;
  end loop;

  -- Cuestionarios
  for v_a in
    select a.id, a.title, a.instructions, a.settings from public.assessments a
    where a.tenant_id = v_source.tenant_id and a.version_id = v_source.id
  loop
    insert into public.assessments (tenant_id, version_id, title, instructions, settings)
    values (v_source.tenant_id, v_new_version_id, v_a.title, v_a.instructions, v_a.settings)
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(v_a.id::text, v_new_id::text);

    for v_q in
      select q.id, q.position, q.type, q.prompt, q.points, q.feedback_ok, q.feedback_bad, q.tags
      from public.questions q where q.assessment_id = v_a.id order by q.position
    loop
      insert into public.questions (
        tenant_id, version_id, assessment_id, position, type, prompt, points,
        feedback_ok, feedback_bad, tags
      )
      values (
        v_source.tenant_id, v_new_version_id, v_new_id, v_q.position, v_q.type, v_q.prompt,
        v_q.points, v_q.feedback_ok, v_q.feedback_bad, v_q.tags
      )
      returning id into v_new_lesson_id;
      v_map := v_map || jsonb_build_object(v_q.id::text, v_new_lesson_id::text);

      for v_o in
        select o.id, o.label, o.position from public.question_options o
        where o.question_id = v_q.id order by o.position
      loop
        insert into public.question_options (tenant_id, version_id, question_id, label, position)
        values (v_source.tenant_id, v_new_version_id, v_new_lesson_id, v_o.label, v_o.position)
        returning id into v_new_module_id;
        v_map := v_map || jsonb_build_object(v_o.id::text, v_new_module_id::text);
      end loop;

      insert into public.question_keys (question_id, tenant_id, version_id, answer)
      select v_new_lesson_id, v_source.tenant_id, v_new_version_id,
             app.remap_key(v_q.type, k.answer, v_map)
      from public.question_keys k where k.question_id = v_q.id;
    end loop;
  end loop;

  -- Tareas
  for v_a in
    select s.id, s.title, s.instructions, s.rubric_id, s.submission_types, s.due_at,
           s.allow_late, s.late_penalty_pct, s.max_score
    from public.assignments s
    where s.tenant_id = v_source.tenant_id and s.version_id = v_source.id
  loop
    insert into public.assignments (
      tenant_id, version_id, title, instructions, rubric_id, submission_types,
      due_at, allow_late, late_penalty_pct, max_score
    )
    values (
      v_source.tenant_id, v_new_version_id, v_a.title, v_a.instructions,
      case when v_a.rubric_id is null then null else (v_map ->> v_a.rubric_id::text)::uuid end,
      v_a.submission_types, v_a.due_at, v_a.allow_late, v_a.late_penalty_pct, v_a.max_score
    )
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(v_a.id::text, v_new_id::text);
  end loop;

  -- Módulos y lecciones (con referencias a actividades remapeadas)
  for v_module in
    select m.id, m.title, m.position from public.modules m
    where m.tenant_id = v_source.tenant_id and m.version_id = v_source.id
    order by m.position, m.id
  loop
    insert into public.modules (version_id, tenant_id, title, position)
    values (v_new_version_id, v_source.tenant_id, v_module.title, v_module.position)
    returning id into v_new_module_id;

    for v_lesson in
      select l.id, l.type, l.title, l.position, l.is_required, l.est_minutes, l.content
      from public.lessons l
      where l.tenant_id = v_source.tenant_id and l.version_id = v_source.id
        and l.module_id = v_module.id
      order by l.position, l.id
    loop
      v_content := v_lesson.content;
      if v_lesson.type = 'quiz' and v_content ? 'assessment_id'
         and v_map ? (v_content ->> 'assessment_id') then
        v_content := jsonb_set(v_content, '{assessment_id}',
          to_jsonb(v_map ->> (v_content ->> 'assessment_id')));
      elsif v_lesson.type = 'assignment' and v_content ? 'assignment_id'
         and v_map ? (v_content ->> 'assignment_id') then
        v_content := jsonb_set(v_content, '{assignment_id}',
          to_jsonb(v_map ->> (v_content ->> 'assignment_id')));
      end if;

      insert into public.lessons (
        module_id, version_id, tenant_id, type, title, position,
        is_required, est_minutes, content
      )
      values (
        v_new_module_id, v_new_version_id, v_source.tenant_id,
        v_lesson.type, v_lesson.title, v_lesson.position,
        v_lesson.is_required, v_lesson.est_minutes, v_content
      )
      returning id into v_new_lesson_id;

      insert into public.lesson_resources (
        lesson_id, version_id, tenant_id, name, storage_path, kind, size_bytes
      )
      select v_new_lesson_id, v_new_version_id, v_source.tenant_id,
             r.name, r.storage_path, r.kind, r.size_bytes
      from public.lesson_resources r
      where r.tenant_id = v_source.tenant_id and r.version_id = v_source.id
        and r.lesson_id = v_lesson.id;
    end loop;
  end loop;

  -- Ponderaciones: los elementos automáticos ya existen; copia pesos y manuales.
  update public.grade_items g
  set weight = s.weight
  from public.grade_items s
  where s.version_id = v_source.id and s.source_type <> 'manual'
    and g.version_id = v_new_version_id and g.source_type = s.source_type
    and g.source_id = (v_map ->> s.source_id::text)::uuid;

  insert into public.grade_items (tenant_id, version_id, source_type, title, weight, max_score)
  select s.tenant_id, v_new_version_id, 'manual', s.title, s.weight, s.max_score
  from public.grade_items s
  where s.version_id = v_source.id and s.source_type = 'manual';

  return v_new_version_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: autoría (borrador) y lectura (autores y docentes de la edición)
-- ---------------------------------------------------------------------------
create policy assessments_select on public.assessments for select to authenticated
  using (app.can_read_version(version_id));
create policy assessments_insert on public.assessments for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy assessments_update on public.assessments for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy assessments_delete on public.assessments for delete to authenticated
  using (app.can_edit_version(version_id));

create policy questions_select on public.questions for select to authenticated
  using (app.can_read_version(version_id));
create policy questions_insert on public.questions for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy questions_update on public.questions for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy questions_delete on public.questions for delete to authenticated
  using (app.can_edit_version(version_id));

create policy question_options_select on public.question_options for select to authenticated
  using (app.can_read_version(version_id));
create policy question_options_insert on public.question_options for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy question_options_update on public.question_options for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy question_options_delete on public.question_options for delete to authenticated
  using (app.can_edit_version(version_id));

create policy question_keys_select on public.question_keys for select to authenticated
  using (app.can_read_version(version_id));
create policy question_keys_insert on public.question_keys for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy question_keys_update on public.question_keys for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy question_keys_delete on public.question_keys for delete to authenticated
  using (app.can_edit_version(version_id));

create policy rubrics_select on public.rubrics for select to authenticated
  using (app.can_read_version(version_id));
create policy rubrics_insert on public.rubrics for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy rubrics_update on public.rubrics for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy rubrics_delete on public.rubrics for delete to authenticated
  using (app.can_edit_version(version_id));

create policy rubric_criteria_select on public.rubric_criteria for select to authenticated
  using (app.can_read_version(version_id));
create policy rubric_criteria_insert on public.rubric_criteria for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy rubric_criteria_update on public.rubric_criteria for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy rubric_criteria_delete on public.rubric_criteria for delete to authenticated
  using (app.can_edit_version(version_id));

create policy rubric_levels_select on public.rubric_levels for select to authenticated
  using (app.can_read_version(version_id));
create policy rubric_levels_insert on public.rubric_levels for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy rubric_levels_update on public.rubric_levels for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy rubric_levels_delete on public.rubric_levels for delete to authenticated
  using (app.can_edit_version(version_id));

create policy assignments_select on public.assignments for select to authenticated
  using (app.can_read_version(version_id));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (app.can_edit_version(version_id));
create policy assignments_update on public.assignments for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy assignments_delete on public.assignments for delete to authenticated
  using (app.can_edit_version(version_id));

create policy grade_items_select on public.grade_items for select to authenticated
  using (app.can_read_version(version_id));
create policy grade_items_insert on public.grade_items for insert to authenticated
  with check (source_type = 'manual' and app.can_edit_version(version_id));
create policy grade_items_update on public.grade_items for update to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));
create policy grade_items_delete on public.grade_items for delete to authenticated
  using (source_type = 'manual' and app.can_edit_version(version_id));

-- Lectura de resultados: docentes de la edición / administradores. Coordinador: solo notas.
create policy attempts_select on public.attempts for select to authenticated
  using (app.can_manage_enrollment(enrollment_id));
create policy attempt_answers_select on public.attempt_answers for select to authenticated
  using (exists (
    select 1 from public.attempts a
    where a.id = attempt_answers.attempt_id and app.can_manage_enrollment(a.enrollment_id)
  ));
create policy submissions_select on public.submissions for select to authenticated
  using (app.can_manage_enrollment(enrollment_id));
create policy submission_scores_select on public.submission_scores for select to authenticated
  using (exists (
    select 1 from public.submissions s
    where s.id = submission_scores.submission_id and app.can_manage_enrollment(s.enrollment_id)
  ));
create policy grades_select on public.grades for select to authenticated
  using (app.can_manage_enrollment(enrollment_id) or app.is_client_coordinator(client_id));

-- ---------------------------------------------------------------------------
-- Permisos de columnas
-- ---------------------------------------------------------------------------
grant select on public.assessments, public.questions, public.question_options, public.question_keys,
  public.rubrics, public.rubric_criteria, public.rubric_levels, public.assignments,
  public.grade_items, public.attempts, public.attempt_answers, public.submissions,
  public.submission_scores, public.grades to authenticated;

grant insert (tenant_id, version_id, title, instructions, settings) on public.assessments to authenticated;
grant update (title, instructions, settings) on public.assessments to authenticated;
grant delete on public.assessments to authenticated;

grant insert (tenant_id, version_id, assessment_id, position, type, prompt, points, feedback_ok, feedback_bad, tags)
  on public.questions to authenticated;
grant update (position, prompt, points, feedback_ok, feedback_bad, tags) on public.questions to authenticated;
grant delete on public.questions to authenticated;

grant insert (tenant_id, version_id, question_id, label, position) on public.question_options to authenticated;
grant update (label, position) on public.question_options to authenticated;
grant delete on public.question_options to authenticated;

grant insert (question_id, tenant_id, version_id, answer) on public.question_keys to authenticated;
grant update (answer) on public.question_keys to authenticated;
grant delete on public.question_keys to authenticated;

grant insert (tenant_id, version_id, title) on public.rubrics to authenticated;
grant update (title) on public.rubrics to authenticated;
grant delete on public.rubrics to authenticated;

grant insert (tenant_id, version_id, rubric_id, title, position) on public.rubric_criteria to authenticated;
grant update (title, position) on public.rubric_criteria to authenticated;
grant delete on public.rubric_criteria to authenticated;

grant insert (tenant_id, version_id, criterion_id, label, descriptor, points, position)
  on public.rubric_levels to authenticated;
grant update (label, descriptor, points, position) on public.rubric_levels to authenticated;
grant delete on public.rubric_levels to authenticated;

grant insert (tenant_id, version_id, title, instructions, rubric_id, submission_types, due_at, allow_late, late_penalty_pct, max_score)
  on public.assignments to authenticated;
grant update (title, instructions, rubric_id, submission_types, due_at, allow_late, late_penalty_pct, max_score)
  on public.assignments to authenticated;
grant delete on public.assignments to authenticated;

grant insert (tenant_id, version_id, source_type, title, weight, max_score) on public.grade_items to authenticated;
grant update (title, weight, max_score) on public.grade_items to authenticated;
grant delete on public.grade_items to authenticated;

-- Helpers y RPC: nada por defecto
revoke all on function app.can_edit_version(uuid) from public, anon, authenticated;
revoke all on function app.can_read_version(uuid) from public, anon, authenticated;
revoke all on function app.can_manage_enrollment(uuid) from public, anon, authenticated;
revoke all on function app.validate_assessment_settings(jsonb) from public, anon, authenticated;
revoke all on function app.question_key_problem(uuid, public.question_type, jsonb) from public, anon, authenticated;
revoke all on function app.remap_key(public.question_type, jsonb, jsonb) from public, anon, authenticated;
revoke all on function app.guard_activity_content() from public, anon, authenticated;
revoke all on function app.sync_grade_item() from public, anon, authenticated;
revoke all on function app.validate_version_activities(uuid) from public, anon, authenticated;
revoke all on function public.publish_version(uuid) from public, anon, authenticated;
revoke all on function public.create_draft_from_version(uuid) from public, anon, authenticated;

grant execute on function app.can_edit_version(uuid) to authenticated;
grant execute on function app.can_read_version(uuid) to authenticated;
grant execute on function app.can_manage_enrollment(uuid) to authenticated;
grant execute on function public.publish_version(uuid) to authenticated;
grant execute on function public.create_draft_from_version(uuid) to authenticated;
