-- Marcar actividades: cualquiera que gestione la edición (docente asignado, owner/admin de la escuela).
-- Antes exigía además el rol 'instructor', lo que dejaba sin poder marcar a quien dicta siendo administrador.
create or replace function public.get_session_plan(p_offering_id uuid,p_lesson_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.offerings%rowtype; result jsonb;
begin
 select * into o from public.offerings where id=p_offering_id and deleted_at is null;
 if o.id is null or not app.can_read_plan_offering(o.id) or not exists(select 1 from public.lessons l join public.course_versions cv on cv.id=l.version_id and cv.tenant_id=l.tenant_id where l.id=p_lesson_id and l.version_id=o.version_id and l.tenant_id=o.tenant_id and cv.course_id=o.course_id) then raise exception 'Sesión no disponible' using errcode='42501'; end if;
 result:=public.get_lesson_plan(p_lesson_id);
 return result || jsonb_build_object('can_mark',app.can_manage_offering(o.id), 'progress',coalesce((select jsonb_agg(jsonb_build_object('item_id',p.item_id,'done',p.done,'done_at',p.done_at,'done_by',p.done_by)) from public.session_plan_progress p join public.lesson_plan_items i on i.id=p.item_id and i.tenant_id=p.tenant_id where p.offering_id=o.id and p.tenant_id=o.tenant_id and i.lesson_id=p_lesson_id),'[]'::jsonb));
end $$;
create or replace function public.set_plan_item_done(p_offering_id uuid,p_item_id uuid,p_done boolean) returns void language plpgsql volatile security definer set search_path='' as $$
declare o public.offerings%rowtype;
begin
 select * into o from public.offerings where id=p_offering_id and deleted_at is null;
 if o.id is null or p_done is null or not app.can_manage_offering(o.id) or not exists(select 1 from public.lesson_plan_items i join public.lessons l on l.id=i.lesson_id and l.tenant_id=i.tenant_id join public.course_versions cv on cv.id=l.version_id and cv.tenant_id=l.tenant_id where i.id=p_item_id and i.tenant_id=o.tenant_id and l.version_id=o.version_id and cv.course_id=o.course_id) then raise exception 'Actividad no disponible' using errcode='42501'; end if;
 insert into public.session_plan_progress(tenant_id,offering_id,item_id,done,done_at,done_by) values(o.tenant_id,o.id,p_item_id,p_done,case when p_done then now() end,case when p_done then auth.uid() end)
 on conflict(offering_id,item_id) do update set done=excluded.done,done_at=excluded.done_at,done_by=excluded.done_by;
end $$;
