begin;

-- Reuse the receive-only private user topic and its restrictive RLS guards from
-- 2026-10-16-staff-inbox-signals.sql. No extra copies of chat bodies are stored.
create or replace function public.send_market_signal(p_user uuid,p_signal jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user is not null then
    perform realtime.send(p_signal,'market_signal','mb:inbox:user:'||p_user::text,true);
  end if;
end;
$$;
revoke all on function public.send_market_signal(uuid,jsonb) from public,anon,authenticated;

create or replace function public.market_article_snapshot(p_row jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row)
  where key=any(array['id','owner_id','usuario_id','title','titulo','description','mode','tipo','price',
    'city','locality','category','categoria','subcategory','subcategoria','estado_producto',
    'status','estado','buyer_id','ganador_id','winner_id','recipient_id','reserved_at','delivered_at',
    'created_at','updated_at','is_featured','image_url','imagen_url_principal','imagenes','interested_count']);
$$;
revoke all on function public.market_article_snapshot(jsonb) from public,anon,authenticated;

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
      'kind','message','message_id',new.id,'notice',notice));
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

drop trigger if exists zz_market_message on public.chat_messages;
create trigger zz_market_message after insert on public.chat_messages for each row execute function public.market_user_signal();
drop trigger if exists zz_market_application on public.postulaciones;
create trigger zz_market_application after insert or delete on public.postulaciones for each row execute function public.market_user_signal();
drop trigger if exists zz_market_activity on public.activity_notifications;
create trigger zz_market_activity after insert or update on public.activity_notifications for each row execute function public.market_user_signal();
drop trigger if exists zz_market_account on public.usuarios;
create trigger zz_market_account after update on public.usuarios for each row execute function public.market_user_signal();
drop trigger if exists zz_market_balance on public.cupos;
create trigger zz_market_balance after insert or update on public.cupos for each row execute function public.market_user_signal();
drop trigger if exists zz_market_chat on public.chats;
create trigger zz_market_chat after insert or update or delete on public.chats for each row execute function public.market_user_signal();
drop trigger if exists zz_market_article on public.articulos;
create trigger zz_market_article after insert or update or delete on public.articulos for each row execute function public.market_user_signal();

-- Public catalog topics carry only invalidation hints, never participant IDs,
-- chat contents or applicants. Browsers subscribe to ONE city/category topic.
create or replace function public.market_catalog_signal()
returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; prior jsonb; entry jsonb; city text; category text; topics text[]:='{}'; topic text;
begin
  if tg_op<>'DELETE' then r:=to_jsonb(new); end if;
  if tg_op<>'INSERT' then prior:=to_jsonb(old); end if;
  -- Counters, private participants and timestamps alone do not invalidate catalogs.
  if tg_op='UPDATE' and (public.market_article_snapshot(r)-array['updated_at','interested_count','buyer_id','ganador_id','winner_id','recipient_id','reserved_at'])
    = (public.market_article_snapshot(prior)-array['updated_at','interested_count','buyer_id','ganador_id','winner_id','recipient_id','reserved_at']) then return new; end if;
  for entry in select value from jsonb_array_elements(jsonb_build_array(prior,r)) where value<>'null'::jsonb loop
    if coalesce(entry->>'estado',entry->>'status','disponible') not in ('disponible','reservado','available','reserved')
      or (entry->>'created_at')::timestamptz<now()-interval '60 days' then continue; end if;
    city:=encode(convert_to(coalesce(entry->>'city',''),'UTF8'),'hex');
    category:=encode(convert_to(lower(trim(coalesce(entry->>'category',entry->>'categoria',''))),'UTF8'),'hex');
    topics:=topics||array['mb:catalog:'||city||':all','mb:catalog:'||city||':'||category];
  end loop;
  for topic in select distinct unnest(topics) loop
    perform realtime.send(jsonb_build_object('id',coalesce(r->>'id',prior->>'id'),'action',tg_op),
      'catalog_changed',topic,false);
  end loop;
  return null;
end;
$$;
revoke all on function public.market_catalog_signal() from public,anon,authenticated;
drop trigger if exists zz_market_catalog on public.articulos;
create trigger zz_market_catalog after insert or update or delete on public.articulos for each row execute function public.market_catalog_signal();

notify pgrst,'reload schema';
commit;
