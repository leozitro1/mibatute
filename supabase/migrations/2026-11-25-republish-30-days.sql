begin;
alter table public.articulos add column if not exists publication_expires_at timestamptz;
create table if not exists public.publication_republications (
 article_id uuid primary key references public.articulos(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 republished_at timestamptz not null,
 expires_at timestamptz not null
);
alter table public.publication_republications enable row level security;
revoke all on public.publication_republications from public,anon,authenticated;

-- Reuse existing 60-day active/quota predicates with an equivalent deadline anchor.
-- This never changes the original article creation date or deletion-slot ledger.
create or replace function public.publication_activity_anchor(p_created timestamptz,p_expires timestamptz)
returns timestamptz language sql immutable set search_path='' as $$
 select coalesce(p_expires-interval '1440 hours',p_created);
$$;
revoke all on function public.publication_activity_anchor(timestamptz,timestamptz) from public;
grant execute on function public.publication_activity_anchor(timestamptz,timestamptz) to anon,authenticated;

create or replace function public.guard_publication_lifetime()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.publication_expires_at is not null then raise exception 'La vigencia la establece el servidor.' using errcode='42501';end if;
 elsif new.publication_expires_at is distinct from old.publication_expires_at then
  if not exists(select 1 from public.publication_republications r where r.article_id=new.id
   and r.owner_id=new.owner_id and r.expires_at=new.publication_expires_at) then
   raise exception 'Usa Republicar para renovar la publicación.' using errcode='42501';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_publication_lifetime() from public,anon,authenticated;
drop trigger if exists aaa_publication_lifetime on public.articulos;
create trigger aaa_publication_lifetime before insert or update on public.articulos for each row execute function public.guard_publication_lifetime();

create or replace function public.guard_publication_expiry()
returns trigger language plpgsql security definer set search_path='' as $$
declare new_state text:=lower(coalesce(nullif(new.estado,''),new.status,'disponible'));old_state text;
begin
 if tg_op='INSERT' then if auth.uid() is not null then new.created_at:=now();end if;return new;end if;
 if new.created_at is distinct from old.created_at then raise exception 'La fecha de creación de una publicación no puede cambiar.' using errcode='42501';end if;
 -- The first trigger already checked the private republication authorization.
 if new.publication_expires_at is distinct from old.publication_expires_at and new.publication_expires_at>now() then return new;end if;
 old_state:=lower(coalesce(nullif(old.estado,''),old.status,'disponible'));
 if coalesce(old.publication_expires_at,old.created_at+interval '1440 hours')<=now() then
  if (new_state in ('reservado','reserved') and old_state not in ('reservado','reserved'))
   or (new_state in ('disponible','available') and old_state not in ('disponible','available','reservado','reserved'))
   or (new.is_featured and not coalesce(old.is_featured,false)) then
   raise exception 'Esta publicación está vencida. Usa Republicar para renovarla.' using errcode='42501';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.guard_publication_expiry() from public,anon,authenticated;
drop trigger if exists publication_expiry on public.articulos;
create trigger publication_expiry before insert or update on public.articulos for each row execute function public.guard_publication_expiry();

-- Preserve current function definitions, permissions, query budgets and all other business rules.
do $migration$
declare fn record;definition text;patched text;
begin
 for fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'home_article_page','guard_expired_application','guard_publication_limit','guard_donation_publication_limit',
  'guard_publication_credit','record_publication_slot','publication_deletion_status','sale_publication_status',
  'sale_free_limit','my_seller_transition_notice','apply_for_donation','donation_application_status',
  'settle_donation_credits','market_catalog_signal','sanction_catalog_signal','record_market_metrics') loop
  definition:=pg_get_functiondef(fn.oid);
  patched:=regexp_replace(definition,
   '((?:public\.)?(?:sale|donation)_publication_active\([^()]+,[[:space:]]*)(a|new|old)\.created_at([[:space:]]*\))',
   '\1public.publication_activity_anchor(\2.created_at,\2.publication_expires_at)\3','g');
  patched:=regexp_replace(patched,
   '(a|new|old)\.created_at([[:space:]]*(?:>=|<=|>|<)[[:space:]]*now\(\)[[:space:]]*-[[:space:]]*interval[[:space:]]*''(?:1440 hours|60 days)'')',
   'public.publication_activity_anchor(\1.created_at,\1.publication_expires_at)\2','g');
  patched:=replace(patched,'Esta publicacion vencio despues de 60 dias y no acepta nuevas solicitudes.','Esta publicación está vencida y no acepta nuevas solicitudes.');
  if patched<>definition then execute patched;end if;
 end loop;
end $migration$;

create or replace function public.owner_republish_article(p_article_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();a public.articulos%rowtype;deadline timestamptz:=now()+interval '720 hours';active_count integer;
begin
 if uid is null or not exists(select 1 from auth.users u join public.usuarios p on p.id=u.id where u.id=uid
  and u.email_confirmed_at is not null and not coalesce(p.is_blocked,false) and not coalesce(p.bloqueado,false)
  and (p.ban_until is null or p.ban_until<=now())) then
  raise exception 'Debes tener una cuenta confirmada y habilitada.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
 select * into a from public.articulos where id=p_article_id and owner_id=uid for update;
 if not found then raise exception 'Solo puedes republicar tus publicaciones.' using errcode='42501';end if;
 if coalesce(a.publication_expires_at,a.created_at+interval '1440 hours')>now() then
  if exists(select 1 from public.publication_republications where article_id=a.id and owner_id=uid) then
   return jsonb_build_object('article',to_jsonb(a),'alreadyRepublished',true);end if;
  raise exception 'Esta publicación todavía está vigente.' using errcode='P0001';
 end if;
 if coalesce(nullif(a.estado,''),a.status) not in ('disponible','available','pausado','paused','vencido','expired')
  or a.buyer_id is not null or coalesce(a.ganador_id,a.winner_id,a.recipient_id) is not null
  or exists(select 1 from public.chats c where c.articulo_id=a.id and c.status in ('pending','open'))
  or exists(select 1 from jsonb_each_text(to_jsonb(a)) f where f.key in ('review_status','approval_status','moderation_status','revision_status')
   and lower(btrim(coalesce(f.value,''))) not in ('','approved','aprobado','none')) then
  raise exception 'Resuelve la reserva o revisión antes de republicar.' using errcode='P0001';
 end if;
 select count(*) into active_count from public.articulos x where x.owner_id=uid and x.id<>a.id
  and (public.sale_publication_active(x.mode,x.estado,x.status,public.publication_activity_anchor(x.created_at,x.publication_expires_at))
   or public.donation_publication_active(x.mode,x.estado,x.status,public.publication_activity_anchor(x.created_at,x.publication_expires_at)));
 if active_count>=20 then raise exception 'Puedes tener máximo 20 publicaciones activas.' using errcode='P0001';end if;
 insert into public.publication_republications values(a.id,uid,now(),deadline)
 on conflict(article_id) do update set republished_at=excluded.republished_at,expires_at=excluded.expires_at;
 update public.articulos set publication_expires_at=deadline,estado='disponible',status='disponible',is_featured=false,updated_at=now()
 where id=a.id returning * into a;
 return jsonb_build_object('article',to_jsonb(a),'alreadyRepublished',false);
end;
$$;
revoke all on function public.owner_republish_article(uuid) from public,anon;
grant execute on function public.owner_republish_article(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
