-- Identidad global y escuelas.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_light_url text,
  logo_dark_url text,
  primary_color text not null default '#4F46E5',
  secondary_color text not null default '#14B8A6',
  welcome_text text,
  language text not null default 'es',
  time_zone text not null default 'America/Lima',
  status public.tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tenants_slug_reserved check (
    slug not in (
      'www', 'app', 'verifica', 'api', 'admin', 'plataforma',
      'static', 'assets', 'mail', 'docs', 'status'
    )
  ),
  constraint tenants_primary_color check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenants_secondary_color check (secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  host text not null unique,
  kind public.domain_kind not null default 'subdomain',
  verified boolean not null default false,
  verification jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_domains_host_format check (
    host = lower(host)
    and host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
    and host not like '%..%'
  ),
  constraint tenant_domains_primary_verified check (not is_primary or verified)
);

create unique index tenant_domains_one_primary_per_tenant
  on public.tenant_domains (tenant_id)
  where is_primary;

create index tenant_domains_tenant_id_idx
  on public.tenant_domains (tenant_id);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.tenant_role not null,
  status public.member_status not null default 'active',
  can_author boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_members_user_id_idx
  on public.tenant_members (user_id);

create index tenant_members_invited_by_idx
  on public.tenant_members (invited_by);

-- Clientes y coordinadores.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  slug text not null,
  status public.client_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_tenant_slug_unique unique (tenant_id, slug),
  constraint clients_tenant_id_unique unique (tenant_id, id),
  constraint clients_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint clients_slug_reserved check (
    slug not in (
      'www', 'app', 'verifica', 'api', 'admin', 'plataforma',
      'static', 'assets', 'mail', 'docs', 'status'
    )
  )
);

create index clients_tenant_id_idx
  on public.clients (tenant_id);

create table public.client_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  user_id uuid not null,
  role public.client_member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_members_client_fk
    foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id) on delete cascade,
  constraint client_members_tenant_member_fk
    foreign key (tenant_id, user_id)
    references public.tenant_members (tenant_id, user_id) on delete cascade,
  constraint client_members_unique unique (tenant_id, client_id, user_id)
);

create index client_members_user_id_idx
  on public.client_members (user_id);

create index client_members_client_id_idx
  on public.client_members (client_id);

-- Se conserva únicamente el hash del token de invitación.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid,
  email extensions.citext not null,
  role public.tenant_role not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_client_fk
    foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id),
  constraint invitations_hash_length check (octet_length(token_hash) = 32),
  constraint invitations_expiration check (expires_at > created_at),
  constraint invitations_coordinator_client check (
    role <> 'client_coordinator' or client_id is not null
  )
);

create index invitations_tenant_id_idx
  on public.invitations (tenant_id);

create index invitations_tenant_client_idx
  on public.invitations (tenant_id, client_id);

create index invitations_email_idx
  on public.invitations (email);

create index invitations_invited_by_idx
  on public.invitations (invited_by);

-- Mantiene updated_at en toda modificación (revisión de Claude).
create function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger platform_admins_touch before update on public.platform_admins
  for each row execute function app.touch_updated_at();
create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();
create trigger tenant_domains_touch before update on public.tenant_domains
  for each row execute function app.touch_updated_at();
create trigger tenant_members_touch before update on public.tenant_members
  for each row execute function app.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function app.touch_updated_at();
create trigger client_members_touch before update on public.client_members
  for each row execute function app.touch_updated_at();
create trigger invitations_touch before update on public.invitations
  for each row execute function app.touch_updated_at();
