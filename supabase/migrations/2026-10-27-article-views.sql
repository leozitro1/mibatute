begin;
-- Separate statistics: counting a view never updates/rebroadcasts the article itself.
create table if not exists public.article_view_totals (
 article_id uuid primary key references public.articulos(id) on delete cascade,
 view_count bigint not null default 0 check(view_count>=0)
);
create table if not exists public.article_view_visitors (
 article_id uuid not null references public.articulos(id) on delete cascade,
 visitor_hash text not null,
 viewed_at timestamptz not null default now(),
 primary key(article_id,visitor_hash)
);
create index if not exists article_view_visitors_date on public.article_view_visitors(viewed_at);
alter table public.article_view_totals enable row level security;
alter table public.article_view_visitors enable row level security;
revoke all on public.article_view_totals,public.article_view_visitors from public,anon,authenticated;
grant select on public.article_view_totals to anon,authenticated;
drop policy if exists article_views_owner_staff on public.article_view_totals;
create policy article_views_owner_staff on public.article_view_totals for select to authenticated using (
 exists(select 1 from public.articulos a where a.id=article_id and auth.uid() in (a.owner_id,a.usuario_id)) or public.staff_permission('access')
);

create or replace function public.record_article_view(p_article uuid,p_session uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); article public.articulos%rowtype; viewer text; changed integer;
begin
 if p_session is null then return false;end if;
 if uid is not null and (exists(select 1 from public.staff_accounts where user_id=uid and role in ('admin','master'))
  or exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'role' in ('admin','master'))) then return false;end if;
 select * into article from public.articulos where id=p_article;
 if not found or (uid is not null and (uid=article.owner_id or uid=article.usuario_id))
  or coalesce(article.status,article.estado,'') not in ('disponible','available','reservado','reserved')
  or coalesce(to_jsonb(article)->>'review_status','') in ('pending','en_revision','reviewing') then return false;end if;
 viewer:=md5(case when uid is null then 'session:'||p_session::text else 'user:'||uid::text end);
 insert into public.article_view_visitors(article_id,visitor_hash) values(p_article,viewer)
 on conflict(article_id,visitor_hash) do update set viewed_at=now()
 where public.article_view_visitors.viewed_at<=now()-interval '24 hours';
 get diagnostics changed=row_count;
 if changed=0 then return false;end if;
 insert into public.article_view_totals(article_id,view_count) values(p_article,1)
 on conflict(article_id) do update set view_count=public.article_view_totals.view_count+1;
 -- Small occasional cleanup; no per-visitor profiles or permanent browsing history.
 if random()<0.01 then
  delete from public.article_view_visitors where (article_id,visitor_hash) in
   (select article_id,visitor_hash from public.article_view_visitors where viewed_at<now()-interval '2 days' order by viewed_at limit 200);
 end if;
 return true;
end $$;
revoke all on function public.record_article_view(uuid,uuid) from public;
grant execute on function public.record_article_view(uuid,uuid) to anon,authenticated;



-- Public detail fields only; private chat, contact and payment data stay excluded.
create or replace function public.staff_article_preview(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; content jsonb;
begin
  perform public.staff_require('access');
  if not (public.staff_permission('moderation') or public.staff_permission('reports')) then
    raise exception 'Acceso no autorizado.' using errcode='42501';
  end if;
  content:=public.staff_article_content(p_id);
  if content is null then raise exception 'La publicación ya no existe.';end if;
  select jsonb_build_object('id',a.id,'title',a.title,'description',a.description,'mode',a.mode,'price',a.price,
    'status',a.status,'estado',a.status,'review_status',a.review_status,'city',a.city,'locality',a.locality,
    'category',coalesce(a.category,a.categoria),'subcategory',coalesce(to_jsonb(a)->>'subcategory',to_jsonb(a)->>'subcategoria'),
    'estado_producto',to_jsonb(a)->'estado_producto','is_featured',to_jsonb(a)->'is_featured',
    'image_url',content->'images'->>0,'imagenes',content->'images','created_at',a.created_at,
    'article_view_totals',jsonb_build_object('view_count',coalesce((select view_count from public.article_view_totals where article_id=a.id),0)),
    'owner_id',a.owner_id,'owner_name',u.nombre,'owner_photo',u.foto_url,
    'owner_reputation',(select jsonb_build_object('promedio',coalesce(round(avg(r.estrellas),1),0),'total',count(*)) from public.reputacion r where r.reviewed_id=a.owner_id))
    into result from public.articulos a left join public.usuarios u on u.id=a.owner_id where a.id=p_id;
  return result;
end;
$$;
revoke all on function public.staff_article_preview(uuid) from public,anon;
grant execute on function public.staff_article_preview(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
