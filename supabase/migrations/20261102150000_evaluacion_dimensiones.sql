-- Dimensiones de evaluación por edición: nombre + porcentaje, nota 0-20.
-- Una dimensión puede ser manual o ser la asistencia (calculada desde el módulo de asistencia).
-- Si una edición tiene dimensiones, la nota final se calcula con ellas y exige que sumen 100 %.
create table public.offering_dimensions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  offering_id uuid not null references public.offerings (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  weight_pct numeric(5,2) not null check (weight_pct > 0 and weight_pct <= 100),
  kind text not null default 'manual' check (kind in ('manual', 'attendance')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offering_dimensions_offering_idx on public.offering_dimensions (offering_id, position);
create index offering_dimensions_tenant_idx on public.offering_dimensions (tenant_id);
create unique index offering_dimensions_one_attendance
  on public.offering_dimensions (offering_id) where kind = 'attendance';
create trigger offering_dimensions_touch before update on public.offering_dimensions
  for each row execute function app.touch_updated_at();

create table public.dimension_scores (
  dimension_id uuid not null references public.offering_dimensions (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  score numeric(4,2) not null check (score >= 0 and score <= 20),
  comment text check (comment is null or char_length(comment) <= 300),
  graded_by uuid references auth.users (id),
  graded_at timestamptz not null default now(),
  primary key (dimension_id, enrollment_id)
);
create index dimension_scores_enrollment_idx on public.dimension_scores (enrollment_id);
create index dimension_scores_tenant_idx on public.dimension_scores (tenant_id);

alter table public.offering_dimensions enable row level security;
alter table public.dimension_scores enable row level security;
revoke all on public.offering_dimensions, public.dimension_scores from anon, authenticated;
grant select on public.offering_dimensions, public.dimension_scores to authenticated;

create policy offering_dimensions_select on public.offering_dimensions
  for select to authenticated using (app.can_manage_offering(offering_id));
create policy dimension_scores_select on public.dimension_scores
  for select to authenticated using (exists (
    select 1 from public.offering_dimensions d
    where d.id = dimension_id and app.can_manage_offering(d.offering_id)));

create function public.get_offering_dimensions(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not (app.can_manage_offering(p_offering_id) or app.is_client_coordinator(v_o.client_id)) then
    raise exception 'No se permite ver las dimensiones de esta edición' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dimensions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'weight_pct', d.weight_pct, 'kind', d.kind,
        'scored', (select count(*) from public.dimension_scores s where s.dimension_id = d.id)
      ) order by d.position, d.created_at), '[]'::jsonb)
      from public.offering_dimensions d where d.offering_id = p_offering_id),
    'total', (select coalesce(sum(d.weight_pct), 0) from public.offering_dimensions d
              where d.offering_id = p_offering_id)
  );
end;
$$;

create function public.save_offering_dimensions(p_offering_id uuid, p_dimensions jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_name text;
  v_w numeric;
  v_kind text;
  v_total numeric := 0;
  v_att integer := 0;
  v_pos integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite configurar la evaluación de esta edición' using errcode = '42501';
  end if;
  if p_dimensions is null or jsonb_typeof(p_dimensions) <> 'array' or jsonb_array_length(p_dimensions) > 12 then
    raise exception 'Lista de dimensiones no válida (máximo 12)' using errcode = '23514';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_dimensions) e loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_w := (v_item ->> 'weight_pct')::numeric;
    v_kind := coalesce(nullif(v_item ->> 'kind', ''), 'manual');
    v_id := nullif(v_item ->> 'id', '')::uuid;
    if char_length(v_name) < 1 or char_length(v_name) > 80 then
      raise exception 'Cada dimensión necesita un nombre de hasta 80 caracteres' using errcode = '23514';
    end if;
    if v_w is null or v_w <= 0 or v_w > 100 then
      raise exception 'El porcentaje de "%" debe estar entre 0 y 100', v_name using errcode = '23514';
    end if;
    if v_kind not in ('manual', 'attendance') then
      raise exception 'Tipo de dimensión no válido' using errcode = '23514';
    end if;
    if v_kind = 'attendance' then v_att := v_att + 1; end if;
    if v_id is not null then
      if v_id = any (v_ids) or not exists (
        select 1 from public.offering_dimensions d where d.id = v_id and d.offering_id = p_offering_id
      ) then
        raise exception 'Dimensión no válida' using errcode = '23514';
      end if;
      v_ids := v_ids || v_id;
    end if;
    v_total := v_total + v_w;
  end loop;
  if v_att > 1 then
    raise exception 'Solo puede haber una dimensión de asistencia' using errcode = '23514';
  end if;
  if v_total > 100 then
    raise exception 'Los porcentajes suman % y no pueden pasar de 100', v_total using errcode = '23514';
  end if;

  delete from public.offering_dimensions d
  where d.offering_id = p_offering_id and not (d.id = any (v_ids));
  update public.offering_dimensions d set kind = 'manual'
  where d.offering_id = p_offering_id and d.kind = 'attendance';

  for v_item in select e.value from jsonb_array_elements(p_dimensions) e loop
    v_pos := v_pos + 1;
    v_id := nullif(v_item ->> 'id', '')::uuid;
    v_name := btrim(v_item ->> 'name');
    v_w := (v_item ->> 'weight_pct')::numeric;
    v_kind := coalesce(nullif(v_item ->> 'kind', ''), 'manual');
    if v_id is null then
      insert into public.offering_dimensions (tenant_id, offering_id, name, weight_pct, kind, position)
      values (v_o.tenant_id, p_offering_id, v_name, v_w, v_kind, v_pos);
    else
      update public.offering_dimensions d
      set name = v_name, weight_pct = v_w, kind = v_kind, position = v_pos
      where d.id = v_id;
    end if;
  end loop;
  return public.get_offering_dimensions(p_offering_id);
