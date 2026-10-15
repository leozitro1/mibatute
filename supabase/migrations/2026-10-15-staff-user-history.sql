begin;

-- Publication deletion must not erase a surviving account's moderation history.
create table if not exists public.staff_publication_history (
  article_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',mode text,status text,
  city text,locality text,created_at timestamptz not null,
  featured_ever boolean not null default false,
  delivered_ever boolean not null default false,
  deleted_at timestamptz,recorded_at timestamptz not null default now()
);
create index if not exists staff_publication_owner_idx on public.staff_publication_history(owner_id,created_at desc,article_id);
create index if not exists staff_publication_recorded_idx on public.staff_publication_history(recorded_at);
create index if not exists staff_user_location_idx on public.usuarios(ciudad,localidad,created_at desc,id);
create table if not exists public.staff_publication_reports (
  kind text not null check(kind in ('article','chat')),report_id uuid not null,
  article_id uuid not null references public.staff_publication_history(article_id) on delete cascade,
  status text,reason text,created_at timestamptz not null,primary key(kind,report_id)
);
create index if not exists staff_publication_reports_article_idx on public.staff_publication_reports(article_id);
create table if not exists public.staff_rating_history (
  rating_id uuid primary key,reviewed_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid,stars integer not null check(stars between 0 and 5),created_at timestamptz not null
);
create index if not exists staff_rating_user_idx on public.staff_rating_history(reviewed_id);
alter table public.staff_publication_history enable row level security;
alter table public.staff_publication_reports enable row level security;
alter table public.staff_rating_history enable row level security;
revoke all on public.staff_publication_history,public.staff_publication_reports,public.staff_rating_history from anon,authenticated;
grant all on public.staff_publication_history,public.staff_publication_reports,public.staff_rating_history to service_role;

create or replace function public.staff_record_publication()
returns trigger language plpgsql security definer set search_path='' as $$
declare item public.articulos%rowtype;
begin
  if tg_op='UPDATE' then
    if row(old.title,old.mode,old.status,old.city,old.locality,old.is_featured) is not distinct from
       row(new.title,new.mode,new.status,new.city,new.locality,new.is_featured) then return new; end if;
  end if;
  if tg_op='DELETE' then item:=old; else item:=new; end if;
  -- Auth account deletion intentionally removes its administrative history too.
  if not exists(select 1 from auth.users where id=item.owner_id) then return item; end if;
  insert into public.staff_publication_history(article_id,owner_id,title,mode,status,city,locality,created_at,featured_ever,delivered_ever,deleted_at)
    values(item.id,item.owner_id,coalesce(item.title,''),item.mode,item.status,item.city,item.locality,item.created_at,
      coalesce(item.is_featured,false),item.status='entregado',case when tg_op='DELETE' then now() end)
  on conflict(article_id) do update set title=excluded.title,mode=excluded.mode,status=excluded.status,
    city=excluded.city,locality=excluded.locality,
    featured_ever=public.staff_publication_history.featured_ever or excluded.featured_ever,
    delivered_ever=public.staff_publication_history.delivered_ever or excluded.delivered_ever,
    deleted_at=coalesce(public.staff_publication_history.deleted_at,excluded.deleted_at);
  return item;
end;
$$;
revoke all on function public.staff_record_publication() from public,anon,authenticated;
drop trigger if exists staff_record_publication on public.articulos;
create trigger staff_record_publication after insert or update or delete on public.articulos
  for each row execute function public.staff_record_publication();
insert into public.staff_publication_history(article_id,owner_id,title,mode,status,city,locality,created_at,featured_ever,delivered_ever)
  select id,owner_id,coalesce(title,''),mode,status,city,locality,created_at,coalesce(is_featured,false),status='entregado' from public.articulos
  on conflict(article_id) do nothing;

create or replace function public.staff_record_report()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  if exists(select 1 from public.staff_publication_history where article_id=new.articulo_id) then
    insert into public.staff_publication_reports(kind,report_id,article_id,status,reason,created_at)
      values(case when tg_table_name='reports' then 'article' else 'chat' end,new.id,new.articulo_id,new.status,new.reason,new.created_at)
      on conflict(kind,report_id) do update set status=excluded.status;
  end if;
  return new;
