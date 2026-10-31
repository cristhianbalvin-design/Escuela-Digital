-- Una asignación activa da acceso al docente o ayudante. También cuenta
-- un instructor activo que creó la edición; create_offering lo asigna lead.
create function app.is_offering_instructor(p_offering_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offerings o
    join public.tenant_members tm
      on tm.tenant_id = o.tenant_id
     and tm.user_id = (select auth.uid())
     and tm.status = 'active'
    left join public.offering_instructors oi
      on oi.tenant_id = o.tenant_id
     and oi.offering_id = o.id
     and oi.user_id = tm.user_id
    where o.id = p_offering_id
      and o.deleted_at is null
      and (
        (
          oi.user_id is not null
          and tm.role in ('instructor', 'instructor_guest')
        )
        or (
          o.created_by = tm.user_id
          and tm.role = 'instructor'
        )
      )
  );
$$;

create function app.can_manage_offering(p_offering_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offerings o
    where o.id = p_offering_id
      and o.deleted_at is null
      and (
        app.is_platform_admin()
        or app.has_tenant_role(
          o.tenant_id,
          array['owner', 'admin']::public.tenant_role[]
        )
        or exists (
          select 1
          from public.offering_instructors oi
          join public.tenant_members tm
            on tm.tenant_id = oi.tenant_id
           and tm.user_id = oi.user_id
          where oi.tenant_id = o.tenant_id
            and oi.offering_id = o.id
            and oi.user_id = (select auth.uid())
            and oi.role in ('lead', 'assistant')
            and tm.status = 'active'
            and tm.role in ('instructor', 'instructor_guest')
        )
      )
  );
$$;

create function app.can_read_offering(p_offering_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offerings o
    where o.id = p_offering_id
      and o.deleted_at is null
      and (
        app.can_manage_offering(o.id)
        or app.is_client_coordinator(o.client_id)
        or exists (
          select 1
          from public.enrollments e
          join public.tenant_members tm
            on tm.tenant_id = e.tenant_id
           and tm.user_id = e.user_id
          where e.tenant_id = o.tenant_id
            and e.client_id = o.client_id
            and e.offering_id = o.id
            and e.user_id = (select auth.uid())
            and e.status in ('pending', 'active', 'completed')
            and tm.status = 'active'
            and tm.role = 'student'
        )
      )
  );
$$;

-- Acceso de docencia al material de una edición concreta.
-- Se usa únicamente en políticas SELECT adicionales del catálogo.
create function app.teaches_offering_version(
  p_tenant_id uuid,
  p_course_id uuid,
  p_version_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offerings o
    join public.offering_instructors oi
      on oi.tenant_id = o.tenant_id
     and oi.offering_id = o.id
    join public.tenant_members tm
      on tm.tenant_id = oi.tenant_id
     and tm.user_id = oi.user_id
    where o.tenant_id = p_tenant_id
      and o.course_id = p_course_id
      and o.version_id = p_version_id
      and o.deleted_at is null
      and oi.user_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role in ('instructor', 'instructor_guest')
  );
$$;

revoke all on function app.is_offering_instructor(uuid)
  from public, anon, authenticated;
revoke all on function app.can_manage_offering(uuid)
  from public, anon, authenticated;
revoke all on function app.can_read_offering(uuid)
  from public, anon, authenticated;
revoke all on function app.teaches_offering_version(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function app.is_offering_instructor(uuid)
  to authenticated;
grant execute on function app.can_manage_offering(uuid)
  to authenticated;
grant execute on function app.can_read_offering(uuid)
  to authenticated;
grant execute on function app.teaches_offering_version(uuid, uuid, uuid)
  to authenticated;
