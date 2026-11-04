-- Editar los datos de un estudiante desde la edición: nombre, celular, cargo y empresa.
create function public.update_offering_student(
  p_offering_id uuid, p_enrollment_id uuid,
  p_full_name text, p_phone text, p_job_title text, p_company text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_user uuid;
  v_name text := left(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), 120);
  v_phone text := left(nullif(btrim(coalesce(p_phone, '')), ''), 30);
  v_job text := left(nullif(btrim(coalesce(p_job_title, '')), ''), 120);
  v_company text := left(nullif(btrim(coalesce(p_company, '')), ''), 120);
  v_placeholder boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite editar estudiantes de esta edición' using errcode = '42501';
  end if;
  select e.user_id into v_user from public.enrollments e
  where e.id = p_enrollment_id and e.offering_id = p_offering_id;
  if v_user is null then
    raise exception 'La matrícula no pertenece a esta edición' using errcode = '23514';
  end if;
  if v_name = '' then
    raise exception 'Escribe el nombre del estudiante' using errcode = '23514';
  end if;

  select (u.raw_user_meta_data ->> 'placeholder') = 'true' into v_placeholder
  from auth.users u where u.id = v_user;

  -- Los participantes sin correo se identifican por nombre dentro del cliente: no puede repetirse.
  if coalesce(v_placeholder, false) and exists (
    select 1
    from auth.users u2
    join public.client_members cm on cm.user_id = u2.id
    where cm.client_id = v_o.client_id and cm.tenant_id = v_o.tenant_id
      and u2.id <> v_user
      and (u2.raw_user_meta_data ->> 'placeholder') = 'true'
      and lower(regexp_replace(btrim(coalesce(u2.raw_user_meta_data ->> 'full_name', '')), '\s+', ' ', 'g'))
          = lower(v_name)) then
    raise exception 'Ya hay otro participante con ese nombre en este cliente' using errcode = '23514';
  end if;

  update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', v_name)
  where u.id = v_user;

  insert into public.student_details as d (tenant_id, user_id, phone, job_title, company)
  values (v_o.tenant_id, v_user, v_phone, v_job, v_company)
  on conflict (tenant_id, user_id) do update
  set phone = excluded.phone, job_title = excluded.job_title, company = excluded.company,
      updated_at = now();
end;
$$;

revoke all on function public.update_offering_student(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.update_offering_student(uuid, uuid, text, text, text, text) to authenticated;
