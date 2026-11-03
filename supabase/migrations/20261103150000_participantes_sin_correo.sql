-- Participantes sin correo: cuenta interna marcada como placeholder, buscada por nombre dentro del cliente de la edición.
create or replace function public.import_find_placeholder(p_offering_id uuid, p_name text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id
  from auth.users u
  join public.client_members cm on cm.user_id = u.id
  join public.offerings o on o.client_id = cm.client_id and o.tenant_id = cm.tenant_id
  where o.id = p_offering_id
    and (u.raw_user_meta_data ->> 'placeholder') = 'true'
    and lower(regexp_replace(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
  limit 1;
$$;

revoke all on function public.import_find_placeholder(uuid, text) from public, anon, authenticated;
grant execute on function public.import_find_placeholder(uuid, text) to service_role;
