-- Cubre la FK compuesta client_members_tenant_member_fk (aviso del asesor).
create index client_members_tenant_user_idx
  on public.client_members (tenant_id, user_id);
