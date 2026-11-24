do $$
declare
  d text;
  o text;
  n text;
begin
  d := pg_get_functiondef('public.create_live_session(uuid,uuid,text,boolean,boolean)'::regprocedure);
  o := '  if exists(select 1 from public.live_sessions where offering_id=o.id and status=''active'') then';
  n := '  update public.live_sessions set status=''ended'', ended_at=now() where offering_id=o.id and status=''active'' and created_at < now() - interval ''6 hours'';
' || o;
  if position(o in d)=0 then raise exception 'No se encontro la comprobacion de clase activa'; end if;
  execute replace(d,o,n);
end $$;
