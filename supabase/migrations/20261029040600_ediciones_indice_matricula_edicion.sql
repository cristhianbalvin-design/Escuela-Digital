create index enrollments_tenant_client_offering_idx
  on public.enrollments (tenant_id, client_id, offering_id);
