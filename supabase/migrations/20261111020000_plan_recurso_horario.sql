alter table public.lesson_plan_items
 add column resource text check (resource is null or length(resource) between 1 and 120),
 add column starts_at time;

create or replace function public.get_lesson_plan(p_lesson_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app.can_read_plan_lesson(p_lesson_id) then raise exception 'Plan no disponible' using errcode='42501'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'minutes',i.minutes,'kind',i.kind,'notes',i.notes,'resource',i.resource,'starts_at',to_char(i.starts_at,'HH24:MI')) order by i.position,i.id) from public.lesson_plan_items i where i.lesson_id=p_lesson_id),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'storage_path',f.storage_path,'size_bytes',f.size_bytes) order by f.name,f.id) from public.lesson_plan_files f where f.lesson_id=p_lesson_id),'[]'::jsonb));
end $$;
create or replace function public.save_lesson_plan(p_lesson_id uuid,p_items jsonb) returns void language plpgsql volatile security definer set search_path='' as $$
declare v_l public.lessons%rowtype; x jsonb; v_id uuid; ids uuid[] := '{}'; pos integer := 0;
begin
 if not app.can_edit_plan(p_lesson_id) then raise exception 'No se permite editar el plan' using errcode='42501'; end if;
 select * into v_l from public.lessons where id=p_lesson_id for update;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500 then raise exception 'Plan inválido' using errcode='23514'; end if;
 for x in select * from jsonb_array_elements(p_items) loop
  v_id := coalesce(nullif(x->>'id','')::uuid,gen_random_uuid());
  if v_id=any(ids) or exists(select 1 from public.lesson_plan_items where id=v_id and (lesson_id<>v_l.id or tenant_id<>v_l.tenant_id)) then raise exception 'Actividad inválida' using errcode='23514'; end if;
  if nullif(x->>'starts_at','') is not null and (x->>'starts_at') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Horario inválido' using errcode='23514'; end if;
  ids := array_append(ids,v_id);
  insert into public.lesson_plan_items(id,tenant_id,lesson_id,title,minutes,kind,notes,resource,starts_at,position)
   values(v_id,v_l.tenant_id,v_l.id,trim(x->>'title'),nullif(x->>'minutes','')::integer,x->>'kind',coalesce(x->>'notes',''),nullif(trim(x->>'resource'),''),nullif(x->>'starts_at','')::time,pos)
   on conflict(id) do update set title=excluded.title,minutes=excluded.minutes,kind=excluded.kind,notes=excluded.notes,resource=excluded.resource,starts_at=excluded.starts_at,position=excluded.position;
  pos:=pos+1;
 end loop;
 delete from public.lesson_plan_items where lesson_id=v_l.id and tenant_id=v_l.tenant_id and not(id=any(ids));
end $$;
