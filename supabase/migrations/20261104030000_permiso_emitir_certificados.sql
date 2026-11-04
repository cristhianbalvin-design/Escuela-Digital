-- Permiso "puede emitir certificados" (coordinador académico) y administradores que también dictan.

alter table public.tenant_members
  add column can_issue_certificates boolean not null default false;
update public.tenant_members set can_issue_certificates = true where role in ('owner', 'admin');

-- Propietarios y administradores siempre pueden emitir.
create function app.tm_issue_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role in ('owner', 'admin') then
    new.can_issue_certificates := true;
  end if;
  return new;
end;
$$;
create trigger tenant_members_issue_flag
  before insert or update of role, can_issue_certificates on public.tenant_members
  for each row execute function app.tm_issue_flag();

-- ¿Puede emitir, reemitir y revocar certificados en esta escuela?
create function app.can_issue_certificates(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin()
    or app.has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[])
    or exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = p_tenant_id
        and tm.user_id = (select auth.uid())
        and tm.status = 'active'
        and tm.can_issue_certificates
        and tm.role in ('instructor', 'instructor_guest'));
$$;
revoke all on function app.can_issue_certificates(uuid) from public, anon, authenticated;

create function public.can_issue_certificates(p_offering_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  select o.tenant_id into v_tenant from public.offerings o
  where o.id = p_offering_id and o.deleted_at is null;
  if v_tenant is null then
    return false;
  end if;
  return app.can_issue_certificates(v_tenant);
end;
$$;
revoke all on function public.can_issue_certificates(uuid) from public, anon;
grant execute on function public.can_issue_certificates(uuid) to authenticated;

-- Emitir, reemitir y revocar: solo quien tiene el permiso (ya no cualquier docente de la edición).
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.issue_certificate(uuid)'::regprocedure);
  d := replace(d, 'not app.can_manage_offering(v_e.offering_id)', 'not app.can_issue_certificates(v_e.tenant_id)');
  if position('can_issue_certificates' in d) = 0 then raise exception 'issue_certificate'; end if;
  execute d;

  d := pg_get_functiondef('public.reissue_certificate(uuid, text)'::regprocedure);
  d := replace(d, 'not app.can_manage_offering(v_c.offering_id)', 'not app.can_issue_certificates(v_c.tenant_id)');
  if position('can_issue_certificates' in d) = 0 then raise exception 'reissue_certificate'; end if;
  execute d;

  d := pg_get_functiondef('public.revoke_certificate(uuid, text)'::regprocedure);
  d := replace(d, 'not app.can_manage_offering(v_c.offering_id)', 'not app.can_issue_certificates(v_c.tenant_id)');
  if position('can_issue_certificates' in d) = 0 then raise exception 'revoke_certificate'; end if;
  execute d;

  d := pg_get_functiondef('public.get_offering_certificates(uuid)'::regprocedure);
  d := replace(d, 'or app.is_client_coordinator(v_o.client_id))',
                  'or app.is_client_coordinator(v_o.client_id) or app.can_issue_certificates(v_o.tenant_id))');
  if position('can_issue_certificates' in d) = 0 then raise exception 'get_offering_certificates'; end if;
  execute d;

  -- Un administrador también puede figurar como docente de una edición.
  d := pg_get_functiondef('app.guard_offering_instructor()'::regprocedure);
  d := replace(d, 'tm.role in (''instructor'', ''instructor_guest'')', 'tm.role in (''owner'', ''admin'', ''instructor'', ''instructor_guest'')');
  if position('''owner'', ''admin'', ''instructor''' in d) = 0 then raise exception 'guard_offering_instructor'; end if;
  execute d;

  d := pg_get_functiondef('public.set_offering_instructor(uuid, uuid, text)'::regprocedure);
  d := replace(d, 'tm.role in (''instructor'', ''instructor_guest'')', 'tm.role in (''owner'', ''admin'', ''instructor'', ''instructor_guest'')');
  if position('''owner'', ''admin'', ''instructor''' in d) = 0 then raise exception 'set_offering_instructor'; end if;
  execute d;

  d := pg_get_functiondef('public.list_tenant_instructors(uuid)'::regprocedure);
  d := replace(d, 'tm.role in (''instructor'', ''instructor_guest'')', 'tm.role in (''owner'', ''admin'', ''instructor'', ''instructor_guest'')');
  if position('''owner'', ''admin'', ''instructor''' in d) = 0 then raise exception 'list_tenant_instructors'; end if;
  execute d;
end $$;

-- Personas: ahora incluye el permiso de emitir.
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

-- Cambiar el tipo de persona (docente / docente invitado / administrador) y su permiso de emitir.
create function public.set_school_member_access(
  p_tenant_id uuid, p_user_id uuid, p_role text default null, p_can_issue boolean default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_role public.tenant_role;
  v_owner boolean;
begin
  perform app.require_school_admin(p_tenant_id);
  v_owner := app.is_platform_admin()
    or app.has_tenant_role(p_tenant_id, array['owner']::public.tenant_role[]);
  select tm.role into v_role from public.tenant_members tm
  where tm.tenant_id = p_tenant_id and tm.user_id = p_user_id and tm.role <> 'student';
  if v_role is null then
    raise exception 'Persona no encontrada' using errcode = '42501';
  end if;
  if v_role = 'owner' then
    raise exception 'No se puede cambiar al propietario' using errcode = '42501';
  end if;
  if p_role is not null and p_role <> v_role::text then
    if v_role = 'client_coordinator' then
      raise exception 'El rol de un coordinador de cliente no se cambia aquí' using errcode = '23514';
    end if;
    if p_role not in ('instructor', 'instructor_guest', 'admin') then
      raise exception 'El rol no es válido' using errcode = '23514';
    end if;
    if p_user_id = (select auth.uid()) then
      raise exception 'No puedes cambiar tu propio rol' using errcode = '42501';
    end if;
    if (p_role = 'admin' or v_role = 'admin') and not v_owner then
      raise exception 'Solo el propietario puede gestionar administradores' using errcode = '42501';
    end if;
    update public.tenant_members
    set role = p_role::public.tenant_role,
        can_author = case when p_role in ('instructor', 'admin') then true else can_author end,
        can_issue_certificates = case when v_role = 'admin' then false else can_issue_certificates end,
        updated_at = now()
    where tenant_id = p_tenant_id and user_id = p_user_id;
    v_role := p_role::public.tenant_role;
  end if;
  if p_can_issue is not null and v_role in ('instructor', 'instructor_guest') then
    update public.tenant_members set can_issue_certificates = p_can_issue, updated_at = now()
    where tenant_id = p_tenant_id and user_id = p_user_id;
  end if;
end;
$$;

-- Certificados por emitir en toda la escuela (cumplen los requisitos y aún no tienen certificado).
create function public.list_tenant_issuable(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  if not app.can_issue_certificates(p_tenant_id) then
    raise exception 'No se permite emitir certificados en esta escuela' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.offering_title, x.full_name)
    from (
      select o.title as offering_title, app.user_display_name(e.user_id) as full_name,
        jsonb_build_object(
          'enrollment_id', e.id,
          'offering_id', o.id,
          'offering_title', o.title,
          'client_name', cl.name,
          'full_name', app.user_display_name(e.user_id),
          'email', u.email::text
        ) as j
      from public.enrollments e
      join public.offerings o on o.id = e.offering_id and o.deleted_at is null
      join public.clients cl on cl.id = o.client_id
      join auth.users u on u.id = e.user_id
      where e.tenant_id = p_tenant_id
        and e.status in ('active', 'completed')
        and not exists (select 1 from public.certificates c where c.enrollment_id = e.id)
        and (app.completion_status(e.id) ->> 'met')::boolean
      limit 500
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.set_school_member_access(uuid, uuid, text, boolean),
  public.list_tenant_issuable(uuid) from public, anon;
grant execute on function public.set_school_member_access(uuid, uuid, text, boolean),
  public.list_tenant_issuable(uuid) to authenticated;
