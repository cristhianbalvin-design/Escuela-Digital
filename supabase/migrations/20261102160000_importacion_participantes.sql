-- Importación de participantes y notas por CSV.
-- check_import_access: comprueba con el JWT del docente que puede gestionar la edición.
-- import_find_user / import_participant: solo service_role (los llama la función de Vercel,
-- que ya verificó el acceso con check_import_access).
create function public.check_import_access(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite importar participantes en esta edición' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true, 'status', v_o.status, 'seats', v_o.seats,
    'user_id', (select auth.uid()));
end;
$$;
revoke all on function public.check_import_access(uuid) from public, anon;
grant execute on function public.check_import_access(uuid) to authenticated;

create function public.import_find_user(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function public.import_find_user(text) from public, anon, authenticated;
grant execute on function public.import_find_user(text) to service_role;

create function public.import_participant(
  p_actor uuid, p_offering_id uuid, p_user_id uuid, p_scores jsonb)
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

  if p_scores is not null and jsonb_typeof(p_scores) = 'object' then
    for v_key, v_val in select k, v from jsonb_each(p_scores) as t(k, v) loop
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
revoke all on function public.import_participant(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_participant(uuid, uuid, uuid, jsonb) to service_role;
