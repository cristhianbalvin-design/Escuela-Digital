-- Paso 9A: evaluaciones, tareas y notas — tablas.
-- Las preguntas viven dentro de la versión del curso (inmutable al publicar).
-- Las respuestas correctas están en question_keys, que nunca se expone a estudiantes.

create type public.question_type as enum ('single', 'multiple', 'true_false', 'short', 'essay');
create type public.attempt_status as enum ('in_progress', 'submitted', 'graded');
create type public.submission_status as enum ('submitted', 'graded');
create type public.grade_source_type as enum ('assessment', 'assignment', 'manual');

-- ---------------------------------------------------------------------------
-- Cuestionarios
-- ---------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  instructions text not null default '',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessments_version_fk foreign key (tenant_id, version_id)
    references public.course_versions (tenant_id, id) on delete cascade,
  constraint assessments_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  assessment_id uuid not null,
  position integer not null check (position >= 0),
  type public.question_type not null,
  prompt text not null check (length(btrim(prompt)) between 1 and 4000),
  points numeric(7, 2) not null default 1 check (points > 0),
  feedback_ok text,
  feedback_bad text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_assessment_fk foreign key (tenant_id, version_id, assessment_id)
    references public.assessments (tenant_id, version_id, id) on delete cascade,
  constraint questions_position_unique unique (assessment_id, position) deferrable,
  constraint questions_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  question_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 1000),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_options_question_fk foreign key (tenant_id, version_id, question_id)
    references public.questions (tenant_id, version_id, id) on delete cascade,
  constraint question_options_position_unique unique (question_id, position) deferrable,
  constraint question_options_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.question_keys (
  question_id uuid primary key,
  tenant_id uuid not null,
  version_id uuid not null,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_keys_question_fk foreign key (tenant_id, version_id, question_id)
    references public.questions (tenant_id, version_id, id) on delete cascade
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  enrollment_id uuid not null,
  attempt_no integer not null check (attempt_no >= 1),
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  submitted_at timestamptz,
  score numeric(7, 2),
  max_score numeric(7, 2),
  seed text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attempts_enrollment_fk foreign key (tenant_id, client_id, enrollment_id)
    references public.enrollments (tenant_id, client_id, id) on delete cascade,
  constraint attempts_number_unique unique (enrollment_id, assessment_id, attempt_no),
  constraint attempts_tenant_id_unique unique (tenant_id, id)
);

