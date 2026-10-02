begin;

alter table public.reports add column if not exists handled_at timestamptz;
alter table public.reports add column if not exists handled_by_user_id uuid references auth.users(id) on delete set null;

create or replace view public.admin_reports_view with (security_invoker = true) as
select
  r.id as report_id,
  r.created_at as report_created_at,
  r.status,
  r.reason,
  r.details,
  r.resolution,
  r.articulo_id,
  r.reporter_user_id,
  r.reported_user_id,
  a.owner_id,
  a.title as articulo_title,
  a.titulo as articulo_titulo,
  a.estado as articulo_estado,
  a.status as articulo_status,
  a.image_url,
  a.imagen_url_principal,
  count(*) over (partition by r.articulo_id) as report_total,
  count(*) filter (where r.status = 'open') over (partition by r.articulo_id) as report_open,
  count(*) filter (where r.status = 'reviewing') over (partition by r.articulo_id) as report_reviewing,
  count(*) filter (where r.status = 'resolved') over (partition by r.articulo_id) as report_resolved,
  count(*) filter (where r.status = 'dismissed') over (partition by r.articulo_id) as report_dismissed,
  max(r.created_at) over (partition by r.articulo_id) as last_report_at,
  'articulo'::text as target_type,
  r.articulo_id as target_id,
  r.handled_by_user_id,
  r.handled_at,
  a.city,
  a.locality,
  u.nombre as owner_nombre,
  u.foto_url as owner_foto_url,
  coalesce(nullif(a.image_url, ''), a.imagen_url_principal) as articulo_thumb
from public.reports r
left join public.articulos a on a.id = r.articulo_id
left join public.usuarios u on u.id = a.owner_id;

notify pgrst, 'reload schema';
commit;
