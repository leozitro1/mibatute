begin;

-- Effective pause: keep manual pauses, reservations, expiry and credit history intact.
-- now() restores availability after a temporary sanction without a cron or bulk writes.
create or replace function public.account_publications_paused(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.usuarios u where u.id=p_user_id
    and (coalesce(u.is_blocked,false) or coalesce(u.bloqueado,false) or u.ban_until>now()));
$$;
revoke all on function public.account_publications_paused(uuid) from public,anon,authenticated;
grant execute on function public.account_publications_paused(uuid) to anon,authenticated;

-- Filter before totals, search ranking, featured selection and pagination.
do $$
declare definition text; anchor text:=$anchor$where a.created_at > now() - interval '1440 hours'$anchor$;
begin
  select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
  if position('sanction_publication_pause_v1' in definition)>0 then return;end if;
  if position(anchor in definition)=0 then raise exception 'La consulta del catálogo cambió; revisar antes de pausar publicaciones por sanción.';end if;
  definition:=replace(definition,anchor,anchor||$filter$
      -- sanction_publication_pause_v1
      and not public.account_publications_paused(coalesce(a.owner_id,a.usuario_id))$filter$);
  execute definition;
end $$;

-- Old links and direct reads cannot bypass catalog filtering. Preserve owner/staff
-- access and current participants' existing transactions, subject to existing RLS.
drop policy if exists sanction_publication_visibility on public.articulos;
create policy sanction_publication_visibility on public.articulos as restrictive for select to anon,authenticated
using (not public.account_publications_paused(owner_id) or auth.uid()=owner_id
  or auth.uid() in (buyer_id,ganador_id,winner_id,recipient_id) or public.staff_permission('access'));

create or replace function public.guard_sanctioned_owner_request()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; blocked boolean; legacy_blocked boolean; until_date timestamptz;
begin
  if tg_table_name='articulos' then
    -- Existing reservations may still be cancelled or delivered. Only new
    -- publications/reservations/participant changes are blocked by this guard.
    if tg_op='UPDATE' then
      if new.owner_id is not distinct from old.owner_id and not (
        ((new.status in ('reservado','reserved') or new.estado in ('reservado','reserved'))
          and (old.status not in ('reservado','reserved') or old.estado not in ('reservado','reserved')))
        or (new.buyer_id is not null and new.buyer_id is distinct from old.buyer_id)
        or (new.ganador_id is not null and new.ganador_id is distinct from old.ganador_id)
        or (new.winner_id is not null and new.winner_id is distinct from old.winner_id)
        or (new.recipient_id is not null and new.recipient_id is distinct from old.recipient_id))
      then return new;end if;
    end if;
    owner:=new.owner_id;
  else
    if tg_table_name='chats' then
      if new.status='closed' then return new;end if;
      if tg_op='UPDATE' and new.articulo_id is not distinct from old.articulo_id
        and new.buyer_id is not distinct from old.buyer_id and old.status in ('open','pending') then return new;end if;
    end if;
    select a.owner_id into owner from public.articulos a where a.id=new.articulo_id;
  end if;
  -- Serialize with an administrator changing this account's sanction.
  select u.is_blocked,u.bloqueado,u.ban_until into blocked,legacy_blocked,until_date
    from public.usuarios u where u.id=owner for share;
  if coalesce(blocked,false) or coalesce(legacy_blocked,false) or until_date>now() then
    raise exception 'Esta publicación está pausada por una sanción de su propietario y no acepta solicitudes ni compras nuevas.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_sanctioned_owner_request() from public,anon,authenticated;
drop trigger if exists guard_sanctioned_owner_request on public.postulaciones;
create trigger guard_sanctioned_owner_request before insert or update on public.postulaciones
for each row execute function public.guard_sanctioned_owner_request();
drop trigger if exists guard_sanctioned_owner_request on public.articulos;
create trigger guard_sanctioned_owner_request before insert or update on public.articulos
for each row execute function public.guard_sanctioned_owner_request();
drop trigger if exists guard_sanctioned_owner_request on public.chats;
create trigger guard_sanctioned_owner_request before insert or update on public.chats
for each row execute function public.guard_sanctioned_owner_request();

-- One advisory signal per affected catalog topic, not one write per article.
create or replace function public.sanction_catalog_signal()
returns trigger language plpgsql security definer set search_path='' as $$
declare was_paused boolean; paused boolean; entry record;
begin
  was_paused:=coalesce(old.is_blocked,false) or coalesce(old.bloqueado,false) or coalesce(old.ban_until>now(),false);
  paused:=coalesce(new.is_blocked,false) or coalesce(new.bloqueado,false) or coalesce(new.ban_until>now(),false);
  if was_paused=paused then return new;end if;
  for entry in
    with articles as (select id,encode(convert_to(coalesce(city,''),'UTF8'),'hex') as city,
      encode(convert_to(lower(trim(coalesce(category,categoria,''))),'UTF8'),'hex') as category
      from public.articulos where owner_id=new.id and created_at>now()-interval '60 days'
        and coalesce(nullif(estado,''),status) in ('disponible','reservado','available','reserved')),
    topics as (select id,'mb:catalog:'||city||':all' as topic from articles
      union all select id,'mb:catalog:'||city||':'||category from articles)
    select topic,min(id::text) as id from topics group by topic
  loop
    perform realtime.send(jsonb_build_object('id',entry.id,'action','UPDATE','owner_state_changed',true),
      'catalog_changed',entry.topic,false);
  end loop;
  return new;
end;
$$;
revoke all on function public.sanction_catalog_signal() from public,anon,authenticated;
drop trigger if exists sanction_catalog_signal on public.usuarios;
create trigger sanction_catalog_signal after update of is_blocked,bloqueado,ban_until on public.usuarios
for each row execute function public.sanction_catalog_signal();

notify pgrst,'reload schema';
commit;