create table public.attempt_answers (
  attempt_id uuid not null,
  question_id uuid not null references public.questions (id) on delete cascade,
  tenant_id uuid not null,
  answer jsonb,
  score numeric(7, 2),
  feedback text,
  graded_by uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id),
  constraint attempt_answers_attempt_fk foreign key (tenant_id, attempt_id)
    references public.attempts (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Rúbricas y tareas
-- ---------------------------------------------------------------------------
create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rubrics_version_fk foreign key (tenant_id, version_id)
    references public.course_versions (tenant_id, id) on delete cascade,
  constraint rubrics_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  rubric_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rubric_criteria_rubric_fk foreign key (tenant_id, version_id, rubric_id)
    references public.rubrics (tenant_id, version_id, id) on delete cascade,
  constraint rubric_criteria_position_unique unique (rubric_id, position) deferrable,
  constraint rubric_criteria_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.rubric_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  criterion_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  descriptor text not null default '',
  points numeric(7, 2) not null check (points >= 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rubric_levels_criterion_fk foreign key (tenant_id, version_id, criterion_id)
    references public.rubric_criteria (tenant_id, version_id, id) on delete cascade,
  constraint rubric_levels_position_unique unique (criterion_id, position) deferrable,
  constraint rubric_levels_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  instructions text not null default '',
  rubric_id uuid,
  submission_types text[] not null default array['text']
    check (submission_types <@ array['text', 'link', 'file'] and cardinality(submission_types) >= 1),
  due_at timestamptz,
  allow_late boolean not null default true,
  late_penalty_pct numeric(5, 2) not null default 0 check (late_penalty_pct between 0 and 100),
  max_score numeric(7, 2) not null default 20 check (max_score > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_version_fk foreign key (tenant_id, version_id)
    references public.course_versions (tenant_id, id) on delete cascade,
  constraint assignments_rubric_fk foreign key (tenant_id, version_id, rubric_id)
    references public.rubrics (tenant_id, version_id, id),
  constraint assignments_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  enrollment_id uuid not null,
  status public.submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  text text,
  link text,
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  raw_score numeric(7, 2),
  score numeric(7, 2),
  feedback text,
  graded_by uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_enrollment_fk foreign key (tenant_id, client_id, enrollment_id)
    references public.enrollments (tenant_id, client_id, id) on delete cascade,
  constraint submissions_unique unique (assignment_id, enrollment_id),
  constraint submissions_tenant_id_unique unique (tenant_id, id)
);

create table public.submission_scores (
  submission_id uuid not null,
  criterion_id uuid not null references public.rubric_criteria (id) on delete cascade,
  tenant_id uuid not null,
  level_id uuid not null references public.rubric_levels (id) on delete cascade,
  points numeric(7, 2) not null check (points >= 0),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (submission_id, criterion_id),
  constraint submission_scores_submission_fk foreign key (tenant_id, submission_id)
    references public.submissions (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------------
create table public.grade_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null,
  source_type public.grade_source_type not null,
  source_id uuid,
  title text not null check (length(btrim(title)) between 1 and 160),
  weight numeric(6, 2) not null default 1 check (weight >= 0),
  max_score numeric(7, 2) check (max_score > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grade_items_version_fk foreign key (tenant_id, version_id)
    references public.course_versions (tenant_id, id) on delete cascade,
  constraint grade_items_manual_shape check (
    (source_type = 'manual' and source_id is null and max_score is not null)
    or (source_type <> 'manual' and source_id is not null)
  ),
  constraint grade_items_tenant_version_id_unique unique (tenant_id, version_id, id)
);

create unique index grade_items_source_key
  on public.grade_items (version_id, source_type, source_id)
  where source_id is not null;

create table public.grades (
  enrollment_id uuid not null,
  grade_item_id uuid not null references public.grade_items (id) on delete cascade,
  tenant_id uuid not null,
  client_id uuid not null,
  score numeric(7, 2) not null check (score >= 0),
  max_score numeric(7, 2) not null check (max_score > 0),
  graded_by uuid references auth.users (id) on delete set null,
  comment text,
  adjusted_reason text,
  graded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, grade_item_id),
  constraint grades_enrollment_fk foreign key (tenant_id, client_id, enrollment_id)
    references public.enrollments (tenant_id, client_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Índices de llaves foráneas y consultas frecuentes
-- ---------------------------------------------------------------------------
create index assessments_version_idx on public.assessments (tenant_id, version_id);
create index questions_assessment_idx on public.questions (assessment_id);
create index questions_scope_idx on public.questions (tenant_id, version_id);
create index question_options_question_idx on public.question_options (question_id);
create index question_options_scope_idx on public.question_options (tenant_id, version_id);
create index question_keys_scope_idx on public.question_keys (tenant_id, version_id);
create index attempts_assessment_idx on public.attempts (assessment_id);
create index attempts_enrollment_idx on public.attempts (enrollment_id);
create index attempts_scope_idx on public.attempts (tenant_id, client_id);
create index attempt_answers_question_idx on public.attempt_answers (question_id);
create index attempt_answers_attempt_idx on public.attempt_answers (tenant_id, attempt_id);
create index attempt_answers_graded_by_idx on public.attempt_answers (graded_by);
create index rubrics_version_idx on public.rubrics (tenant_id, version_id);
create index rubric_criteria_rubric_idx on public.rubric_criteria (rubric_id);
create index rubric_criteria_scope_idx on public.rubric_criteria (tenant_id, version_id);
create index rubric_levels_criterion_idx on public.rubric_levels (criterion_id);
create index rubric_levels_scope_idx on public.rubric_levels (tenant_id, version_id);
create index assignments_version_idx on public.assignments (tenant_id, version_id);
create index assignments_rubric_idx on public.assignments (tenant_id, version_id, rubric_id);
create index submissions_assignment_idx on public.submissions (assignment_id);
create index submissions_enrollment_idx on public.submissions (enrollment_id);
create index submissions_scope_idx on public.submissions (tenant_id, client_id);
create index submissions_graded_by_idx on public.submissions (graded_by);
create index submission_scores_criterion_idx on public.submission_scores (criterion_id);
create index submission_scores_level_idx on public.submission_scores (level_id);
create index submission_scores_scope_idx on public.submission_scores (tenant_id, submission_id);
create index grade_items_version_idx on public.grade_items (tenant_id, version_id);
create index grades_item_idx on public.grades (grade_item_id);
create index grades_enrollment_idx on public.grades (enrollment_id);
create index grades_scope_idx on public.grades (tenant_id, client_id);
create index grades_graded_by_idx on public.grades (graded_by);

-- updated_at
create trigger assessments_touch before update on public.assessments for each row execute function app.touch_updated_at();
create trigger questions_touch before update on public.questions for each row execute function app.touch_updated_at();
create trigger question_options_touch before update on public.question_options for each row execute function app.touch_updated_at();
create trigger question_keys_touch before update on public.question_keys for each row execute function app.touch_updated_at();
create trigger attempts_touch before update on public.attempts for each row execute function app.touch_updated_at();
create trigger attempt_answers_touch before update on public.attempt_answers for each row execute function app.touch_updated_at();
create trigger rubrics_touch before update on public.rubrics for each row execute function app.touch_updated_at();
create trigger rubric_criteria_touch before update on public.rubric_criteria for each row execute function app.touch_updated_at();
create trigger rubric_levels_touch before update on public.rubric_levels for each row execute function app.touch_updated_at();
create trigger assignments_touch before update on public.assignments for each row execute function app.touch_updated_at();
create trigger submissions_touch before update on public.submissions for each row execute function app.touch_updated_at();
create trigger submission_scores_touch before update on public.submission_scores for each row execute function app.touch_updated_at();
create trigger grade_items_touch before update on public.grade_items for each row execute function app.touch_updated_at();
create trigger grades_touch before update on public.grades for each row execute function app.touch_updated_at();

-- RLS activado en todo; las políticas llegan en la migración siguiente.
alter table public.assessments enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_keys enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.rubric_levels enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_scores enable row level security;
alter table public.grade_items enable row level security;
alter table public.grades enable row level security;
