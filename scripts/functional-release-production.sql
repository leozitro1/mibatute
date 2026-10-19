begin;
-- Abort if the live definitions drifted from the tested support baseline.
do $$
declare signature regprocedure; expected text; actual text;
begin
 for signature,expected in select * from (values
 ('public.support_start_thread(uuid,text,text)'::regprocedure,'66f9572128619e2e2c172043dfaad7c9'),
 ('public.support_reply(uuid,uuid,text,boolean)'::regprocedure,'f89f7cd586cc13b4713eb660fe803acd')) f(signature,expected)
 loop
  select md5(prosrc) into actual from pg_proc where oid=signature;
  if actual<>expected and actual not in('7c9103cb7f7f7e00be878adb31079860','2d95ba8300156a2fd280a3cb8051106d') then raise exception 'Unexpected support definition: %',signature;end if;
 end loop;
 if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='capture_registration_consent' and not tgisinternal) then raise exception 'Draft registration guard must not be installed in this partial release';end if;
end;
$$;
alter table public.support_messages drop constraint if exists support_messages_body_check;
alter table public.support_messages add constraint support_messages_body_check check(length(body) between 1 and 500) not valid;
do $$
declare signature regprocedure; definition text;
begin
 foreach signature in array array['public.support_start_thread(uuid,text,text)'::regprocedure,'public.support_reply(uuid,uuid,text,boolean)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);execute replace(definition,'2000','500');
 end loop;
 foreach signature in array array['public.staff_action(text,uuid,text,text,jsonb)'::regprocedure,'public.staff_block_user(uuid,text)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);execute replace(definition,'hola@mibatute.com','edgarleonardo202@gmail.com');
 end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
select proname,md5(prosrc) as body_hash from pg_proc where oid in('public.support_start_thread(uuid,text,text)'::regprocedure,'public.support_reply(uuid,uuid,text,boolean)'::regprocedure);
