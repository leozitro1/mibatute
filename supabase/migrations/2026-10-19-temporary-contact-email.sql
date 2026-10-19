begin;
-- Change only future moderation notices. Preserve historical messages and access.
do $$
declare target regprocedure; definition text;
begin
 foreach target in array array[
  'public.staff_action(text,uuid,text,text,jsonb)'::regprocedure,
  'public.staff_block_user(uuid,text)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(target);
  if position('hola@mibatute.com' in definition)>0 then
   execute replace(definition,'hola@mibatute.com','edgarleonardo202@gmail.com');
  end if;
 end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
