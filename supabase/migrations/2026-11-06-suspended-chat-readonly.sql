begin;

-- A temporary suspension blocks writes, not a participant's own history.
-- Keep permanent blocks, participant checks, pagination, retention and filters.
do $$
declare signature text; definition text; anchor text:=' or u.ban_until>now()';
begin
  foreach signature in array array['public.profile_chat_history(integer)',
    'public.profile_chat_history(integer,boolean)','public.profile_chat_history(integer,boolean,text)'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('suspended_chat_readonly_v1' in definition)>0 then continue;end if;
    if position(anchor in definition)=0 then raise exception 'La consulta de conversaciones cambió; revisar antes de habilitar lectura durante la suspensión.';end if;
    definition:=replace(definition,anchor,' /* suspended_chat_readonly_v1 */');
    execute definition;
  end loop;
  select pg_get_functiondef('public.notification_chat_context(uuid)'::regprocedure) into definition;
  if position('suspended_chat_readonly_v1' in definition)=0 then
    anchor:=$anchor$or (to_jsonb(u)->>'ban_until')::timestamptz>now()$anchor$;
    if position(anchor in definition)=0 then raise exception 'El contexto privado del chat cambió; revisar antes de habilitar lectura.';end if;
    execute replace(definition,anchor,'/* suspended_chat_readonly_v1 */');
  end if;
end $$;

-- guard_staff_suspension continues to reject INSERT/UPDATE on chat_messages.
notify pgrst,'reload schema';
commit;
