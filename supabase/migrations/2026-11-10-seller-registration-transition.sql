begin;

alter table public.seller_registration_settings add column if not exists visibility_starts_at timestamptz;

-- A null date leaves existing offers visible. This schema is not exposed through the Data API.
create schema if not exists seller_transition;
revoke all on schema seller_transition from public,anon,authenticated;
grant usage on schema seller_transition to anon,authenticated,service_role;

create or replace function seller_transition.offer_paused(p_mode text,p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when p_mode is distinct from 'venta' then false else
    exists(select 1 from public.seller_registration_settings where enabled and visibility_starts_at<=now())
    and not exists(select 1 from public.seller_registrations where user_id=p_owner and consent_version='seller-2026-11-10.1')
  end;
$$;
revoke all on function seller_transition.offer_paused(text,uuid) from public,anon,authenticated;
grant execute on function seller_transition.offer_paused(text,uuid) to anon,authenticated,service_role;

-- Exclude even the seller's own paused offers from catalog results, before counting and paging.
do $$
declare definition text; anchor text:=$anchor$where a.created_at > now() - interval '1440 hours'$anchor$;
begin
  select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
  if position('seller_registration_visibility_v1' in definition)>0 then return; end if;
  if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then
    raise exception 'La consulta del catálogo cambió; revisar antes de aplicar la pausa.';
  end if;
  execute replace(definition,anchor,anchor||$filter$
      -- seller_registration_visibility_v1
      and not seller_transition.offer_paused(a.mode,coalesce(a.owner_id,a.usuario_id))$filter$);
end $$;

-- Owners and existing participants retain their access, subject to all previous policies.
drop policy if exists seller_registration_visibility on public.articulos;
create policy seller_registration_visibility on public.articulos as restrictive for select to anon,authenticated
using (not seller_transition.offer_paused(mode,coalesce(owner_id,usuario_id)) or auth.uid()=coalesce(owner_id,usuario_id)
  or auth.uid() in (buyer_id,comprador_id) or public.staff_permission('access'));

create or replace function seller_transition.guard_new_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.buyer_id is not null and new.buyer_id is distinct from old.buyer_id)
    or (new.comprador_id is not null and new.comprador_id is distinct from old.comprador_id)
    or (coalesce(nullif(new.estado,''),new.status,'') in ('reservado','reserved')
      and coalesce(nullif(old.estado,''),old.status,'') not in ('reservado','reserved')) then
    if seller_transition.offer_paused(new.mode,coalesce(new.owner_id,new.usuario_id)) then
      raise exception 'Esta venta no está disponible para nuevas reservas.' using errcode='P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function seller_transition.guard_new_reservation() from public,anon,authenticated;
drop trigger if exists guard_seller_transition_reservation on public.articulos;
create trigger guard_seller_transition_reservation before update of buyer_id,comprador_id,estado,status on public.articulos
  for each row execute function seller_transition.guard_new_reservation();

create or replace function public.my_seller_transition_notice()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('startsAt',s.visibility_starts_at,
    'state',case when s.visibility_starts_at<=now() then 'paused' else 'upcoming' end)
  from public.seller_registration_settings s
  where s.enabled and s.visibility_starts_at is not null and auth.uid() is not null
    and not exists(select 1 from public.seller_registrations where user_id=auth.uid() and consent_version='seller-2026-11-10.1')
    and exists(select 1 from public.articulos a where coalesce(a.owner_id,a.usuario_id)=auth.uid()
      and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at));
$$;
revoke all on function public.my_seller_transition_notice() from public,anon,authenticated;
grant execute on function public.my_seller_transition_notice() to authenticated;

notify pgrst,'reload schema';
commit;
