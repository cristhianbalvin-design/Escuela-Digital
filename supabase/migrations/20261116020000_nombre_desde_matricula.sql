-- El alumno que entra sin cuenta elige su nombre de la lista de matriculados; así cada respuesta queda asociada al alumno.
alter table public.live_participants add column if not exists roster_user_id uuid;

create or replace function app.live_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(coalesce(p,'')),'áéíóúüñàèìòùäëïöâêîôûç','aeiouunaeiouaeioaeiouc'),'\s+',' ','g');
$$;
revoke all on function app.live_norm(text) from public, anon, authenticated;

-- Búsqueda acotada: sólo con una clase activa, al menos 2 letras, máximo 8 nombres y sin correos.
create or replace function public.search_live_roster(p_code text, p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.live_sessions%rowtype; v_words text[];
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{6}$' or length(btrim(coalesce(p_query,''))) not between 2 and 80 then
    return '[]'::jsonb; end if;
  select * into s from public.live_sessions where code=p_code;
  if s.id is null or s.status<>'active' then return '[]'::jsonb; end if;
  v_words := regexp_split_to_array(btrim(app.live_norm(p_query)),' ');
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.user_id,'name',x.name) order by x.name)
    from (select e.user_id, btrim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name')) name
      from public.enrollments e join auth.users u on u.id=e.user_id
      where e.offering_id=s.offering_id and e.tenant_id=s.tenant_id and e.status in ('active','completed')
        and length(btrim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','')))>0
        and (select bool_and(app.live_norm(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name')) like '%'||w||'%') from unnest(v_words) w)
      order by 2 limit 8) x), '[]'::jsonb);
end $$;
revoke all on function public.search_live_roster(text,text) from public;
grant execute on function public.search_live_roster(text,text) to anon, authenticated;

do $$
declare d text; o text;
begin
  d := pg_get_functiondef('public.join_live_session(text,text,text)'::regprocedure);
  o := 'public.join_live_session(p_code text, p_name text, p_company text)';
  if position(o in d)=0 then raise exception 'patch firma no aplica'; end if;
  d := replace(d, o, 'public.join_live_session(p_code text, p_name text, p_company text, p_student_id uuid DEFAULT NULL::uuid)');
  o := 'declare s public.live_sessions%rowtype; v_token text; v_user uuid; v_participant uuid;';
  if position(o in d)=0 then raise exception 'patch declare no aplica'; end if;
  d := replace(d, o, o || ' v_roster uuid; v_roster_name text;');
  o := E'    raise exception ''Acceso no disponible'' using errcode=''42501'';\n  end if;';
  if position(o in d)=0 then raise exception 'patch acceso no aplica'; end if;
  d := replace(d, o, o || E'\n  if p_student_id is not null and v_user is null then\n'
    '    select e.user_id, btrim(coalesce(u.raw_user_meta_data->>''full_name'',u.raw_user_meta_data->>''name'')) into v_roster, v_roster_name\n'
    '      from public.enrollments e join auth.users u on u.id=e.user_id\n'
    '      where e.offering_id=s.offering_id and e.tenant_id=s.tenant_id and e.user_id=p_student_id and e.status in (''active'',''completed'');\n'
    '    if v_roster is null or length(coalesce(v_roster_name,''''))=0 then\n'
    '      raise exception ''Alumno no encontrado'' using errcode=''23514''; end if;\n'
    '    p_name := v_roster_name;\n'
    '  end if;');
  o := E'insert into public.live_participants(tenant_id,session_id,token_hash,user_id,name,company)\n      values(s.tenant_id,s.id,extensions.digest(decode(v_token,''hex''),''sha256''),v_user,\n        case when s.ask_name then btrim(p_name) end,';
  if position(o in d)=0 then raise exception 'patch insert no aplica'; end if;
  d := replace(d, o, E'insert into public.live_participants(tenant_id,session_id,token_hash,user_id,roster_user_id,name,company)\n      values(s.tenant_id,s.id,extensions.digest(decode(v_token,''hex''),''sha256''),v_user,v_roster,\n        case when s.ask_name or v_roster is not null then btrim(p_name) end,');
  drop function public.join_live_session(text,text,text);
  execute d;
end $$;
revoke all on function public.join_live_session(text,text,text,uuid) from public;
grant execute on function public.join_live_session(text,text,text,uuid) to anon, authenticated;
