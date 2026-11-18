-- Inventario agregado. Requiere la migración del registro; no cambia anuncios ni muestra identificadores.
begin read only;
with pendientes as (
  select a.owner_id, coalesce(nullif(a.estado,''),nullif(a.status,''),'sin_estado') as estado
  from public.articulos a
  where a.mode='venta' and a.owner_id is not null
    and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at)
    and not exists (
      select 1 from public.seller_registrations s
      where s.user_id=a.owner_id and s.consent_version='seller-2026-11-10.1'
    )
)
select case when grouping(estado)=1 then 'TOTAL' else estado end as estado,
       count(*) as ofertas, count(distinct owner_id) as vendedores
from pendientes
group by grouping sets ((),(estado))
order by grouping(estado) desc,estado;
commit;
