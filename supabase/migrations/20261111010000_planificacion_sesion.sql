-- Planes privados por lección. Bucket separado de lesson-resources: sus políticas
-- permiten alumnos y no son apropiadas para una guía docente. Ruta tenant/lesson/uuid-nombre.
create table public.lesson_plan_items (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 200), minutes integer check (minutes between 1 and 1440),
 kind text not null check (kind in ('explicacion','practica','evaluacion','descanso','interactiva','otro')),
 notes text not null default '' check (length(notes) <= 5000), position integer not null check (position >= 0)
);
create index lesson_plan_items_lesson_idx on public.lesson_plan_items(tenant_id, lesson_id, position);
create table public.lesson_plan_files (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 lesson_id uuid not null references public.lessons(id) on delete cascade,
 name text not null check (length(name) between 1 and 255), storage_path text not null unique,
 size_bytes bigint not null check (size_bytes between 1 and 26214400)
);
create index lesson_plan_files_lesson_idx on public.lesson_plan_files(tenant_id, lesson_id);
create table public.session_plan_progress (
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 offering_id uuid not null references public.offerings(id) on delete cascade,
 item_id uuid not null references public.lesson_plan_items(id) on delete cascade,
 done boolean not null default false, done_at timestamptz, done_by uuid references auth.users(id) on delete set null,
 primary key(offering_id,item_id), check ((done and done_at is not null) or (not done and done_at is null and done_by is null))
);
alter table public.lesson_plan_items enable row level security;
alter table public.lesson_plan_files enable row level security;
alter table public.session_plan_progress enable row level security;
revoke all on public.lesson_plan_items, public.lesson_plan_files, public.session_plan_progress from public, anon, authenticated;

create function app.can_edit_plan(p_lesson_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.lessons l join public.course_versions cv on cv.id=l.version_id and cv.tenant_id=l.tenant_id
 join public.courses c on c.id=cv.course_id and c.tenant_id=l.tenant_id
 where l.id=p_lesson_id and app.can_edit_course(c.id) and (cv.status='draft' or app.version_content_editable(cv.id)));
$$;
create function app.can_read_plan_offering(p_offering_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.offerings o where o.id=p_offering_id and o.deleted_at is null and
 (app.can_manage_offering(o.id) or app.is_client_coordinator(o.client_id)));
$$;
create function app.can_read_plan_lesson(p_lesson_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.lessons l join public.course_versions cv on cv.id=l.version_id and cv.tenant_id=l.tenant_id
 join public.courses c on c.id=cv.course_id and c.tenant_id=l.tenant_id
 where l.id=p_lesson_id and (app.can_read_course(c.id) or exists (select 1 from public.offerings o
 where o.version_id=l.version_id and o.tenant_id=l.tenant_id and app.can_read_plan_offering(o.id))));
$$;
create function app.can_edit_plan_path(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.lessons l where l.id::text=split_part(p_path,'/',2)
 and l.tenant_id::text=split_part(p_path,'/',1) and split_part(p_path,'/',3) <> '' and app.can_edit_plan(l.id));
