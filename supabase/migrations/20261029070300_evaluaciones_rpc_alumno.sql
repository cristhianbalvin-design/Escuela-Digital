-- Paso 9B (3/4): RPC de cuestionarios para el alumno + corrección y notas.
-- El alumno nunca lee las tablas directamente; jamás recibe las claves hasta que se permite.

-- ---------------------------------------------------------------------------
-- Helpers internos (sin EXECUTE para nadie salvo el propietario)
-- ---------------------------------------------------------------------------
create or replace function app.results_visible(p_settings jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_mode text := coalesce(p_settings ->> 'show_results', 'immediate');
  v_close timestamptz;
begin
  if v_mode = 'never' then
    return false;
  end if;
  if v_mode = 'after_close' then
    v_close := nullif(p_settings ->> 'closes_at', '')::timestamptz;
    return v_close is null or now() >= v_close;
  end if;
  return true;
end;
$$;

create or replace function app.norm_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g')),
                   'áéíóúü', 'aeiouu');
$$;

create or replace function app.answer_is_correct(p_type public.question_type, p_key jsonb, p_answer jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_a text[];
  v_k text[];
begin
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' or p_key is null then
    return false;
  end if;

  if p_type = 'single' then
    return (p_answer ->> 'option_id') is not null
       and (p_answer ->> 'option_id') = (p_key ->> 'option_id');
  elsif p_type = 'multiple' then
    if jsonb_typeof(p_answer -> 'option_ids') <> 'array' then
      return false;
    end if;
    select coalesce(array_agg(distinct x order by x), '{}') into v_a
    from jsonb_array_elements_text(p_answer -> 'option_ids') x;
    select coalesce(array_agg(distinct x order by x), '{}') into v_k
    from jsonb_array_elements_text(p_key -> 'option_ids') x;
    return v_a = v_k;
  elsif p_type = 'true_false' then
    return jsonb_typeof(p_answer -> 'value') = 'boolean'
       and (p_answer -> 'value') = (p_key -> 'value');
  elsif p_type = 'short' then
    if jsonb_typeof(p_answer -> 'text') <> 'string' then
      return false;
    end if;
    return exists (
      select 1 from jsonb_array_elements_text(p_key -> 'accepted') acc
      where app.norm_text(acc) = app.norm_text(p_answer ->> 'text')
    );
  end if;
  return false;
end;
$$;

-- Acceso del alumno a una actividad (cuestionario/tarea) de su edición.
create or replace function app.student_activity_access(
  p_enrollment_id uuid,
  p_kind text,
  p_activity_id uuid,
  out o_tenant uuid,
  out o_client uuid,
  out o_offering uuid,
  out o_version uuid,
  out o_lesson uuid
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_lesson uuid;
  v_module uuid;
  v_unlock timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;

  if v_e.id is null
     or v_e.user_id <> (select auth.uid())
     or v_e.status <> 'active'
     or not app.has_tenant_role(v_e.tenant_id, array['student']::public.tenant_role[]) then
    raise exception 'No se permite esta actividad en esta matrícula' using errcode = '42501';
  end if;

  select o.* into v_o
  from public.offerings o
  where o.id = v_e.offering_id and o.deleted_at is null;

  if v_o.id is null or v_o.status not in ('open', 'running') then
    raise exception 'La edición no admite actividades ahora' using errcode = '23514';
  end if;

  select l.id, l.module_id into v_lesson, v_module
  from public.lessons l
  where l.tenant_id = v_o.tenant_id
    and l.version_id = v_o.version_id
    and l.type::text = p_kind
    and (l.content ->> (case p_kind when 'quiz' then 'assessment_id' else 'assignment_id' end))
        = p_activity_id::text
  limit 1;

  if v_lesson is null then
    raise exception 'Actividad no disponible' using errcode = '42501';
  end if;

  v_unlock := app.module_unlock_at(v_o.id, v_module);
  if v_unlock is not null and v_unlock > now() then
    raise exception 'La actividad todavía no está disponible' using errcode = '23514';
  end if;

  o_tenant := v_e.tenant_id;
  o_client := v_e.client_id;
  o_offering := v_o.id;
  o_version := v_o.version_id;
  o_lesson := v_lesson;
end;
$$;

-- Intento propio (del alumno autenticado).
create or replace function app.own_attempt(p_attempt_id uuid)
returns public.attempts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select a.* into v_att
  from public.attempts a
  join public.enrollments e on e.id = a.enrollment_id
  where a.id = p_attempt_id
    and e.user_id = (select auth.uid())
    and e.status in ('active', 'completed')
    and app.has_tenant_role(e.tenant_id, array['student']::public.tenant_role[]);

  if v_att.id is null then
    raise exception 'Intento no disponible' using errcode = '42501';
  end if;
  return v_att;
end;
$$;

-- Recalcula el progreso de la matrícula (misma regla que mark_lesson_progress).
create or replace function app.recompute_progress(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_req integer;
  v_total integer;
  v_done integer;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  select o.* into v_o from public.offerings o where o.id = v_e.offering_id;
  if v_e.id is null or v_o.id is null then
    return;
  end if;

  select count(*) filter (where l.is_required), count(*) into v_req, v_total
  from public.lessons l
  where l.tenant_id = v_o.tenant_id and l.version_id = v_o.version_id;

  if v_req > 0 then
    v_total := v_req;
    select count(*) into v_done
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.enrollment_id = p_enrollment_id and lp.status = 'completed' and l.is_required;
  else
    select count(*) into v_done
    from public.lesson_progress lp
    where lp.enrollment_id = p_enrollment_id and lp.status = 'completed';
  end if;

  update public.enrollments e
  set progress_pct = case when v_total = 0 then 0 else round(100.0 * v_done / v_total, 2) end,
      last_activity_at = now()
  where e.id = p_enrollment_id;
end;
$$;

-- Completa las lecciones que referencian una actividad.
create or replace function app.complete_activity_lesson(p_enrollment_id uuid, p_kind text, p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  select o.* into v_o from public.offerings o where o.id = v_e.offering_id;
  if v_e.id is null or v_o.id is null then
    return;
  end if;

  insert into public.lesson_progress as lp (
    enrollment_id, lesson_id, tenant_id, client_id, status,
    completed_at, last_position_seconds, time_spent_seconds
  )
  select p_enrollment_id, l.id, v_e.tenant_id, v_e.client_id, 'completed', now(), 0, 0
  from public.lessons l
  where l.tenant_id = v_o.tenant_id and l.version_id = v_o.version_id
    and l.type::text = p_kind
    and (l.content ->> (case p_kind when 'quiz' then 'assessment_id' else 'assignment_id' end))
        = p_activity_id::text
  on conflict (enrollment_id, lesson_id) do update
  set status = 'completed',
      completed_at = coalesce(lp.completed_at, now());

  perform app.recompute_progress(p_enrollment_id);
end;
$$;

-- Nota del cuestionario = mejor intento calificado.
create or replace function app.sync_assessment_grade(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
  v_best public.attempts%rowtype;
  v_item uuid;
  v_pass numeric;
  v_settings jsonb;
begin
  select a.* into v_att from public.attempts a where a.id = p_attempt_id;
  if v_att.id is null then
    return;
  end if;

  select b.* into v_best
  from public.attempts b
  where b.enrollment_id = v_att.enrollment_id
    and b.assessment_id = v_att.assessment_id
    and b.status = 'graded'
  order by b.score / b.max_score desc, b.attempt_no desc
  limit 1;

  if v_best.id is null then
    return;
  end if;

  select gi.id into v_item
  from public.grade_items gi
  join public.assessments a on a.version_id = gi.version_id and a.id = gi.source_id
  where gi.source_type = 'assessment' and a.id = v_att.assessment_id;

  if v_item is not null then
    insert into public.grades as g (
      enrollment_id, grade_item_id, tenant_id, client_id, score, max_score, graded_at
    )
    values (
      v_att.enrollment_id, v_item, v_att.tenant_id, v_att.client_id,
      v_best.score, v_best.max_score, now()
    )
    on conflict (enrollment_id, grade_item_id) do update
    set score = excluded.score,
        max_score = excluded.max_score,
        graded_at = now()
    where g.adjusted_reason is null;
  end if;

  select a.settings into v_settings from public.assessments a where a.id = v_att.assessment_id;
  v_pass := coalesce((v_settings ->> 'pass_pct')::numeric, 0);
  if 100.0 * v_best.score / v_best.max_score >= v_pass then
    perform app.complete_activity_lesson(v_att.enrollment_id, 'quiz', v_att.assessment_id);
  end if;
end;
$$;

-- Cierra el intento según las respuestas guardadas.
create or replace function app.settle_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
  v_max numeric;
  v_pending integer;
  v_sum numeric;
begin
  select a.* into v_att from public.attempts a where a.id = p_attempt_id for update;
  if v_att.id is null or v_att.status = 'in_progress' then
    return;
  end if;

  select coalesce(sum(q.points), 0) into v_max
  from public.questions q where q.assessment_id = v_att.assessment_id;

  select count(*) filter (where aa.score is null), coalesce(sum(aa.score), 0)
    into v_pending, v_sum
  from public.attempt_answers aa where aa.attempt_id = v_att.id;

  if v_pending > 0 then
    update public.attempts a
    set status = 'submitted', score = null, max_score = v_max
    where a.id = v_att.id;
  else
    update public.attempts a
    set status = 'graded', score = v_sum, max_score = v_max
    where a.id = v_att.id;
    perform app.sync_assessment_grade(v_att.id);
  end if;
end;
$$;

create or replace function app.finalize_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
begin
  select a.* into v_att from public.attempts a where a.id = p_attempt_id for update;
  if v_att.id is null or v_att.status <> 'in_progress' then
    return;
  end if;

  insert into public.attempt_answers (attempt_id, question_id, tenant_id)
  select v_att.id, q.id, v_att.tenant_id
  from public.questions q where q.assessment_id = v_att.assessment_id
  on conflict (attempt_id, question_id) do nothing;

  update public.attempt_answers aa
  set score = case when app.answer_is_correct(q.type, k.answer, aa.answer) then q.points else 0 end
  from public.questions q
  join public.question_keys k on k.question_id = q.id
  where aa.attempt_id = v_att.id and aa.question_id = q.id and q.type <> 'essay';

  update public.attempts a
  set status = 'submitted', submitted_at = now()
  where a.id = v_att.id;

  perform app.settle_attempt(v_att.id);
end;
$$;

-- Resumen de notas de una matrícula (0-20).
create or replace function app.grade_summary(p_enrollment_id uuid, p_hide boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_items jsonb;
  v_num numeric;
  v_den numeric;
  v_open integer;
  v_partial numeric;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  select o.* into v_o from public.offerings o where o.id = v_e.offering_id;
  if v_e.id is null or v_o.id is null then
    return jsonb_build_object('items', '[]'::jsonb, 'partial', null, 'final', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'grade_item_id', t.id, 'title', t.title, 'source_type', t.source_type,
           'weight', t.weight, 'score', t.score, 'max_score', t.max_score, 'hidden', t.hidden,
           'normalized', case when t.score is null then null else round(20 * t.score / t.max_score, 2) end
         ) order by t.source_type, t.title), '[]'::jsonb),
         coalesce(sum(t.weight * t.score / t.max_score) filter (where t.score is not null and t.weight > 0), 0),
         coalesce(sum(t.weight) filter (where t.score is not null and t.weight > 0), 0),
         count(*) filter (where t.score is null and t.weight > 0)
    into v_items, v_num, v_den, v_open
  from (
    select gi.id, gi.title, gi.source_type::text as source_type, gi.weight,
           case when h.hidden then null else g.score end as score,
           case when h.hidden then null else g.max_score end as max_score,
           h.hidden
    from public.grade_items gi
    left join public.grades g on g.grade_item_id = gi.id and g.enrollment_id = p_enrollment_id
    cross join lateral (
      select (p_hide and gi.source_type = 'assessment' and exists (
        select 1 from public.assessments a
        where a.id = gi.source_id and not app.results_visible(a.settings)
      )) as hidden
    ) h
    where gi.tenant_id = v_o.tenant_id and gi.version_id = v_o.version_id
  ) t;

  v_partial := case when v_den > 0 then round(20 * v_num / v_den, 2) end;

  return jsonb_build_object(
    'items', v_items,
    'partial', v_partial,
    'final', case when v_open = 0 and v_den > 0 then v_partial end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC del alumno
-- ---------------------------------------------------------------------------
create or replace function public.get_assessment_info(p_enrollment_id uuid, p_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc record;
  v_a public.assessments%rowtype;
  v_visible boolean;
  v_open timestamptz;
  v_close timestamptz;
  v_max integer;
  v_used integer;
  v_nq integer;
  v_points numeric;
  v_progress uuid;
  v_reason text;
  v_attempts jsonb;
begin
  select * into v_acc from app.student_activity_access(p_enrollment_id, 'quiz', p_assessment_id);

  select a.* into v_a
  from public.assessments a where a.id = p_assessment_id and a.version_id = v_acc.o_version;
  if v_a.id is null then
    raise exception 'Actividad no disponible' using errcode = '42501';
  end if;

  v_visible := app.results_visible(v_a.settings);
  v_open := nullif(v_a.settings ->> 'opens_at', '')::timestamptz;
  v_close := nullif(v_a.settings ->> 'closes_at', '')::timestamptz;
  v_max := (v_a.settings ->> 'max_attempts')::numeric::integer;

  select count(*), coalesce(sum(q.points), 0) into v_nq, v_points
  from public.questions q where q.assessment_id = v_a.id;

  select count(*) into v_used
  from public.attempts at where at.enrollment_id = p_enrollment_id and at.assessment_id = v_a.id;

  select at.id into v_progress
  from public.attempts at
  where at.enrollment_id = p_enrollment_id and at.assessment_id = v_a.id and at.status = 'in_progress';

  if v_nq = 0 then
    v_reason := 'no_questions';
  elsif v_progress is not null then
    v_reason := null;
  elsif v_open is not null and now() < v_open then
    v_reason := 'not_open';
  elsif v_close is not null and now() >= v_close then
    v_reason := 'closed';
  elsif v_max is not null and v_used >= v_max then
    v_reason := 'no_attempts';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', at.id, 'attempt_no', at.attempt_no, 'status', at.status,
           'submitted_at', at.submitted_at,
           'score', case when v_visible and at.status = 'graded' then at.score end,
           'max_score', case when v_visible and at.status = 'graded' then at.max_score end,
           'pending_review', at.status = 'submitted'
         ) order by at.attempt_no), '[]'::jsonb)
    into v_attempts
  from public.attempts at
  where at.enrollment_id = p_enrollment_id and at.assessment_id = v_a.id;

  return jsonb_build_object(
    'assessment_id', v_a.id,
    'title', v_a.title,
    'instructions', v_a.instructions,
    'question_count', v_nq,
    'total_points', v_points,
    'time_limit_minutes', (v_a.settings ->> 'time_limit_minutes')::numeric::integer,
    'max_attempts', v_max,
    'pass_pct', (v_a.settings ->> 'pass_pct')::numeric,
    'opens_at', v_open,
    'closes_at', v_close,
    'show_results', coalesce(v_a.settings ->> 'show_results', 'immediate'),
    'results_visible', v_visible,
    'attempts_used', v_used,
    'in_progress_attempt_id', v_progress,
    'can_start', v_reason is null,
    'reason', v_reason,
    'attempts', v_attempts
  );
end;
$$;

create or replace function public.start_attempt(p_enrollment_id uuid, p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc record;
  v_a public.assessments%rowtype;
  v_att public.attempts%rowtype;
  v_open timestamptz;
  v_close timestamptz;
  v_limit integer;
  v_max integer;
  v_used integer;
  v_deadline timestamptz;
  v_id uuid;
begin
  select * into v_acc from app.student_activity_access(p_enrollment_id, 'quiz', p_assessment_id);

  perform 1 from public.enrollments e where e.id = p_enrollment_id for update;

  select a.* into v_a
  from public.assessments a where a.id = p_assessment_id and a.version_id = v_acc.o_version;
  if v_a.id is null then
    raise exception 'Actividad no disponible' using errcode = '42501';
  end if;

  if not exists (select 1 from public.questions q where q.assessment_id = v_a.id) then
    raise exception 'El cuestionario no tiene preguntas' using errcode = '23514';
  end if;

  select at.* into v_att
  from public.attempts at
  where at.enrollment_id = p_enrollment_id and at.assessment_id = v_a.id and at.status = 'in_progress';

  if v_att.id is not null then
    if v_att.deadline_at is not null and now() > v_att.deadline_at + interval '10 seconds' then
      perform app.finalize_attempt(v_att.id);
    else
      return jsonb_build_object('attempt_id', v_att.id, 'resumed', true);
    end if;
  end if;

  v_open := nullif(v_a.settings ->> 'opens_at', '')::timestamptz;
  v_close := nullif(v_a.settings ->> 'closes_at', '')::timestamptz;
  v_limit := (v_a.settings ->> 'time_limit_minutes')::numeric::integer;
  v_max := (v_a.settings ->> 'max_attempts')::numeric::integer;

  if v_open is not null and now() < v_open then
    raise exception 'El cuestionario aún no está abierto' using errcode = '23514';
  end if;
  if v_close is not null and now() >= v_close then
    raise exception 'El cuestionario ya cerró' using errcode = '23514';
  end if;

  select count(*) into v_used
  from public.attempts at where at.enrollment_id = p_enrollment_id and at.assessment_id = v_a.id;

  if v_max is not null and v_used >= v_max then
    raise exception 'Ya usaste todos tus intentos' using errcode = '23514';
  end if;

  if v_limit is not null then
    v_deadline := now() + make_interval(mins => v_limit);
  end if;
  if v_close is not null and (v_deadline is null or v_close < v_deadline) then
    v_deadline := v_close;
  end if;

  insert into public.attempts (tenant_id, client_id, assessment_id, enrollment_id, attempt_no, deadline_at)
  values (v_acc.o_tenant, v_acc.o_client, v_a.id, p_enrollment_id, v_used + 1, v_deadline)
  returning id into v_id;

  return jsonb_build_object('attempt_id', v_id, 'resumed', false);
end;
$$;

create or replace function public.get_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
  v_a public.assessments%rowtype;
  v_shuf_q boolean;
  v_shuf_o boolean;
  v_questions jsonb;
begin
  v_att := app.own_attempt(p_attempt_id);

  if v_att.status = 'in_progress'
     and v_att.deadline_at is not null
     and now() > v_att.deadline_at + interval '10 seconds' then
    perform app.finalize_attempt(v_att.id);
    v_att := app.own_attempt(p_attempt_id);
  end if;

  select a.* into v_a from public.assessments a where a.id = v_att.assessment_id;

  if v_att.status <> 'in_progress' then
    return jsonb_build_object(
      'attempt_id', v_att.id, 'assessment_id', v_a.id, 'title', v_a.title,
      'status', v_att.status, 'questions', null
    );
  end if;

  v_shuf_q := coalesce((v_a.settings ->> 'shuffle_questions')::boolean, false);
  v_shuf_o := coalesce((v_a.settings ->> 'shuffle_options')::boolean, false);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'type', q.type, 'prompt', q.prompt, 'points', q.points,
           'answer', aa.answer,
           'options', case when q.type in ('single', 'multiple') then (
             select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by
               case when v_shuf_o then md5(v_att.seed || o.id::text) else lpad(o.position::text, 6, '0') end)
             from public.question_options o where o.question_id = q.id) end
         ) order by
           case when v_shuf_q then md5(v_att.seed || q.id::text) else lpad(q.position::text, 6, '0') end
         ), '[]'::jsonb)
    into v_questions
  from public.questions q
  left join public.attempt_answers aa on aa.attempt_id = v_att.id and aa.question_id = q.id
  where q.assessment_id = v_att.assessment_id;

  return jsonb_build_object(
    'attempt_id', v_att.id, 'assessment_id', v_a.id, 'title', v_a.title,
    'instructions', v_a.instructions, 'status', v_att.status,
    'started_at', v_att.started_at, 'deadline_at', v_att.deadline_at,
    'server_now', now(), 'questions', v_questions
  );