end;
$$;
revoke all on function public.staff_record_report() from public,anon,authenticated;
drop trigger if exists staff_record_report on public.reports;
create trigger staff_record_report after insert or update on public.reports for each row execute function public.staff_record_report();
drop trigger if exists staff_record_report on public.chat_reports;
create trigger staff_record_report after insert or update on public.chat_reports for each row execute function public.staff_record_report();
insert into public.staff_publication_reports(kind,report_id,article_id,status,reason,created_at)
  select 'article',r.id,r.articulo_id,r.status,r.reason,r.created_at from public.reports r join public.staff_publication_history h on h.article_id=r.articulo_id
  union all select 'chat',r.id,r.articulo_id,r.status,r.reason,r.created_at from public.chat_reports r join public.staff_publication_history h on h.article_id=r.articulo_id
  on conflict(kind,report_id) do nothing;

create or replace function public.staff_record_rating()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.reviewed_id is null then return new; end if;
  insert into public.staff_rating_history(rating_id,reviewed_id,article_id,stars,created_at)
    values(new.id,new.reviewed_id,new.articulo_id,new.estrellas,new.created_at)
    on conflict(rating_id) do update set stars=excluded.stars;
  return new;
end;
$$;
revoke all on function public.staff_record_rating() from public,anon,authenticated;
drop trigger if exists staff_record_rating on public.reputacion;
create trigger staff_record_rating after insert or update on public.reputacion for each row execute function public.staff_record_rating();
insert into public.staff_rating_history(rating_id,reviewed_id,article_id,stars,created_at)
  select id,reviewed_id,articulo_id,estrellas,created_at from public.reputacion where reviewed_id is not null on conflict(rating_id) do nothing;

create or replace function public.staff_user_stats(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('created',count(*),
    'active',count(*) filter(where deleted_at is null and status='disponible' and created_at>now()-interval '60 days'),
    'reserved',count(*) filter(where deleted_at is null and status='reservado'),
    'reviewing',count(*) filter(where deleted_at is null and status in ('en_revision','pausado')),
    'delivered',count(*) filter(where delivered_ever),
    'deleted',count(*) filter(where deleted_at is not null),
    'featured',count(*) filter(where featured_ever),
    'reported',count(*) filter(where exists(select 1 from public.staff_publication_reports r where r.article_id=h.article_id)),
    'rating',(select round(avg(stars),2) from public.staff_rating_history where reviewed_id=p_id),
    'rating_count',(select count(*) from public.staff_rating_history where reviewed_id=p_id))
  from public.staff_publication_history h where owner_id=p_id;
$$;
revoke all on function public.staff_user_stats(uuid) from public,anon,authenticated;

create or replace function public.staff_user_detail(p_id uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile jsonb;stats jsonb;rows jsonb;total integer;page integer:=greatest(1,coalesce(p_page,1));
begin
  perform public.staff_require('users');
  select jsonb_build_object('id',u.id,'nombre',u.nombre,'foto_url',u.foto_url,
    'email',coalesce(nullif(u.email,''),a.email),'movil',u.movil,'direccion',u.direccion,'ciudad',u.ciudad,'localidad',u.localidad,
    'created_at',u.created_at,'last_sign_in_at',to_jsonb(a)->'last_sign_in_at','email_confirmed_at',a.email_confirmed_at,
    'is_blocked',u.is_blocked or u.bloqueado,'ban_until',u.ban_until,
    'account_state',case when u.is_blocked or u.bloqueado then 'blocked' when u.ban_until>now() then 'suspended' else 'active' end,
    'credits',coalesce((select saldo from public.cupos where usuario_id=u.id),0),
    'staff_role',(select role from public.staff_accounts where user_id=u.id and active)) into profile
    from public.usuarios u join auth.users a on a.id=u.id where u.id=p_id;
  if profile is null then raise exception 'El usuario ya no existe.'; end if;
  stats:=public.staff_user_stats(p_id);total:=(stats->>'created')::integer;
  page:=least(page,greatest(1,ceil(total/20.0)::integer));
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
    select h.article_id,h.title,h.mode,h.status,h.created_at,h.featured_ever,h.delivered_ever,h.deleted_at,
      (select count(*) from public.staff_publication_reports where article_id=h.article_id) as report_count
    from public.staff_publication_history h where owner_id=p_id order by created_at desc,article_id limit 20 offset(page-1)*20
  )r;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'user.view',p_id,'Consulta de ficha administrativa de usuario',jsonb_build_object('page',page));
  return jsonb_build_object('profile',profile,'stats',stats,'rows',rows,'total',total,'page',page,'pageCount',greatest(1,ceil(total/20.0)::integer),
    'history_since',(select min(recorded_at) from public.staff_publication_history));
end;
$$;
revoke all on function public.staff_user_detail(uuid,integer) from public,anon;
grant execute on function public.staff_user_detail(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
