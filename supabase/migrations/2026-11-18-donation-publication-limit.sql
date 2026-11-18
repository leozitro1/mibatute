begin;

-- Same lifetime as sales: paused/reviewed items count; reservations do not expire.
create or replace function public.donation_publication_active(p_mode text,p_estado text,p_status text,p_created timestamptz)
returns boolean language sql stable set search_path='' as $$
 select p_mode='donacion' and public.sale_publication_active('venta',p_estado,p_status,p_created);
$$;
revoke all on function public.donation_publication_active(text,text,text,timestamptz) from public,anon,authenticated;

create or replace function public.guard_donation_publication_limit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.mode is distinct from 'donacion' then return new; end if;
 if coalesce(new.price,0)<>0 then
  raise exception 'Una donación debe ser gratuita. Si esperas un pago, publícala como venta.' using errcode='P0001';
 end if;
 if not public.donation_publication_active(new.mode,new.estado,new.status,new.created_at) then return new; end if;
 -- Existing publications remain editable, including accounts previously above the limit.
 if tg_op='UPDATE' then
  if old.owner_id=new.owner_id and public.donation_publication_active(old.mode,old.estado,old.status,old.created_at) then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,1313));
 if (select count(*) from public.articulos a where a.owner_id=new.owner_id and a.id is distinct from new.id
  and public.donation_publication_active(a.mode,a.estado,a.status,a.created_at))>=3 then
  raise exception 'Puedes tener máximo 3 donaciones activas. Entrega, elimina o espera al vencimiento de una para publicar otra. Las pausadas y reservadas también cuentan.' using errcode='P0001';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_donation_publication_limit() from public,anon,authenticated;
drop trigger if exists donation_publication_limit on public.articulos;
create trigger donation_publication_limit before insert or update on public.articulos
for each row execute function public.guard_donation_publication_limit();

create or replace function public.sale_publication_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();active_count integer;balance integer;free_limit integer;donation_count integer;
begin
 if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501';end if;
 select count(*) into active_count from public.articulos a where a.owner_id=uid
  and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at);
 select count(*) into donation_count from public.articulos a where a.owner_id=uid
  and public.donation_publication_active(a.mode,a.estado,a.status,a.created_at);
 free_limit:=public.sale_free_limit(uid);
 select saldo into balance from public.cupos where usuario_id=uid;
 return jsonb_build_object('active',active_count,'freeLimit',free_limit,'donationBonus',free_limit=4,
  'freeRemaining',greatest(0,free_limit-active_count),'requiresCredit',active_count>=free_limit,'balance',coalesce(balance,0),
  'donationActive',donation_count,'donationLimit',3,'donationRemaining',greatest(0,3-donation_count));
end $$;
revoke all on function public.sale_publication_status() from public,anon;
grant execute on function public.sale_publication_status() to authenticated;
commit;