end;
$$;

create or replace function public.save_answer(p_attempt_id uuid, p_question_id uuid, p_answer jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
  v_q public.questions%rowtype;
  v_ans jsonb := p_answer;
  v_ok boolean := true;
begin
  v_att := app.own_attempt(p_attempt_id);

  if v_att.status <> 'in_progress' then
    raise exception 'El intento ya fue enviado' using errcode = '23514';
  end if;
  if v_att.deadline_at is not null and now() > v_att.deadline_at + interval '10 seconds' then
    raise exception 'El tiempo del intento terminó' using errcode = '23514';
  end if;

  select q.* into v_q
  from public.questions q where q.id = p_question_id and q.assessment_id = v_att.assessment_id;
  if v_q.id is null then
    raise exception 'Pregunta no válida' using errcode = '23514';
  end if;

  if v_ans is not null and jsonb_typeof(v_ans) = 'null' then
    v_ans := null;
  end if;

  if v_ans is not null then
    if jsonb_typeof(v_ans) <> 'object' or length(v_ans::text) > 20000 then
      raise exception 'Respuesta no válida' using errcode = '23514';
    end if;

    if v_q.type = 'single' then
      v_ok := jsonb_typeof(v_ans -> 'option_id') = 'string'
        and exists (select 1 from public.question_options o
                    where o.question_id = v_q.id and o.id::text = (v_ans ->> 'option_id'));
    elsif v_q.type = 'multiple' then
      v_ok := jsonb_typeof(v_ans -> 'option_ids') = 'array'
        and not exists (
          select 1 from jsonb_array_elements_text(v_ans -> 'option_ids') x
          where not exists (select 1 from public.question_options o
                            where o.question_id = v_q.id and o.id::text = x));
    elsif v_q.type = 'true_false' then
      v_ok := jsonb_typeof(v_ans -> 'value') = 'boolean';
    elsif v_q.type = 'short' then
      v_ok := jsonb_typeof(v_ans -> 'text') = 'string' and length(v_ans ->> 'text') <= 500;
    else
      v_ok := jsonb_typeof(v_ans -> 'text') = 'string' and length(v_ans ->> 'text') <= 20000;
    end if;

    if not v_ok then
      raise exception 'Respuesta no válida para este tipo de pregunta' using errcode = '23514';
    end if;
  end if;

  insert into public.attempt_answers as aa (attempt_id, question_id, tenant_id, answer)
  values (v_att.id, v_q.id, v_att.tenant_id, v_ans)
  on conflict (attempt_id, question_id) do update set answer = excluded.answer;
end;
$$;

create or replace function public.submit_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
begin
  v_att := app.own_attempt(p_attempt_id);
  if v_att.status = 'in_progress' then
    perform app.finalize_attempt(v_att.id);
    v_att := app.own_attempt(p_attempt_id);
  end if;
  return jsonb_build_object('attempt_id', v_att.id, 'status', v_att.status);
end;
$$;

create or replace function public.get_attempt_result(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
  v_a public.assessments%rowtype;
  v_visible boolean;
  v_reveal boolean;
  v_max integer;
  v_used integer;
  v_close timestamptz;
  v_pass numeric;
  v_review jsonb;
  v_pct numeric;
begin
  v_att := app.own_attempt(p_attempt_id);
  if v_att.status = 'in_progress' then
    raise exception 'El intento sigue en curso' using errcode = '23514';
  end if;

  select a.* into v_a from public.assessments a where a.id = v_att.assessment_id;
  v_visible := app.results_visible(v_a.settings);

  if not v_visible or v_att.status <> 'graded' then
    return jsonb_build_object(
      'attempt_id', v_att.id, 'attempt_no', v_att.attempt_no, 'status', v_att.status,
      'submitted_at', v_att.submitted_at, 'results_visible', v_visible,
      'pending_review', v_att.status = 'submitted'
    );
  end if;

  v_max := (v_a.settings ->> 'max_attempts')::numeric::integer;
  v_close := nullif(v_a.settings ->> 'closes_at', '')::timestamptz;
  v_pass := (v_a.settings ->> 'pass_pct')::numeric;
  select count(*) into v_used
  from public.attempts at where at.enrollment_id = v_att.enrollment_id and at.assessment_id = v_att.assessment_id;
  v_reveal := (v_max is not null and v_used >= v_max) or (v_close is not null and now() >= v_close);
  v_pct := round(100.0 * v_att.score / v_att.max_score, 2);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'type', q.type, 'prompt', q.prompt, 'points', q.points,
           'options', case when q.type in ('single', 'multiple') then (
             select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
             from public.question_options o where o.question_id = q.id) end,
           'answer', aa.answer,
           'score', aa.score,
           'feedback', coalesce(aa.feedback,
             case when aa.score is not null and aa.score >= q.points then q.feedback_ok else q.feedback_bad end),
           'correct', case when v_reveal then k.answer end
         ) order by q.position), '[]'::jsonb)
    into v_review
  from public.questions q
  left join public.attempt_answers aa on aa.attempt_id = v_att.id and aa.question_id = q.id
  left join public.question_keys k on k.question_id = q.id
  where q.assessment_id = v_att.assessment_id;

  return jsonb_build_object(
    'attempt_id', v_att.id, 'attempt_no', v_att.attempt_no, 'status', v_att.status,
    'submitted_at', v_att.submitted_at, 'results_visible', true, 'pending_review', false,
    'score', v_att.score, 'max_score', v_att.max_score, 'pct', v_pct,
    'passed', case when v_pass is null then null else v_pct >= v_pass end,
    'questions', v_review
  );