$$;
create function app.can_read_plan_path(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.lesson_plan_files f where f.storage_path=p_path and app.can_read_plan_lesson(f.lesson_id));
$$;
revoke all on function app.can_edit_plan(uuid), app.can_read_plan_offering(uuid), app.can_read_plan_lesson(uuid), app.can_edit_plan_path(text), app.can_read_plan_path(text) from public, anon, authenticated;
grant execute on function app.can_edit_plan(uuid), app.can_read_plan_offering(uuid), app.can_read_plan_lesson(uuid), app.can_edit_plan_path(text), app.can_read_plan_path(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('lesson-plans','lesson-plans',false,26214400,
 array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']) on conflict(id) do nothing;
create policy lesson_plan_upload on storage.objects for insert to authenticated with check (bucket_id='lesson-plans' and app.can_edit_plan_path(name));
create policy lesson_plan_download on storage.objects for select to authenticated using (bucket_id='lesson-plans' and (app.can_read_plan_path(name) or app.can_edit_plan_path(name)));
create policy lesson_plan_delete on storage.objects for delete to authenticated using (bucket_id='lesson-plans' and app.can_edit_plan_path(name));

create function public.get_lesson_plan(p_lesson_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app.can_read_plan_lesson(p_lesson_id) then raise exception 'Plan no disponible' using errcode='42501'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'minutes',i.minutes,'kind',i.kind,'notes',i.notes) order by i.position,i.id) from public.lesson_plan_items i where i.lesson_id=p_lesson_id),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'storage_path',f.storage_path,'size_bytes',f.size_bytes) order by f.name,f.id) from public.lesson_plan_files f where f.lesson_id=p_lesson_id),'[]'::jsonb));
end $$;
create function public.save_lesson_plan(p_lesson_id uuid,p_items jsonb) returns void language plpgsql volatile security definer set search_path='' as $$
declare v_l public.lessons%rowtype; x jsonb; v_id uuid; ids uuid[] := '{}'; pos integer := 0;
begin
 if not app.can_edit_plan(p_lesson_id) then raise exception 'No se permite editar el plan' using errcode='42501'; end if;
 select * into v_l from public.lessons where id=p_lesson_id for update;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500 then raise exception 'Plan inválido' using errcode='23514'; end if;
 for x in select * from jsonb_array_elements(p_items) loop
  v_id := coalesce(nullif(x->>'id','')::uuid,gen_random_uuid());
  if v_id=any(ids) or exists(select 1 from public.lesson_plan_items where id=v_id and (lesson_id<>v_l.id or tenant_id<>v_l.tenant_id)) then raise exception 'Actividad inválida' using errcode='23514'; end if;
  ids := array_append(ids,v_id);
  insert into public.lesson_plan_items(id,tenant_id,lesson_id,title,minutes,kind,notes,position)
   values(v_id,v_l.tenant_id,v_l.id,trim(x->>'title'),nullif(x->>'minutes','')::integer,x->>'kind',coalesce(x->>'notes',''),pos)
   on conflict(id) do update set title=excluded.title,minutes=excluded.minutes,kind=excluded.kind,notes=excluded.notes,position=excluded.position;
  pos:=pos+1;
 end loop;
 delete from public.lesson_plan_items where lesson_id=v_l.id and tenant_id=v_l.tenant_id and not(id=any(ids));
end $$;
create function public.add_lesson_plan_file(p_lesson_id uuid,p_name text,p_storage_path text,p_size_bytes bigint) returns void language plpgsql volatile security definer set search_path='' as $$
declare l public.lessons%rowtype;
begin
 if not app.can_edit_plan(p_lesson_id) or not app.can_edit_plan_path(p_storage_path) or split_part(p_storage_path,'/',2)<>p_lesson_id::text then raise exception 'Archivo no permitido' using errcode='42501'; end if;
 select * into l from public.lessons where id=p_lesson_id;
 if not exists(select 1 from storage.objects where bucket_id='lesson-plans' and name=p_storage_path) then raise exception 'Archivo inexistente' using errcode='23514'; end if;
 insert into public.lesson_plan_files(tenant_id,lesson_id,name,storage_path,size_bytes) values(l.tenant_id,l.id,p_name,p_storage_path,p_size_bytes);
end $$;
create function public.remove_lesson_plan_file(p_file_id uuid) returns void language plpgsql volatile security definer set search_path='' as $$
declare f public.lesson_plan_files%rowtype;
begin
 select * into f from public.lesson_plan_files where id=p_file_id;
 if f.id is null or not app.can_edit_plan(f.lesson_id) then raise exception 'Archivo no permitido' using errcode='42501'; end if;
 delete from public.lesson_plan_files where id=f.id;
