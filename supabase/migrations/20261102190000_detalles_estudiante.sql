-- Datos opcionales del estudiante (celular, cargo, empresa) por escuela.
create table public.student_details (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text check (phone is null or char_length(phone) <= 30),
  job_title text check (job_title is null or char_length(job_title) <= 120),
  company text check (company is null or char_length(company) <= 120),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index student_details_user_idx on public.student_details (user_id);
alter table public.student_details enable row level security;
revoke all on public.student_details from anon, authenticated;
grant select on public.student_details to authenticated;
create policy student_details_select on public.student_details
  for select to authenticated using (
    user_id = (select auth.uid())
    or app.has_tenant_role(tenant_id, array['owner', 'admin', 'instructor']::public.tenant_role[]));

drop function public.import_participant(uuid, uuid, uuid, jsonb);
create function public.import_participant(
  p_actor uuid, p_offering_id uuid, p_user_id uuid, p_scores jsonb, p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_tm public.tenant_members%rowtype;
  v_enr public.enrollments%rowtype;
  v_created boolean := false;
  v_n integer := 0;
  v_key text;
  v_val jsonb;
  v_score numeric;
  v_dim public.offering_dimensions%rowtype;
  v_phone text;
  v_job text;
  v_company text;
begin
  select o.* into v_o from public.offerings o
  where o.id = p_offering_id and o.deleted_at is null for update;
  if v_o.id is null then
    raise exception 'Edición no encontrada' using errcode = '23514';
  end if;
  if v_o.status not in ('open', 'running') then
    raise exception 'La edición no admite matrículas ahora' using errcode = '23514';
  end if;

  select tm.* into v_tm from public.tenant_members tm
  where tm.tenant_id = v_o.tenant_id and tm.user_id = p_user_id;
  if v_tm.user_id is null then
    insert into public.tenant_members (tenant_id, user_id, role, status, invited_by)
    values (v_o.tenant_id, p_user_id, 'student', 'active', p_actor);
  elsif v_tm.role <> 'student' then
    raise exception 'Esa cuenta ya existe con otro rol en la escuela' using errcode = '23514';
  elsif v_tm.status <> 'active' then
    raise exception 'La cuenta de estudiante está inactiva' using errcode = '23514';
  end if;

  if not exists (select 1 from public.client_members cm
                 where cm.tenant_id = v_o.tenant_id and cm.client_id = v_o.client_id
                   and cm.user_id = p_user_id) then
    insert into public.client_members (tenant_id, client_id, user_id, role)
    values (v_o.tenant_id, v_o.client_id, p_user_id, 'member');
  end if;

  select e.* into v_enr from public.enrollments e
  where e.offering_id = p_offering_id and e.user_id = p_user_id;
  if v_enr.id is null then
    if v_o.seats is not null and (
      select count(*) from public.enrollments e
      where e.offering_id = p_offering_id and e.status <> 'dropped') >= v_o.seats then
      raise exception 'No quedan cupos' using errcode = '23514';
    end if;
    insert into public.enrollments (tenant_id, client_id, offering_id, user_id, status)
    values (v_o.tenant_id, v_o.client_id, p_offering_id, p_user_id, 'active')
    returning * into v_enr;
    v_created := true;
  elsif v_enr.status in ('pending', 'dropped') then
    update public.enrollments e set status = 'active' where e.id = v_enr.id;
  end if;

  if p_details is not null and jsonb_typeof(p_details) = 'object' then
    v_phone := left(nullif(btrim(p_details ->> 'phone'), ''), 30);
    v_job := left(nullif(btrim(p_details ->> 'job_title'), ''), 120);
    v_company := left(nullif(btrim(p_details ->> 'company'), ''), 120);
    if v_phone is not null or v_job is not null or v_company is not null then
      insert into public.student_details as d (tenant_id, user_id, phone, job_title, company)
      values (v_o.tenant_id, p_user_id, v_phone, v_job, v_company)
      on conflict (tenant_id, user_id) do update
      set phone = coalesce(excluded.phone, d.phone),
          job_title = coalesce(excluded.job_title, d.job_title),
          company = coalesce(excluded.company, d.company),
          updated_at = now();
    end if;
  end if;

  if p_scores is not null and jsonb_typeof(p_scores) = 'object' then
    for v_key, v_val in select t.k, t.v from jsonb_each(p_scores) as t(k, v) loop
      select d.* into v_dim from public.offering_dimensions d
      where d.id = v_key::uuid and d.offering_id = p_offering_id;
      if v_dim.id is null or v_dim.kind <> 'manual' then
        raise exception 'Dimensión no válida para importar notas' using errcode = '23514';
      end if;
      if jsonb_typeof(v_val) <> 'number' then
        continue;
      end if;
      v_score := (v_val #>> '{}')::numeric;
      if v_score < 0 or v_score > 20 then
        raise exception 'La nota de "%" debe estar entre 0 y 20', v_dim.name using errcode = '23514';
      end if;
      insert into public.dimension_scores as s (dimension_id, enrollment_id, tenant_id, score, graded_by, graded_at)
      values (v_dim.id, v_enr.id, v_o.tenant_id, v_score, p_actor, now())
      on conflict (dimension_id, enrollment_id) do update
      set score = excluded.score, graded_by = excluded.graded_by, graded_at = now();
      v_n := v_n + 1;
    end loop;
  end if;

  return jsonb_build_object('enrollment_id', v_enr.id, 'created', v_created, 'scores', v_n);
end;
$$;
revoke all on function public.import_participant(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_participant(uuid, uuid, uuid, jsonb, jsonb) to service_role;

drop function public.list_offering_roster(uuid);
create function public.list_offering_roster(p_offering_id uuid)
returns table (enrollment_id uuid, user_id uuid, email text, full_name text, status public.enrollment_status,
  progress_pct numeric, enrolled_at timestamptz, phone text, job_title text, company text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_client_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.client_id into v_client_id from public.offerings o
  where o.id = p_offering_id and o.deleted_at is null;
  if v_client_id is null
     or not (app.can_manage_offering(p_offering_id) or app.is_client_coordinator(v_client_id)) then
    raise exception 'No se permite ver los estudiantes de esta edición' using errcode = '42501';
  end if;
  return query
  select e.id, e.user_id, u.email::text,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
         e.status, e.progress_pct, e.enrolled_at, sd.phone, sd.job_title, sd.company
  from public.enrollments e
  join auth.users u on u.id = e.user_id
  left join public.student_details sd on sd.tenant_id = e.tenant_id and sd.user_id = e.user_id
  where e.offering_id = p_offering_id
  order by e.enrolled_at, u.email;
end;
$$;
revoke all on function public.list_offering_roster(uuid) from public, anon;
grant execute on function public.list_offering_roster(uuid) to authenticated;
