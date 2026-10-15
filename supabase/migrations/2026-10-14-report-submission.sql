begin;

create index if not exists reports_reporter_recent_idx on public.reports(reporter_user_id,created_at desc);
create index if not exists chat_reports_reporter_recent_idx on public.chat_reports(reporter_id,created_at desc);

create or replace function public.require_report_sender()
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Debes iniciar sesion para reportar.' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Verifica tu correo antes de reportar.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report:'||uid::text,0));
  return uid;
end;
$$;
create or replace function public.check_report_rate(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
  select (select count(*) from public.reports where reporter_user_id=p_uid and created_at>now()-interval '1 hour')
    +(select count(*) from public.chat_reports where reporter_id=p_uid and created_at>now()-interval '1 hour') into amount;
  if amount>=10 then raise exception 'Ya enviaste varios reportes. Espera una hora antes de enviar otro.'; end if;
end;
$$;

create or replace function public.submit_article_report(p_article uuid,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_report_sender(); owner uuid; report_id uuid;
  reason text:=trim(coalesce(p_reason,'')); details text:=trim(coalesce(p_details,''));
begin
  if reason not in ('Contenido prohibido','Fraude / estafa','Venta de producto ilegal','Lenguaje ofensivo','Spam','Otro')
    or length(details)>400 then raise exception 'El motivo o detalle del reporte no es valido.'; end if;
  select owner_id into owner from public.articulos where id=p_article for share;
  if not found then raise exception 'La publicacion ya no existe.'; end if;
  if owner=uid then raise exception 'No puedes reportar tu propia publicacion.' using errcode='42501'; end if;
  select id into report_id from public.reports where articulo_id=p_article and reporter_user_id=uid and status in ('open','reviewing') order by created_at desc limit 1;
  if report_id is not null then return jsonb_build_object('id',report_id,'alreadyExists',true); end if;
  perform public.check_report_rate(uid);
  insert into public.reports(articulo_id,reporter_user_id,reported_user_id,owner_id,reason,details,status)
    values(p_article,uid,owner,owner,reason,nullif(details,''),'open') returning id into report_id;
  return jsonb_build_object('id',report_id,'alreadyExists',false);
end;
$$;

create or replace function public.submit_chat_report(p_chat uuid,p_reason text,p_details text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_report_sender(); chat public.chats%rowtype; peer uuid; report_id uuid; evidence jsonb;
  reason text:=trim(coalesce(p_reason,'')); details text:=trim(coalesce(p_details,''));
begin
  if reason not in ('acoso','estafa','ofensivo','spam','otro') or length(details) not between 5 and 1000 then
    raise exception 'Selecciona un motivo y escribe un detalle de 5 a 1000 caracteres.';
  end if;
  select * into chat from public.chats where id=p_chat for share;
  if not found or uid not in (chat.buyer_id,chat.seller_id) or chat.buyer_id is null or chat.seller_id is null then
    raise exception 'Solo los participantes pueden reportar esta conversacion.' using errcode='42501';
  end if;
  peer:=case when uid=chat.buyer_id then chat.seller_id else chat.buyer_id end;
  if peer=uid then raise exception 'No puedes reportarte a ti mismo.' using errcode='42501'; end if;
  select id into report_id from public.chat_reports where chat_id=p_chat and reporter_id=uid and status in ('open','reviewing') order by created_at desc limit 1;
  if report_id is not null then return jsonb_build_object('id',report_id,'alreadyExists',true); end if;
  perform public.check_report_rate(uid);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at,r.id),'[]') into evidence from (
    select m.id,m.created_at,m.sender_id,(select nombre from public.usuarios where id=m.sender_id) as sender_name,
      coalesce(nullif(to_jsonb(m)->>'body',''),nullif(to_jsonb(m)->>'message',''),nullif(to_jsonb(m)->>'content',''),nullif(to_jsonb(m)->>'text',''),nullif(to_jsonb(m)->>'mensaje',''),'') as body
    from public.chat_messages m where chat_id=p_chat order by created_at desc,id desc limit 20) r;
  insert into public.chat_reports(chat_id,articulo_id,reporter_id,reported_user_id,reason,details,messages_snapshot,status)
    values(p_chat,chat.articulo_id,uid,peer,reason,details,evidence,'open') returning id into report_id;
  return jsonb_build_object('id',report_id,'alreadyExists',false);
end;
$$;

create or replace function public.staff_report_detail(p_id uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report jsonb; result jsonb; article_title text; reporter uuid;
begin
  perform public.staff_require('reports');
  if p_kind='article' then select to_jsonb(r) into report from public.reports r where id=p_id;
  elsif p_kind='chat' then select to_jsonb(r) into report from public.chat_reports r where id=p_id;
  else raise exception 'Tipo de reporte no valido.'; end if;
  if report is null then raise exception 'El reporte ya no existe.'; end if;
  reporter:=coalesce((report->>'reporter_user_id')::uuid,(report->>'reporter_id')::uuid);
  select title into article_title from public.articulos where id=(report->>'articulo_id')::uuid;
  result:=jsonb_build_object('id',p_id,'kind',p_kind,'article_title',article_title,'articulo_id',report->'articulo_id',
    'reason',report->'reason','details',report->'details','status',report->'status','created_at',report->'created_at',
    'resolution',report->'resolution','handled_at',report->'handled_at',
    'reporter_name',(select nombre from public.usuarios where id=reporter),
    'reported_name',(select nombre from public.usuarios where id=(report->>'reported_user_id')::uuid),
    'messages_snapshot',case when p_kind='chat' then coalesce(report->'messages_snapshot','[]') else '[]'::jsonb end);
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'report.view',p_id,'Revision de un reporte recibido',jsonb_build_object('kind',p_kind));
  return result;
end;
$$;

revoke insert on public.reports,public.chat_reports from anon,authenticated;
drop policy if exists "Crear reportes autenticados" on public.reports;
drop policy if exists "Crear chat reports autenticados" on public.chat_reports;
drop policy if exists staff_reports_read on public.reports;
drop policy if exists staff_chat_reports_read on public.chat_reports;
create policy staff_reports_read on public.reports for select using(auth.uid()=reporter_user_id or public.staff_permission('reports'));
create policy staff_chat_reports_read on public.chat_reports for select using(auth.uid()=reporter_id or public.staff_permission('reports'));
revoke all on function public.require_report_sender(),public.check_report_rate(uuid) from public,anon,authenticated;
revoke all on function public.submit_article_report(uuid,text,text),public.submit_chat_report(uuid,text,text),public.staff_report_detail(uuid,text) from public,anon;
grant execute on function public.submit_article_report(uuid,text,text),public.submit_chat_report(uuid,text,text),public.staff_report_detail(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