end $$;
create function public.get_session_plan(p_offering_id uuid,p_lesson_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.offerings%rowtype; result jsonb;
begin
 select * into o from public.offerings where id=p_offering_id and deleted_at is null;
 if o.id is null or not app.can_read_plan_offering(o.id) or not exists(select 1 from public.lessons l join public.course_versions cv on cv.id=l.version_id and cv.tenant_id=l.tenant_id where l.id=p_lesson_id and l.version_id=o.version_id and l.tenant_id=o.tenant_id and cv.course_id=o.course_id) then raise exception 'Sesión no disponible' using errcode='42501'; end if;
 result:=public.get_lesson_plan(p_lesson_id);
 return result || jsonb_build_object('can_mark',app.can_manage_offering(o.id) and app.is_offering_instructor(o.id), 'progress',coalesce((select jsonb_agg(jsonb_build_object('item_id',p.item_id,'done',p.done,'done_at',p.done_at,'done_by',p.done_by)) from public.session_plan_progress p join public.lesson_plan_items i on i.id=p.item_id and i.tenant_id=p.tenant_id where p.offering_id=o.id and p.tenant_id=o.tenant_id and i.lesson_id=p_lesson_id),'[]'::jsonb));
end $$;
create function public.set_plan_item_done(p_offering_id uuid,p_item_id uuid,p_done boolean) returns void language plpgsql volatile security definer set search_path='' as $$
declare o public.offerings%rowtype;
begin
 select * into o from public.offerings where id=p_offering_id and deleted_at is null;
 if o.id is null or p_done is null or not app.can_manage_offering(o.id) or not app.is_offering_instructor(o.id) or not exists(select 1 from public.lesson_plan_items i join public.lessons l on l.id=i.lesson_id and l.tenant_id=i.tenant_id join public.course_versions cv on cv.id=l.version_id and cv.tenant_id=l.tenant_id where i.id=p_item_id and i.tenant_id=o.tenant_id and l.version_id=o.version_id and cv.course_id=o.course_id) then raise exception 'Actividad no disponible' using errcode='42501'; end if;
 insert into public.session_plan_progress(tenant_id,offering_id,item_id,done,done_at,done_by) values(o.tenant_id,o.id,p_item_id,p_done,case when p_done then now() end,case when p_done then auth.uid() end)
 on conflict(offering_id,item_id) do update set done=excluded.done,done_at=excluded.done_at,done_by=excluded.done_by;
end $$;
create function public.list_offering_plan_progress(p_offering_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.offerings%rowtype;
begin
 select * into o from public.offerings where id=p_offering_id and deleted_at is null;
 if o.id is null or not app.can_read_plan_offering(o.id) then raise exception 'Edición no disponible' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('lesson_id',l.id,'lesson_title',l.title,'module_title',m.title,'session_date',s.session_date,'start_time',s.start_time,'end_time',s.end_time,'total',q.total,'done',q.done) order by m.position,l.position) from public.lessons l join public.modules m on m.id=l.module_id and m.tenant_id=l.tenant_id left join public.offering_sessions s on s.offering_id=o.id and s.lesson_id=l.id and s.tenant_id=o.tenant_id cross join lateral (select count(*)::integer total,count(*) filter(where p.done)::integer done from public.lesson_plan_items i left join public.session_plan_progress p on p.item_id=i.id and p.offering_id=o.id and p.tenant_id=o.tenant_id where i.lesson_id=l.id and i.tenant_id=o.tenant_id) q where l.version_id=o.version_id and l.tenant_id=o.tenant_id),'[]'::jsonb);
end $$;
revoke all on function public.get_lesson_plan(uuid),public.save_lesson_plan(uuid,jsonb),public.add_lesson_plan_file(uuid,text,text,bigint),public.remove_lesson_plan_file(uuid),public.get_session_plan(uuid,uuid),public.set_plan_item_done(uuid,uuid,boolean),public.list_offering_plan_progress(uuid) from public,anon;
grant execute on function public.get_lesson_plan(uuid),public.save_lesson_plan(uuid,jsonb),public.add_lesson_plan_file(uuid,text,text,bigint),public.remove_lesson_plan_file(uuid),public.get_session_plan(uuid,uuid),public.set_plan_item_done(uuid,uuid,boolean),public.list_offering_plan_progress(uuid) to authenticated;
