-- Marcas de material por edición: "enviado" y "usado en clase" (solo equipo docente).
create table public.offering_resource_marks (
  offering_id uuid not null references public.offerings (id) on delete cascade,
  resource_id uuid not null references public.lesson_resources (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  shared_at timestamptz,
  used_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (offering_id, resource_id),
  constraint offering_resource_marks_used_needs_shared check (used_at is null or shared_at is not null)
);
create index offering_resource_marks_tenant_idx on public.offering_resource_marks (tenant_id);
create index offering_resource_marks_resource_idx on public.offering_resource_marks (resource_id);

alter table public.offering_resource_marks enable row level security;
revoke all on public.offering_resource_marks from anon, authenticated;

create function public.get_offering_resource_marks(p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  if not exists (select 1 from public.offerings o where o.id = p_offering_id and o.deleted_at is null)
     or not app.can_manage_offering(p_offering_id) then
    raise exception 'Edición no disponible' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'resource_id', m.resource_id, 'shared_at', m.shared_at, 'used_at', m.used_at))
    from public.offering_resource_marks m
    where m.offering_id = p_offering_id), '[]'::jsonb);
end;
$$;

-- Guarda el estado de un archivo en la edición. Reglas: usado implica enviado; conserva la fecha
-- original mientras la casilla siga marcada; si ambas quedan vacías se borra la fila.
create function public.set_offering_resource_mark(
  p_offering_id uuid, p_resource_id uuid, p_shared boolean, p_used boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.offerings%rowtype;
  v_old public.offering_resource_marks%rowtype;
  v_shared boolean := coalesce(p_shared, false);
  v_used boolean := coalesce(p_used, false);
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Se requiere una sesión autenticada' using errcode = '42501';
  end if;
  select o.* into v_o from public.offerings o where o.id = p_offering_id and o.deleted_at is null;
  if v_o.id is null or not app.can_manage_offering(p_offering_id) then
    raise exception 'No se permite editar esta edición' using errcode = '42501';
  end if;
  if v_o.status in ('finished', 'archived') then
    raise exception 'La edición ya está cerrada' using errcode = '23514';
  end if;
  if not exists (select 1 from public.lesson_resources r
                 where r.id = p_resource_id and r.version_id = v_o.version_id) then
    raise exception 'El archivo no pertenece a esta edición' using errcode = '23514';
  end if;
  if v_used then v_shared := true; end if;
  if not v_shared then v_used := false; end if;

  if not v_shared then
    delete from public.offering_resource_marks
    where offering_id = p_offering_id and resource_id = p_resource_id;
    return;
  end if;

  select * into v_old from public.offering_resource_marks
  where offering_id = p_offering_id and resource_id = p_resource_id;

  insert into public.offering_resource_marks
    (offering_id, resource_id, tenant_id, shared_at, used_at, updated_by, updated_at)
  values (
    p_offering_id, p_resource_id, v_o.tenant_id,
    coalesce(v_old.shared_at, v_now),
    case when v_used then coalesce(v_old.used_at, v_now) else null end,
    (select auth.uid()), v_now)
  on conflict (offering_id, resource_id) do update
    set shared_at = excluded.shared_at,
        used_at = excluded.used_at,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_offering_resource_marks(uuid),
  public.set_offering_resource_mark(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.get_offering_resource_marks(uuid),
  public.set_offering_resource_mark(uuid, uuid, boolean, boolean) to authenticated;
