-- La guía de clase necesita título, módulo y fecha/horario de cada sesión junto al avance.
create or replace function public.list_offering_plan_progress(p_offering_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.offerings%rowtype;
begin
 select * into o from public.offerings where id=p_offering_id and deleted_at is null;
 if o.id is null or not app.can_read_plan_offering(o.id) then raise exception 'Edición no disponible' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('lesson_id',l.id,'lesson_title',l.title,'module_title',m.title,'session_date',s.session_date,'start_time',s.start_time,'end_time',s.end_time,'total',q.total,'done',q.done) order by m.position,l.position) from public.lessons l join public.modules m on m.id=l.module_id and m.tenant_id=l.tenant_id left join public.offering_sessions s on s.offering_id=o.id and s.lesson_id=l.id and s.tenant_id=o.tenant_id cross join lateral (select count(*)::integer total,count(*) filter(where p.done)::integer done from public.lesson_plan_items i left join public.session_plan_progress p on p.item_id=i.id and p.offering_id=o.id and p.tenant_id=o.tenant_id where i.lesson_id=l.id and i.tenant_id=o.tenant_id) q where l.version_id=o.version_id and l.tenant_id=o.tenant_id),'[]'::jsonb);
end $$;
