-- Vistas por persona (administrador, docente, coordinación) y Personas con lo que dicta cada quien.

-- Qué vistas puede usar la persona en esta escuela.
create function public.get_my_views(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('admin', false, 'teacher', false, 'coordinator', false);
  end if;
  return jsonb_build_object(
    'admin', app.has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]),
    'teacher', app.has_tenant_role(p_tenant_id,
      array['owner', 'admin', 'instructor', 'instructor_guest']::public.tenant_role[]),
    'coordinator', app.has_tenant_role(p_tenant_id, array['client_coordinator']::public.tenant_role[])
      or app.can_issue_certificates(p_tenant_id));
end;
$$;
revoke all on function public.get_my_views(uuid) from public, anon;
grant execute on function public.get_my_views(uuid) to authenticated;

-- Certificados emitidos: también los ve quien puede emitir (coordinador académico).
do $$
declare
  d text := pg_get_functiondef('public.list_tenant_certificates(uuid, text)'::regprocedure);
begin
  d := replace(d, 'perform app.require_school_admin(p_tenant_id);',
    E'if (select auth.uid()) is null then\n    raise exception ''Se requiere una sesión autenticada'' using errcode = ''42501'';\n  end if;\n  if not app.can_issue_certificates(p_tenant_id) then\n    raise exception ''No se permite ver los certificados de esta escuela'' using errcode = ''42501'';\n  end if;');
  if position('can_issue_certificates' in d) = 0 then raise exception 'list_tenant_certificates'; end if;
  execute d;
end $$;

-- Personas: cuántas ediciones dicta cada quien.
create or replace function public.list_school_people(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_school_admin(p_tenant_id);
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', tm.user_id,
        'email', u.email::text,
        'full_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
        'role', tm.role,
        'status', tm.status,
        'can_issue', tm.can_issue_certificates,
        'teaches', (
          select count(*)::integer
          from public.offering_instructors oi
          join public.offerings o on o.id = oi.offering_id and o.deleted_at is null
          where oi.tenant_id = tm.tenant_id and oi.user_id = tm.user_id),
        'created_at', tm.created_at,
        'clients', coalesce((
          select jsonb_agg(c.name order by c.name)
          from public.client_members cm
          join public.clients c on c.id = cm.client_id and c.tenant_id = cm.tenant_id
          where cm.tenant_id = tm.tenant_id and cm.user_id = tm.user_id and cm.role = 'coordinator'
        ), '[]'::jsonb)
      ) order by tm.role, lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.email::text)))
      from public.tenant_members tm
      join auth.users u on u.id = tm.user_id
      where tm.tenant_id = p_tenant_id and tm.role <> 'student'
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'email', i.email::text,
        'role', i.role,
        'client_name', c.name,
        'expires_at', i.expires_at,
        'created_at', i.created_at,
        'expired', i.expires_at <= now()
      ) order by i.created_at desc)
      from public.invitations i
      left join public.clients c on c.id = i.client_id and c.tenant_id = i.tenant_id
      where i.tenant_id = p_tenant_id and i.accepted_at is null and i.offering_id is null
    ), '[]'::jsonb));
end;
$$;
