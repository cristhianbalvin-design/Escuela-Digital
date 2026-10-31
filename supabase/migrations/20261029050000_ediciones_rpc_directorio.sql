create function public.list_offering_roster(p_offering_id uuid)
returns table (
  enrollment_id uuid,
  user_id uuid,
  email text,
  full_name text,
  status public.enrollment_status,
  progress_pct numeric,
  enrolled_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  select o.client_id
    into v_client_id
  from public.offerings o
  where o.id = p_offering_id
    and o.deleted_at is null;

  if v_client_id is null
     or not (
       app.can_manage_offering(p_offering_id)
       or app.is_client_coordinator(v_client_id)
     ) then
    raise exception 'No se permite ver los estudiantes de esta edición'
      using errcode = '42501';
  end if;

  return query
  select e.id, e.user_id, u.email::text,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name'
         ),
         e.status, e.progress_pct, e.enrolled_at
  from public.enrollments e
  join auth.users u on u.id = e.user_id
  where e.offering_id = p_offering_id
  order by e.enrolled_at, u.email;
end;
$$;

create function public.list_enrollable_students(p_offering_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_client_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  select o.tenant_id, o.client_id
    into v_tenant_id, v_client_id
  from public.offerings o
  where o.id = p_offering_id
    and o.deleted_at is null;

  if v_client_id is null
     or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite matricular en esta edición'
      using errcode = '42501';
  end if;

  return query
  select tm.user_id, u.email::text,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name'
         )
  from public.client_members cm
  join public.tenant_members tm
    on tm.tenant_id = cm.tenant_id
   and tm.user_id = cm.user_id
  join auth.users u on u.id = tm.user_id
  where cm.tenant_id = v_tenant_id
    and cm.client_id = v_client_id
    and tm.status = 'active'
    and tm.role = 'student'
    and not exists (
      select 1
      from public.enrollments e
      where e.offering_id = p_offering_id
        and e.user_id = tm.user_id
    )
  order by u.email;
end;
$$;

revoke all on function public.list_offering_roster(uuid)
  from public, anon, authenticated;
revoke all on function public.list_enrollable_students(uuid)
  from public, anon, authenticated;
grant execute on function public.list_offering_roster(uuid)
  to authenticated;
grant execute on function public.list_enrollable_students(uuid)
  to authenticated;
