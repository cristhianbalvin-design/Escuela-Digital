-- Los helpers consultan membresías y colaboradores sin recursión de RLS.
-- En el paso 4B se añadirá el acceso del docente invitado a la versión
-- fijada por una edición en la que imparta clase.
create function app.can_read_course(p_course_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = p_course_id
      and c.deleted_at is null
      and (
        app.is_platform_admin()
        or app.has_tenant_role(
          c.tenant_id,
          array['owner', 'admin']::public.tenant_role[]
        )
        or exists (
          select 1
          from public.tenant_members tm
          left join public.course_collaborators cc
            on cc.tenant_id = c.tenant_id
           and cc.course_id = c.id
           and cc.user_id = tm.user_id
          where tm.tenant_id = c.tenant_id
            and tm.user_id = (select auth.uid())
            and tm.status = 'active'
            and (
              (
                tm.role = 'instructor'
                and (c.created_by = tm.user_id or cc.role is not null)
              )
              or (
                tm.role = 'instructor_guest'
                and tm.can_author
                and (
                  c.created_by = tm.user_id
                  or cc.role = 'editor'
                )
              )
            )
        )
      )
  );
$$;

create function app.can_edit_course(p_course_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = p_course_id
      and c.deleted_at is null
      and (
        app.is_platform_admin()
        or app.has_tenant_role(
          c.tenant_id,
          array['owner', 'admin']::public.tenant_role[]
        )
        or exists (
          select 1
          from public.tenant_members tm
          left join public.course_collaborators cc
            on cc.tenant_id = c.tenant_id
           and cc.course_id = c.id
           and cc.user_id = tm.user_id
          where tm.tenant_id = c.tenant_id
            and tm.user_id = (select auth.uid())
            and tm.status = 'active'
            and (
              (
                tm.role = 'instructor'
                and (
                  c.created_by = tm.user_id
                  or cc.role = 'editor'
                )
              )
              or (
                tm.role = 'instructor_guest'
                and tm.can_author
                and (
                  c.created_by = tm.user_id
                  or cc.role = 'editor'
                )
              )
            )
        )
      )
  );
$$;

revoke all on function app.can_read_course(uuid)
  from public, anon, authenticated;
revoke all on function app.can_edit_course(uuid)
  from public, anon, authenticated;

grant execute on function app.can_read_course(uuid) to authenticated;
grant execute on function app.can_edit_course(uuid) to authenticated;
