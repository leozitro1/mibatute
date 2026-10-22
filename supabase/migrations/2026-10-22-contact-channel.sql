begin;
-- Change contact text in future moderation notices, preserving existing receipts and access guards.
do $$
declare target regprocedure; definition text; replacement text; permissions jsonb;
begin
 foreach target in array array[
  'public.staff_action(text,uuid,text,text,jsonb)'::regprocedure,
  'public.staff_block_user(uuid,text)'::regprocedure
 ] loop
  select jsonb_build_array(prosecdef,proconfig,proacl,proowner) into permissions from pg_proc where oid=target;
  definition:=pg_get_functiondef(target);
  replacement:=regexp_replace(definition,'escribiendo a [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    'mediante el canal de contacto de MiBatute','g');
  replacement:=regexp_replace(replacement,'administracion en [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    'administracion mediante el canal de contacto de MiBatute','g');
  if replacement is distinct from definition then execute replacement;end if;
  if (select jsonb_build_array(prosecdef,proconfig,proacl,proowner) from pg_proc where oid=target) is distinct from permissions then
    raise exception 'No se deben modificar los permisos al cambiar el canal de contacto.';
  end if;
 end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
