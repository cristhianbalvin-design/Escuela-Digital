-- Actividades interactivas que agrupan preguntas: Bloque → Actividad (live_sets) → Preguntas (live_activities).
create table public.live_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  plan_item_id uuid references public.lesson_plan_items(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  kind text not null check (kind in ('survey','static_quiz','dynamic_quiz','compare','opportunity')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index live_sets_lesson_idx on public.live_sets(lesson_id, position);
alter table public.live_sets enable row level security;
revoke all on public.live_sets from public, anon, authenticated;

alter table public.live_activities add column set_id uuid references public.live_sets(id) on delete cascade;
create index live_activities_set_idx on public.live_activities(set_id, position);

-- Las preguntas existentes se agrupan por bloque y tipo.
with g as (
  select a.tenant_id, a.lesson_id, a.plan_item_id,
    case a.type when 'compare' then 'compare' when 'opportunity' then 'opportunity' when 'quiz' then 'dynamic_quiz' else 'survey' end kind,
    min(a.position) pos, bool_and(coalesce((a.config->>'formative')::boolean, false)) formative
  from public.live_activities a where a.set_id is null group by 1, 2, 3, 4)
insert into public.live_sets(tenant_id, lesson_id, plan_item_id, title, kind, settings, position)
select g.tenant_id, g.lesson_id, g.plan_item_id, coalesce(i.title, 'Actividad'), g.kind,
  case when g.kind = 'dynamic_quiz' and g.formative then '{"formative":true}'::jsonb else '{}'::jsonb end, g.pos
from g left join public.lesson_plan_items i on i.id = g.plan_item_id;
update public.live_activities a set set_id = s.id from public.live_sets s
where a.set_id is null and s.lesson_id = a.lesson_id and s.plan_item_id is not distinct from a.plan_item_id
  and s.kind = case a.type when 'compare' then 'compare' when 'opportunity' then 'opportunity' when 'quiz' then 'dynamic_quiz' else 'survey' end;

create or replace function public.get_live_sets(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'plan_item_id',s.plan_item_id,'title',s.title,
      'kind',s.kind,'settings',s.settings,'position',s.position,
      'question_count',(select count(*)::integer from public.live_activities a where a.set_id=s.id))
      order by s.position, s.created_at)
    from public.live_sets s where s.lesson_id=p_lesson_id),'[]'::jsonb);
end $$;

