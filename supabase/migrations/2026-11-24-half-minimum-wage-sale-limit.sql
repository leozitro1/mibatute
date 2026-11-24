begin;
-- Salario mensual oficial, sin auxilio de transporte. Decreto 159 de 2026.
create table if not exists public.market_minimum_wages (
 year integer primary key check(year>=2026),
 monthly_cop bigint not null check(monthly_cop>0),
 source_url text not null
);
alter table public.market_minimum_wages enable row level security;
revoke all on public.market_minimum_wages from public,anon,authenticated;
insert into public.market_minimum_wages values(2026,1750905,
 'https://apps.procuraduria.gov.co/normograma/compilacion/docs/decreto_0159_2026.htm')
on conflict(year) do nothing;

create or replace function public.sale_price_limit_cop(p_year integer default extract(year from now() at time zone 'America/Bogota')::integer)
returns bigint language sql stable security definer set search_path='' as $$
 select monthly_cop/2 from public.market_minimum_wages where year<=p_year order by year desc limit 1;
$$;
revoke all on function public.sale_price_limit_cop(integer) from public;
grant execute on function public.sale_price_limit_cop(integer) to anon,authenticated;

-- Patch only the old threshold in current RPC definitions; preserve permissions and other guards.
do $migration$
declare fn record;definition text;
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('publish_article_with_credit','owner_save_article_photo_order') loop
  definition:=pg_get_functiondef(fn.oid);
  definition:=replace(definition,'::numeric>500000','::numeric>public.sale_price_limit_cop()');
  definition:=replace(definition,'''El precio de venta debe estar entre 1 y 500000 COP.''',
    '''El precio de venta no puede superar medio salario mínimo mensual (% COP).'', public.sale_price_limit_cop()');
  definition:=replace(definition,'''El precio debe estar entre 1 y 500000 COP.''',
    '''El precio no puede superar medio salario mínimo mensual (% COP).'', public.sale_price_limit_cop()');
  if strpos(definition,'500000')>0 then raise exception 'La validación de precio cambió; revisar antes de migrar.';end if;
  execute definition;
 end loop;
end $migration$;

create or replace function public.guard_sale_price_limit()
returns trigger language plpgsql security definer set search_path='' as $$
declare max_price bigint:=public.sale_price_limit_cop();
begin
 if new.mode='venta' and (max_price is null or new.price is null or new.price<=0 or new.price>max_price or new.price::text in ('NaN','Infinity','-Infinity')) then
  raise exception 'El precio debe ser mayor a 0 y no superar medio salario mínimo mensual (% COP).',max_price using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_sale_price_limit() from public,anon,authenticated;
drop trigger if exists sale_price_limit on public.articulos;
create trigger sale_price_limit before insert or update of price,mode on public.articulos
for each row execute function public.guard_sale_price_limit();
notify pgrst,'reload schema';
commit;
