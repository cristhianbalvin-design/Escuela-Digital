-- Catálogo versionado. Las claves compuestas impiden referencias entre escuelas.
create type public.course_status as enum ('draft', 'active', 'archived');
create type public.course_collaborator_role as enum ('editor', 'viewer');
create type public.course_version_status as enum ('draft', 'published', 'retired');
create type public.lesson_type as enum (
  'video', 'reading', 'document', 'live', 'quiz', 'assignment', 'link'
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  slug text not null,
  category text,
  level text,
  language text not null default 'es',
  cover_path text,
  status public.course_status not null default 'draft',
  created_by uuid not null references auth.users (id),
  latest_published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint courses_tenant_id_unique unique (tenant_id, id),
  constraint courses_tenant_slug_unique unique (tenant_id, slug),
  constraint courses_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint courses_slug_reserved check (
    slug not in (
      'www', 'app', 'verifica', 'api', 'admin', 'plataforma',
      'static', 'assets', 'mail', 'docs', 'status'
    )
  )
);

create table public.course_collaborators (
  tenant_id uuid not null,
  course_id uuid not null,
  user_id uuid not null,
  role public.course_collaborator_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, course_id, user_id),
  constraint course_collaborators_course_fk
    foreign key (tenant_id, course_id)
    references public.courses (tenant_id, id),
  constraint course_collaborators_member_fk
    foreign key (tenant_id, user_id)
    references public.tenant_members (tenant_id, user_id)
);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  tenant_id uuid not null,
  version_number integer not null,
  status public.course_version_status not null default 'draft',
  title text not null,
  summary text,
  hours numeric(10, 2),
  completion_defaults jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by uuid references auth.users (id),
  source_version_id uuid,
  source_tenant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_versions_course_fk
    foreign key (tenant_id, course_id)
    references public.courses (tenant_id, id),
  constraint course_versions_tenant_id_unique unique (tenant_id, id),
  constraint course_versions_tenant_course_id_unique
    unique (tenant_id, course_id, id),
  constraint course_versions_number_unique unique (course_id, version_number),
  constraint course_versions_number_positive check (version_number > 0),
  constraint course_versions_hours_nonnegative
    check (hours is null or hours >= 0),
  constraint course_versions_title_nonempty check (btrim(title) <> ''),
  constraint course_versions_completion_object
    check (jsonb_typeof(completion_defaults) = 'object'),
  constraint course_versions_source_pair check (
    (source_version_id is null) = (source_tenant_id is null)
  ),
  constraint course_versions_source_fk
    foreign key (source_tenant_id, source_version_id)
    references public.course_versions (tenant_id, id)
);

-- Una versión anterior publicada permanece publicada cuando se publica otra.
create unique index course_versions_one_draft_per_course
  on public.course_versions (course_id)
  where status = 'draft';

alter table public.courses
  add constraint courses_latest_published_fk
  foreign key (tenant_id, id, latest_published_version_id)
  references public.course_versions (tenant_id, course_id, id);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  tenant_id uuid not null,
  title text not null,
  position numeric(12, 4) not null,
  constraint modules_version_fk
    foreign key (tenant_id, version_id)
    references public.course_versions (tenant_id, id),
  constraint modules_tenant_version_id_unique
    unique (tenant_id, version_id, id),
  constraint modules_position_unique
    unique (tenant_id, version_id, position) deferrable initially immediate,
  constraint modules_position_nonnegative check (position >= 0),
  constraint modules_title_nonempty check (btrim(title) <> '')
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null,
  version_id uuid not null,
  tenant_id uuid not null,
  type public.lesson_type not null,
  title text not null,
  position numeric(12, 4) not null,
  is_required boolean not null default true,
  est_minutes integer,
  content jsonb not null default '{}'::jsonb,
  constraint lessons_module_fk
    foreign key (tenant_id, version_id, module_id)
    references public.modules (tenant_id, version_id, id),
  constraint lessons_tenant_version_id_unique
    unique (tenant_id, version_id, id),
  constraint lessons_position_unique
    unique (tenant_id, module_id, position) deferrable initially immediate,
  constraint lessons_position_nonnegative check (position >= 0),
  constraint lessons_est_minutes_nonnegative
    check (est_minutes is null or est_minutes >= 0),
  constraint lessons_title_nonempty check (btrim(title) <> ''),
  constraint lessons_content_object check (jsonb_typeof(content) = 'object')
);

create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  version_id uuid not null,
  tenant_id uuid not null,
  name text not null,
  storage_path text not null,
  kind text not null,
  size_bytes bigint,
  constraint lesson_resources_lesson_fk
    foreign key (tenant_id, version_id, lesson_id)
    references public.lessons (tenant_id, version_id, id),
  constraint lesson_resources_name_nonempty check (btrim(name) <> ''),
  constraint lesson_resources_path_nonempty check (btrim(storage_path) <> ''),
  constraint lesson_resources_kind_nonempty check (btrim(kind) <> ''),
  constraint lesson_resources_size_nonnegative
    check (size_bytes is null or size_bytes >= 0)
);

-- Índices para búsquedas habituales y para el lado dependiente de las FKs.
create index courses_created_by_idx on public.courses (created_by);
create index courses_latest_version_idx
  on public.courses (latest_published_version_id);
create index course_collaborators_tenant_user_idx
  on public.course_collaborators (tenant_id, user_id);
create index course_versions_tenant_course_idx
  on public.course_versions (tenant_id, course_id);
create index course_versions_source_idx
  on public.course_versions (source_tenant_id, source_version_id);
create index course_versions_published_by_idx
  on public.course_versions (published_by);
create index modules_tenant_version_idx
  on public.modules (tenant_id, version_id);
create index lessons_tenant_version_module_idx
  on public.lessons (tenant_id, version_id, module_id);
create index lesson_resources_tenant_version_lesson_idx
  on public.lesson_resources (tenant_id, version_id, lesson_id);

create trigger courses_touch before update on public.courses
  for each row execute function app.touch_updated_at();
create trigger course_collaborators_touch
  before update on public.course_collaborators
  for each row execute function app.touch_updated_at();
create trigger course_versions_touch before update on public.course_versions
  for each row execute function app.touch_updated_at();