end;
$$;

create or replace function public.get_my_grades(p_enrollment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_e public.enrollments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  if v_e.id is null or v_e.user_id <> (select auth.uid()) then
    raise exception 'Matrícula no disponible' using errcode = '42501';
  end if;
  return app.grade_summary(p_enrollment_id, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrección manual (docentes de la edición / administradores)
-- ---------------------------------------------------------------------------
create or replace function public.grade_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_score numeric,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.attempts%rowtype;
  v_points numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  select a.* into v_att from public.attempts a where a.id = p_attempt_id;
  if v_att.id is null or not app.can_manage_enrollment(v_att.enrollment_id) then
    raise exception 'No se permite calificar este intento' using errcode = '42501';
  end if;
  if v_att.status = 'in_progress' then
    raise exception 'El intento sigue en curso' using errcode = '23514';
  end if;

  select q.points into v_points
  from public.questions q where q.id = p_question_id and q.assessment_id = v_att.assessment_id;
  if v_points is null then
    raise exception 'Pregunta no válida' using errcode = '23514';
  end if;
  if p_score is null or p_score < 0 or p_score > v_points then
    raise exception 'El puntaje debe estar entre 0 y %', v_points using errcode = '23514';
  end if;

  insert into public.attempt_answers as aa (
    attempt_id, question_id, tenant_id, score, feedback, graded_by, graded_at
  )
  values (
    v_att.id, p_question_id, v_att.tenant_id, p_score,
    nullif(btrim(p_feedback), ''), (select auth.uid()), now()
  )
  on conflict (attempt_id, question_id) do update
  set score = excluded.score,
      feedback = excluded.feedback,
      graded_by = excluded.graded_by,
      graded_at = excluded.graded_at;

  perform app.settle_attempt(v_att.id);

  select a.* into v_att from public.attempts a where a.id = p_attempt_id;
  return jsonb_build_object('status', v_att.status, 'score', v_att.score, 'max_score', v_att.max_score);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_lesson_progress: quiz/tarea solo se completan al entregar/aprobar
-- ---------------------------------------------------------------------------
create or replace function public.mark_lesson_progress(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_status public.lesson_progress_status,
  p_position_seconds integer default null,
  p_time_spent_delta integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_offering public.offerings%rowtype;
  v_module_id uuid;
  v_ltype text;
  v_unlock timestamptz;
  v_total integer;
  v_done integer;
  v_pct numeric(5, 2);
  v_delta integer := least(greatest(coalesce(p_time_spent_delta, 0), 0), 3600);
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'El estado es obligatorio' using errcode = '23514';
  end if;

  select e.* into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if v_enrollment.id is null
     or v_enrollment.user_id <> (select auth.uid())
     or v_enrollment.status not in ('active', 'completed')
     or not app.has_tenant_role(v_enrollment.tenant_id, array['student']::public.tenant_role[]) then
    raise exception 'No se permite registrar progreso en esta matrícula' using errcode = '42501';
  end if;

  select o.* into v_offering
  from public.offerings o
  where o.id = v_enrollment.offering_id and o.deleted_at is null;

  if v_offering.id is null then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;

  select l.module_id, l.type::text into v_module_id, v_ltype
  from public.lessons l
  where l.id = p_lesson_id
    and l.tenant_id = v_offering.tenant_id
    and l.version_id = v_offering.version_id;

  if v_module_id is null then
    raise exception 'La lección no pertenece a esta edición' using errcode = '23514';
  end if;

  if v_ltype in ('quiz', 'assignment') and p_status = 'completed' then
    raise exception 'Esta actividad se completa al entregarla o aprobarla' using errcode = '23514';
  end if;

  v_unlock := app.module_unlock_at(v_offering.id, v_module_id);
  if v_unlock is not null and v_unlock > now() then
    raise exception 'La lección todavía no está disponible' using errcode = '23514';
  end if;

  insert into public.lesson_progress as lp (
    enrollment_id, lesson_id, tenant_id, client_id, status,
    completed_at, last_position_seconds, time_spent_seconds
  )
  values (
    p_enrollment_id, p_lesson_id, v_enrollment.tenant_id,
    v_enrollment.client_id, p_status,
    case when p_status = 'completed' then now() end,
    greatest(coalesce(p_position_seconds, 0), 0), v_delta
  )
  on conflict (enrollment_id, lesson_id) do update
  set status = case
        when lp.status = 'completed' then 'completed'::public.lesson_progress_status
        else excluded.status
      end,
      completed_at = case
        when lp.status = 'completed' then lp.completed_at
        when excluded.status = 'completed' then now()
        else null
      end,
      last_position_seconds = case
        when p_position_seconds is null then lp.last_position_seconds
        else greatest(p_position_seconds, 0)
      end,
      time_spent_seconds = lp.time_spent_seconds + v_delta;

  select count(*) filter (where l.is_required), count(*)
    into v_total, v_done
  from public.lessons l
  where l.tenant_id = v_offering.tenant_id and l.version_id = v_offering.version_id;

  if v_total > 0 then
    select count(*) into v_done
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    where lp.enrollment_id = p_enrollment_id and lp.status = 'completed' and l.is_required;
  else
    select count(*) into v_total
    from public.lessons l
    where l.tenant_id = v_offering.tenant_id and l.version_id = v_offering.version_id;
    select count(*) into v_done
    from public.lesson_progress lp
    where lp.enrollment_id = p_enrollment_id and lp.status = 'completed';
  end if;

  v_pct := case when v_total = 0 then 0 else round(100.0 * v_done / v_total, 2) end;

  update public.enrollments e
  set progress_pct = v_pct, last_activity_at = now()
  where e.id = p_enrollment_id;

  return jsonb_build_object('enrollment_id', p_enrollment_id, 'lesson_id', p_lesson_id, 'progress_pct', v_pct);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function app.results_visible(jsonb) from public, anon, authenticated;
revoke all on function app.norm_text(text) from public, anon, authenticated;
revoke all on function app.answer_is_correct(public.question_type, jsonb, jsonb) from public, anon, authenticated;
revoke all on function app.student_activity_access(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app.own_attempt(uuid) from public, anon, authenticated;
revoke all on function app.recompute_progress(uuid) from public, anon, authenticated;
revoke all on function app.complete_activity_lesson(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app.sync_assessment_grade(uuid) from public, anon, authenticated;
revoke all on function app.settle_attempt(uuid) from public, anon, authenticated;
revoke all on function app.finalize_attempt(uuid) from public, anon, authenticated;
revoke all on function app.grade_summary(uuid, boolean) from public, anon, authenticated;

revoke all on function public.get_assessment_info(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_attempt(uuid) from public, anon, authenticated;
revoke all on function public.save_answer(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_attempt(uuid) from public, anon, authenticated;
revoke all on function public.get_attempt_result(uuid) from public, anon, authenticated;
revoke all on function public.get_my_grades(uuid) from public, anon, authenticated;
revoke all on function public.grade_attempt_answer(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.mark_lesson_progress(uuid, uuid, public.lesson_progress_status, integer, integer) from public, anon, authenticated;

grant execute on function public.get_assessment_info(uuid, uuid) to authenticated;
grant execute on function public.start_attempt(uuid, uuid) to authenticated;
grant execute on function public.get_attempt(uuid) to authenticated;
grant execute on function public.save_answer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.submit_attempt(uuid) to authenticated;
grant execute on function public.get_attempt_result(uuid) to authenticated;
grant execute on function public.get_my_grades(uuid) to authenticated;
grant execute on function public.grade_attempt_answer(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.mark_lesson_progress(uuid, uuid, public.lesson_progress_status, integer, integer) to authenticated;
