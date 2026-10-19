begin;

-- Retain historical messages as written; enforce the shorter limit on new writes.
alter table public.support_messages drop constraint if exists support_messages_body_check;
alter table public.support_messages add constraint support_messages_body_check
  check (length(body) between 1 and 500) not valid;

create or replace function public.support_start_thread(p_request uuid,p_subject text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();previous public.support_threads%rowtype;deadline timestamptz;
  subject text:=btrim(coalesce(p_subject,''));body text:=btrim(coalesce(p_body,''));
begin
  if uid is null then raise exception 'Inicia sesión para contactar a MiBatute.' using errcode='42501';end if;
  if p_request is null or length(subject) not between 3 and 120 or length(body) not between 10 and 500 then
    raise exception 'Revisa el asunto (3–120 caracteres) y el mensaje (10–500 caracteres).';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2026101901));
  select * into previous from public.support_threads where id=p_request;
  if found then
    if previous.user_id is distinct from uid or previous.subject<>subject or not exists(
      select 1 from public.support_messages m where m.thread_id=p_request and m.request_id=p_request and m.body=btrim(p_body)) then raise exception 'Identificador de solicitud ya utilizado.';end if;
    return p_request;
  end if;
  select max(created_at)+interval '24 hours' into deadline from public.support_threads where user_id=uid;
  if deadline>clock_timestamp() then raise exception 'Puedes iniciar una nueva conversación cada 24 horas. Continúa en tu hilo existente.';end if;
  insert into public.support_threads(id,user_id,subject) values(p_request,uid,subject);
  perform public.support_write(p_request,p_request,body,false);
  return p_request;
end;
$$;

create or replace function public.support_reply(p_thread uuid,p_request uuid,p_body text,p_staff boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();thread public.support_threads%rowtype;previous public.support_messages%rowtype;
  body text:=btrim(coalesce(p_body,''));as_staff boolean:=coalesce(p_staff,false);
begin
  if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
  if as_staff then perform public.staff_require('access');end if;
  if p_request is null or length(body) not between 1 and 500 then raise exception 'Escribe un mensaje de hasta 500 caracteres.';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2026101901));
  select * into thread from public.support_threads where id=p_thread for update;
  if not found or (not as_staff and (thread.user_id is distinct from uid or thread.user_hidden_at is not null)) then raise exception 'Conversación no disponible.' using errcode='42501';end if;
  select * into previous from public.support_messages where request_id=p_request;
  if found then
    if previous.thread_id is distinct from p_thread or previous.sender_id is distinct from uid
      or previous.body is distinct from body or (previous.author_role<>'user') is distinct from as_staff then
      raise exception 'Identificador de solicitud ya utilizado.';end if;
    return previous.seq;
  end if;
  if not as_staff and thread.last_user_at>clock_timestamp()-interval '15 seconds' then
    raise exception 'Espera unos segundos antes de enviar otro mensaje.';end if;
  if (select count(*) from public.support_messages where thread_id=p_thread)>=500 then raise exception 'Este hilo llegó a su límite de mensajes. Inicia otra conversación cuando esté disponible.';end if;
  if thread.user_hidden_at is not null then raise exception 'El usuario eliminó esta conversación. Se conserva solo como historial.';end if;
  return public.support_write(p_thread,p_request,body,as_staff);
end;
$$;

notify pgrst,'reload schema';
commit;
