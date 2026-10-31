-- Ediciones, docentes asignados y matrículas.
create type public.offering_status as enum (
  'draft', 'open', 'running', 'finished', 'archived'
);
create type public.offering_modality as enum (
  'self_paced', 'live', 'hybrid'
);
create type public.enrollment_mode as enum (
  'invite', 'code', 'csv'
);
create type public.issuer_mode as enum (
  'school', 'client', 'co_issue'
);
create type public.offering_instructor_role as enum (
  'lead', 'assistant'
);
create type public.enrollment_status as enum (
  'pending', 'active', 'completed', 'dropped', 'suspended'
);
create type public.enrollment_risk_level as enum (
  'low', 'medium', 'high'
);

create table public.offerings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  course_id uuid not null,
  version_id uuid not null,
  title text not null,
  code text not null,
  status public.offering_status not null default 'draft',
  modality public.offering_modality not null,
  starts_at timestamptz,
  ends_at timestamptz,
  seats integer,
  enrollment_mode public.enrollment_mode not null,
  join_code text,
  release_schedule jsonb not null default '{"modules":{}}'::jsonb,
  completion_rules jsonb not null default '{}'::jsonb,
  issuer_mode public.issuer_mode not null default 'school',
  certificate_template_id uuid,
  timezone text not null default 'America/Lima',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint offerings_tenant_id_unique unique (tenant_id, id),
  constraint offerings_tenant_client_id_unique
    unique (tenant_id, client_id, id),
  constraint offerings_tenant_code_unique unique (tenant_id, code),
  constraint offerings_client_fk
    foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id),
  constraint offerings_version_fk
    foreign key (tenant_id, course_id, version_id)
    references public.course_versions (tenant_id, course_id, id),
  constraint offerings_title_nonempty check (btrim(title) <> ''),
  constraint offerings_code_nonempty check (btrim(code) <> ''),
  constraint offerings_timezone_nonempty check (btrim(timezone) <> ''),
  constraint offerings_dates_order check (
    starts_at is null or ends_at is null or ends_at > starts_at
  ),
  constraint offerings_seats_positive check (
    seats is null or seats > 0
  ),
  constraint offerings_release_schedule_object check (
    jsonb_typeof(release_schedule) = 'object'
  ),
  constraint offerings_completion_rules_object check (
    jsonb_typeof(completion_rules) = 'object'
  )
);

create unique index offerings_tenant_join_code_unique
  on public.offerings (tenant_id, join_code)
  where join_code is not null;

create table public.offering_instructors (
  offering_id uuid not null,
  user_id uuid not null,
  tenant_id uuid not null,
  role public.offering_instructor_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (offering_id, user_id),
  constraint offering_instructors_offering_fk
    foreign key (tenant_id, offering_id)
    references public.offerings (tenant_id, id),
  constraint offering_instructors_member_fk
    foreign key (tenant_id, user_id)
    references public.tenant_members (tenant_id, user_id)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  offering_id uuid not null,
  user_id uuid not null,
  status public.enrollment_status not null default 'pending',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  progress_pct numeric(5, 2) not null default 0,
  final_grade numeric,
  last_activity_at timestamptz,
  risk_level public.enrollment_risk_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_offering_user_unique
    unique (offering_id, user_id),
  constraint enrollments_offering_fk
    foreign key (tenant_id, client_id, offering_id)
    references public.offerings (tenant_id, client_id, id),
  constraint enrollments_member_fk
    foreign key (tenant_id, user_id)
    references public.tenant_members (tenant_id, user_id),
  constraint enrollments_client_member_fk
    foreign key (tenant_id, client_id, user_id)
    references public.client_members (tenant_id, client_id, user_id),
  constraint enrollments_progress_range check (
    progress_pct >= 0 and progress_pct <= 100
  ),
  constraint enrollments_completed_at_status check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

-- FKs, filtros de permisos y listados frecuentes.
create index offerings_tenant_client_idx
  on public.offerings (tenant_id, client_id);
create index offerings_tenant_course_version_idx
  on public.offerings (tenant_id, course_id, version_id);
create index offerings_created_by_idx
  on public.offerings (created_by);
create index offering_instructors_tenant_user_idx
  on public.offering_instructors (tenant_id, user_id);
create index offering_instructors_tenant_offering_idx
  on public.offering_instructors (tenant_id, offering_id);
create index enrollments_tenant_client_idx
  on public.enrollments (tenant_id, client_id);
create index enrollments_tenant_offering_idx
  on public.enrollments (tenant_id, offering_id);
create index enrollments_tenant_user_idx
  on public.enrollments (tenant_id, user_id);
create index enrollments_client_member_idx
  on public.enrollments (tenant_id, client_id, user_id);
create index enrollments_user_id_idx
  on public.enrollments (user_id);
create index enrollments_offering_id_idx
  on public.enrollments (offering_id);

create trigger offerings_touch before update on public.offerings
  for each row execute function app.touch_updated_at();
create trigger offering_instructors_touch
  before update on public.offering_instructors
  for each row execute function app.touch_updated_at();
create trigger enrollments_touch before update on public.enrollments
  for each row execute function app.touch_updated_at();