create or replace function public.save_live_set(p_lesson_id uuid, p_set jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.lessons%rowtype; v_id uuid; v_plan uuid; v_kind text; v_settings jsonb; v_title text;
begin
  if not app.live_manage_lesson(p_lesson_id) then
    raise exception 'Lección no disponible' using errcode='42501'; end if;
  select * into l from public.lessons where id=p_lesson_id;
  if p_set is null or jsonb_typeof(p_set)<>'object' or p_set - 'id' - 'plan_item_id' - 'title' - 'kind' - 'settings' <> '{}'::jsonb then
    raise exception 'Actividad inválida' using errcode='23514'; end if;
  v_id := coalesce(nullif(p_set->>'id','')::uuid, gen_random_uuid());
  v_plan := nullif(p_set->>'plan_item_id','')::uuid;
  v_kind := p_set->>'kind';
  v_title := btrim(coalesce(p_set->>'title',''));
  v_settings := coalesce(p_set->'settings','{}'::jsonb);
  if v_kind not in ('survey','static_quiz','dynamic_quiz','compare','opportunity') or length(v_title) not between 1 and 200
     or jsonb_typeof(v_settings)<>'object' or v_settings - 'formative' <> '{}'::jsonb
     or (v_settings ? 'formative' and jsonb_typeof(v_settings->'formative')<>'boolean')
     or (v_plan is not null and not exists(select 1 from public.lesson_plan_items i where i.id=v_plan and i.lesson_id=l.id))
     or exists(select 1 from public.live_sets s where s.id=v_id and s.lesson_id<>l.id) then
    raise exception 'Actividad inválida' using errcode='23514'; end if;
  insert into public.live_sets(id,tenant_id,lesson_id,plan_item_id,title,kind,settings,position)
    values(v_id,l.tenant_id,l.id,v_plan,v_title,v_kind,v_settings,
      coalesce((select max(position)+1 from public.live_sets where lesson_id=l.id),0))
    on conflict(id) do update set plan_item_id=excluded.plan_item_id,title=excluded.title,kind=excluded.kind,settings=excluded.settings;
  -- Las preguntas siguen el bloque de su actividad y el modo formativo de la actividad.
  update public.live_activities set plan_item_id=v_plan,
    config=case when type='quiz' then (config - 'formative') || case when coalesce((v_settings->>'formative')::boolean,false) then '{"formative":true}'::jsonb else '{}'::jsonb end else config end
    where set_id=v_id;
  return jsonb_build_object('id',v_id,'sets',public.get_live_sets(l.id));
end $$;

create or replace function public.delete_live_set(p_set_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.live_sets%rowtype;
begin
  select * into s from public.live_sets where id=p_set_id;
  if s.id is null or not app.live_manage_lesson(s.lesson_id) then
    raise exception 'Actividad no disponible' using errcode='42501'; end if;
  if exists(select 1 from public.live_runs r join public.live_activities a on a.id=r.activity_id where a.set_id=s.id) then
    raise exception 'Una actividad ya lanzada no se puede eliminar' using errcode='23514'; end if;
  delete from public.live_sets where id=s.id;
  return public.get_live_sets(s.lesson_id);
end $$;

revoke all on function public.get_live_sets(uuid), public.save_live_set(uuid,jsonb), public.delete_live_set(uuid) from public, anon, authenticated;
grant execute on function public.get_live_sets(uuid), public.save_live_set(uuid,jsonb), public.delete_live_set(uuid) to authenticated;

do $$
declare d text; o text;
begin
  d := pg_get_functiondef('public.save_live_activities(uuid,jsonb)'::regprocedure);
  o := 'x - ''id'' - ''plan_item_id'' - ''title'' - ''type'' - ''config'' <> ''{}''::jsonb';
  if position(o in d) = 0 then raise exception 'patch claves no aplica'; end if;
  d := replace(d, o, 'x - ''id'' - ''set_id'' - ''plan_item_id'' - ''title'' - ''type'' - ''config'' <> ''{}''::jsonb');
  o := E'insert into public.live_activities(id,tenant_id,lesson_id,plan_item_id,title,type,config,position)\n      values(v_id,l.tenant_id,l.id,v_plan,';
  if position(o in d) = 0 then raise exception 'patch insert no aplica'; end if;
  d := replace(d, o, E'insert into public.live_activities(id,tenant_id,lesson_id,set_id,plan_item_id,title,type,config,position)\n      values(v_id,l.tenant_id,l.id,(select st.id from public.live_sets st where st.id=nullif(x->>''set_id'','''')::uuid and st.lesson_id=l.id),v_plan,');
  o := 'on conflict(id) do update set plan_item_id=excluded.plan_item_id,';
  if position(o in d) = 0 then raise exception 'patch conflicto no aplica'; end if;
  execute replace(d, o, 'on conflict(id) do update set set_id=excluded.set_id,plan_item_id=excluded.plan_item_id,');

  d := pg_get_functiondef('public.get_live_activities(uuid)'::regprocedure);
  o := '''plan_item_id'',a.plan_item_id,';
  if position(o in d) = 0 then raise exception 'patch salida no aplica'; end if;
  execute replace(d, o, '''set_id'',a.set_id,''plan_item_id'',a.plan_item_id,');

  -- El ranking del cuestionario dinámico se calcula por actividad.
  d := pg_get_functiondef('app.live_rank_detail(uuid)'::regprocedure);
  o := 'la.plan_item_id is not distinct from (select la2.plan_item_id';
  if position(o in d) = 0 then raise exception 'patch ranking no aplica'; end if;
  execute replace(d, o, 'la.set_id is not distinct from (select la2.set_id');
end $$;