end;
$$;

revoke all on function public.get_offering_dimensions(uuid), public.save_offering_dimensions(uuid, jsonb)
  from public, anon;
grant execute on function public.get_offering_dimensions(uuid), public.save_offering_dimensions(uuid, jsonb)
  to authenticated;

-- Resumen de notas: con dimensiones usa porcentajes (0-20 por dimensión); si no, el modo anterior.
create or replace function app.grade_summary(p_enrollment_id uuid, p_hide boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_items jsonb;
  v_num numeric;
  v_den numeric;
  v_open integer;
  v_partial numeric;
  v_total numeric;
begin
  select e.* into v_e from public.enrollments e where e.id = p_enrollment_id;
  select o.* into v_o from public.offerings o where o.id = v_e.offering_id;
  if v_e.id is null or v_o.id is null then
    return jsonb_build_object('items', '[]'::jsonb, 'partial', null, 'final', null);
  end if;

  if exists (select 1 from public.offering_dimensions d where d.offering_id = v_o.id) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'grade_item_id', t.id, 'title', t.name, 'source_type', t.kind,
             'weight', t.weight_pct, 'score', t.score, 'max_score', 20, 'hidden', false,
             'normalized', t.score) order by t.position, t.created_at), '[]'::jsonb),
           coalesce(sum(t.weight_pct * t.score) filter (where t.score is not null), 0),
           coalesce(sum(t.weight_pct) filter (where t.score is not null), 0),
           count(*) filter (where t.score is null),
           coalesce(sum(t.weight_pct), 0)
      into v_items, v_num, v_den, v_open, v_total
    from (
      select d.id, d.name, d.kind, d.weight_pct, d.position, d.created_at,
             case when d.kind = 'attendance' then
               case when exists (select 1 from public.attendance_sessions s
                                 where s.offering_id = v_o.id and s.status = 'open')
                    then null
                    else round(app.attendance_pct(p_enrollment_id) * 20 / 100, 2) end
             else (select ds.score from public.dimension_scores ds
                   where ds.dimension_id = d.id and ds.enrollment_id = p_enrollment_id)
             end as score
      from public.offering_dimensions d where d.offering_id = v_o.id
    ) t;
    v_partial := case when v_den > 0 then round(v_num / v_den, 2) end;
    return jsonb_build_object(
      'mode', 'dimensions', 'weights_total', v_total,
      'items', v_items, 'partial', v_partial,
      'final', case when v_open = 0 and v_den > 0 and abs(v_total - 100) < 0.005 then v_partial end
    );
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

create or replace function public.get_gradebook(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_items jsonb;
  v_students jsonb;
  v_dims boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null
     or not (app.can_manage_offering(p_offering_id) or app.is_client_coordinator(v_o.client_id)) then
    raise exception 'No se permite ver las notas de esta edición' using errcode = '42501';
  end if;
  v_dims := exists (select 1 from public.offering_dimensions d where d.offering_id = p_offering_id);

  if v_dims then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'title', d.name, 'source_type', d.kind,
             'source_id', null, 'weight', d.weight_pct, 'max_score', 20
           ) order by d.position, d.created_at), '[]'::jsonb)
      into v_items
    from public.offering_dimensions d where d.offering_id = p_offering_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'enrollment_id', e.id, 'user_id', e.user_id, 'email', u.email,
             'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
             'status', e.status, 'saved_final_grade', e.final_grade,
             'grades', (select coalesce(jsonb_object_agg(i ->> 'grade_item_id', jsonb_build_object(
                          'score', i -> 'score', 'max_score', 20, 'adjusted', false,
                          'adjusted_reason', null)), '{}'::jsonb)
                        from jsonb_array_elements(gs.s -> 'items') i
                        where jsonb_typeof(i -> 'score') = 'number'),
             'summary', gs.s
           ) order by u.email), '[]'::jsonb)
      into v_students
    from public.enrollments e
    join auth.users u on u.id = e.user_id
    cross join lateral (select app.grade_summary(e.id, false) as s) gs
    where e.offering_id = p_offering_id and e.status <> 'dropped';

    return jsonb_build_object('mode', 'dimensions', 'items', v_items, 'students', v_students);
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

  return jsonb_build_object('mode', 'items', 'items', v_items, 'students', v_students);
end;
$$;

create or replace function public.set_manual_grade(
  p_enrollment_id uuid, p_grade_item_id uuid, p_score numeric,
  p_comment text default null, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_e public.enrollments%rowtype;
  v_o public.offerings%rowtype;
  v_gi public.grade_items%rowtype;
  v_g public.grades%rowtype;
  v_d public.offering_dimensions%rowtype;
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

  select d.* into v_d from public.offering_dimensions d
  where d.id = p_grade_item_id and d.offering_id = v_o.id;
  if v_d.id is not null then
    if v_d.kind = 'attendance' then
      raise exception 'La nota de asistencia se calcula sola desde las llamadas cerradas' using errcode = '23514';
    end if;
    if p_score is null or p_score < 0 or p_score > 20 then
      raise exception 'La nota debe estar entre 0 y 20' using errcode = '23514';
    end if;
    insert into public.dimension_scores as s (dimension_id, enrollment_id, tenant_id, score, comment, graded_by, graded_at)
    values (v_d.id, p_enrollment_id, v_e.tenant_id, p_score, nullif(btrim(p_comment), ''), (select auth.uid()), now())
    on conflict (dimension_id, enrollment_id) do update
    set score = excluded.score, comment = excluded.comment, graded_by = excluded.graded_by, graded_at = now();
    return;
  end if;

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
