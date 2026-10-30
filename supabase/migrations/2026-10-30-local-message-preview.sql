-- Reuse the existing recipient-only private signal. No additional query or event.
-- Keep preview text outside notice history and limit its size.
begin;

create or replace function public.market_user_signal()
returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; prior jsonb; a public.articulos%rowtype; c public.chats%rowtype;
  recipient uuid; member uuid; event_at timestamptz; signal jsonb; notice jsonb; state jsonb;
begin
  if tg_op='DELETE' then r:=to_jsonb(old); else r:=to_jsonb(new); end if;
  if tg_op='UPDATE' then prior:=to_jsonb(old); end if;
  event_at:=clock_timestamp();
  if tg_table_name='chat_messages' then
    select * into c from public.chats where id=new.chat_id;
    select * into a from public.articulos where id=c.articulo_id;
    recipient:=case when new.sender_id=c.buyer_id then c.seller_id
      when new.sender_id=c.seller_id then c.buyer_id else null end;
    if recipient is null then return new; end if;
    notice:=jsonb_build_object('id','chat-'||c.id::text,'type','chat','chat_id',c.id,
      'articulo_id',c.articulo_id,'buyer_id',c.buyer_id,'created_at',new.created_at,
      'title','Mensajes recibidos','subtitle',left(coalesce(nullif(a.title,''),'Artículo'),512),
      'thumb',left(coalesce(a.image_url,a.imagen_url_principal,''),2048));
    perform public.send_market_signal(recipient,jsonb_build_object('key','message:'||new.id::text,
      'kind','message','message_id',new.id,'notice',notice,
      'message_preview',left(coalesce(nullif(r->>'body',''),nullif(r->>'message',''),
        nullif(r->>'content',''),nullif(r->>'text',''),nullif(r->>'mensaje',''),''),240)));
  elsif tg_table_name='postulaciones' then
    select * into a from public.articulos where id=(r->>'articulo_id')::uuid;
    if a.id is null then return null; end if;
    notice:=jsonb_build_object('id','post-'||a.id::text,'type','postulacion','articulo_id',a.id,
      'created_at',r->'created_at','title','Solicitudes recibidas',
      'subtitle',left(coalesce(nullif(a.title,''),'Tu publicación'),512),
      'thumb',left(coalesce(a.image_url,a.imagen_url_principal,''),2048));
    perform public.send_market_signal(a.owner_id,jsonb_build_object('key','application:'||tg_op||':'||(r->>'id'),
      'kind','application','action',tg_op,'articulo_id',a.id,'interested_count',a.interested_count,
      'notice',case when tg_op='INSERT' then notice else null end));
  elsif tg_table_name='activity_notifications' then
    if new.type='rating_received' or (new.type='system_notice' and new.receipt_id is null) then return new; end if;
    if tg_op='UPDATE' and new.receipt_id is not distinct from old.receipt_id then return new; end if;
    notice:=r-'recipient_id';
    notice:=notice||jsonb_build_object('read',false,'unreadCount',1);
    perform public.send_market_signal(new.recipient_id,jsonb_build_object('key','activity:'||new.id,
      'kind','activity','notice',notice));
  elsif tg_table_name='usuarios' then
    state:=jsonb_build_object('id',new.id,'is_blocked',r->'is_blocked','bloqueado',r->'bloqueado','ban_until',r->'ban_until');
    if state= jsonb_build_object('id',old.id,'is_blocked',prior->'is_blocked','bloqueado',prior->'bloqueado','ban_until',prior->'ban_until') then return new; end if;
    perform public.send_market_signal(new.id,jsonb_build_object('key','account:'||new.id::text||':'||event_at::text,
      'kind','account','profile',state));
  elsif tg_table_name='cupos' then
    if tg_op='UPDATE' and new.saldo is not distinct from old.saldo then return new; end if;
    perform public.send_market_signal(new.usuario_id,jsonb_build_object('key','balance:'||new.usuario_id::text||':'||event_at::text,
      'kind','balance','saldo',new.saldo));
  elsif tg_table_name='chats' then
    state:=r-'updated_at'-'last_message_at';
    if tg_op='UPDATE' and state=prior-'updated_at'-'last_message_at' then return new; end if;
    for member in select distinct x from unnest(array[(r->>'buyer_id')::uuid,(r->>'seller_id')::uuid,
      (prior->>'buyer_id')::uuid,(prior->>'seller_id')::uuid]) x where x is not null loop
      perform public.send_market_signal(member,jsonb_build_object('key','chat:'||(r->>'id')||':'||event_at::text,
        'kind','chat','action',tg_op,'chat',r-'last_message_at'));
    end loop;
  elsif tg_table_name='articulos' then
    state:=public.market_article_snapshot(r);
    if tg_op='UPDATE' and state-'updated_at'-'interested_count'=public.market_article_snapshot(prior)-'updated_at'-'interested_count' then return new; end if;
    for member in select distinct x from unnest(array[(r->>'owner_id')::uuid,(r->>'buyer_id')::uuid,
      (r->>'ganador_id')::uuid,(r->>'winner_id')::uuid,(r->>'recipient_id')::uuid,
      (prior->>'buyer_id')::uuid,(prior->>'ganador_id')::uuid,(prior->>'winner_id')::uuid,(prior->>'recipient_id')::uuid]) x where x is not null loop
      perform public.send_market_signal(member,jsonb_build_object('key','article:'||(r->>'id')||':'||event_at::text,
        'kind','article','action',tg_op,'article',state));
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.market_user_signal() from public,anon,authenticated;

commit;
