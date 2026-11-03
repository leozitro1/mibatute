begin;

-- Preserve the existing one/two-argument APIs; filter the same private page read.
create or replace function public.profile_chat_history(p_page integer,p_open_only boolean,p_kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Inicia sesión para consultar tus conversaciones.' using errcode='42501';end if;
 if p_open_only is null or p_kind is null or p_kind not in ('all','purchases','sales','donations') then raise exception 'Filtro no válido.';end if;
 if p_page is null or p_page not between 1 and 500 then raise exception 'Página no válida.';end if;
 if exists(select 1 from public.usuarios u where u.id=uid and (coalesce(u.is_blocked,false) or coalesce(u.bloqueado,false) or u.ban_until>now())) then
  raise exception 'Tu cuenta no puede acceder a las conversaciones.' using errcode='42501';
 end if;
 with page as (
  select c.id as chat_id,c.buyer_id,c.seller_id,c.status as chat_status,c.created_at,
   coalesce((to_jsonb(c)->>'last_message_at')::timestamptz,(to_jsonb(c)->>'updated_at')::timestamptz,c.created_at) as activity_at,
   a.id as article_id,a.title,a.mode,a.status as article_status,
   coalesce(a.imagen_url_principal,a.image_url,'') as image_url,
   coalesce(u.nombre,'Usuario de MiBatute') as other_name
  from public.chats c join public.articulos a on a.id=c.articulo_id
  left join public.usuarios_publicos u on u.id=case when c.buyer_id=uid then c.seller_id else c.buyer_id end
  where uid in (c.buyer_id,c.seller_id)
   and (not p_open_only or (c.status='open' and a.status not in ('entregado','delivered')))
   and (p_kind='all'
    or (p_kind='purchases' and a.mode='venta' and c.buyer_id=uid)
    or (p_kind='sales' and a.mode='venta' and c.seller_id=uid)
    or (p_kind='donations' and a.mode='donacion'))
  order by c.created_at desc,c.id desc limit 13 offset (p_page-1)*12
 ), numbered as (select *,row_number() over(order by created_at desc,chat_id desc) as position from page)
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(numbered)-'position' order by created_at desc,chat_id desc) filter(where position<=12),'[]'::jsonb),
  'hasMore',count(*)>12) into result from numbered;
 return result;
end $$;
revoke all on function public.profile_chat_history(integer,boolean,text) from public,anon,authenticated;
grant execute on function public.profile_chat_history(integer,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
