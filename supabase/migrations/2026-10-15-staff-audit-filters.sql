begin;

create or replace function public.staff_audit_label(p_action text,p_changes jsonb default '{}')
returns text language sql immutable set search_path='' as $$
  select case p_action
    when 'session.open' then 'Inicio de sesión'
    when 'session.close' then 'Cierre de sesión'
    when 'article.approve' then 'Publicación aprobada'
    when 'article.pause' then 'Publicación puesta en revisión'
    when 'article.delete' then 'Publicación eliminada'
    when 'article.edit' then 'Publicación corregida'
    when 'report.reviewing' then 'Reporte puesto en revisión'
    when 'report.review' then 'Reporte puesto en revisión'
    when 'report.approve' then 'Publicación aprobada desde un reporte'
    when 'report.approved' then 'Publicación aprobada desde un reporte'
    when 'report.view' then 'Consulta de un reporte'
    when 'report.delete' then 'Publicación eliminada desde un reporte'
    when 'report.resolve' then 'Reporte resuelto'
    when 'report.resolved' then 'Reporte resuelto'
    when 'report.dismiss' then 'Reporte descartado'
    when 'report.dismissed' then 'Reporte descartado'
    when 'chat_report.reviewing' then 'Reporte de chat puesto en revisión'
    when 'chat_report.review' then 'Reporte de chat puesto en revisión'
    when 'chat_report.approve' then 'Reporte de chat aprobado'
    when 'chat_report.approved' then 'Reporte de chat aprobado'
    when 'chat_report.delete' then 'Publicación eliminada desde un reporte de chat'
    when 'chat_report.resolve' then 'Reporte de chat resuelto'
    when 'chat_report.resolved' then 'Reporte de chat resuelto'
    when 'chat_report.dismiss' then 'Reporte de chat descartado'
    when 'chat_report.dismissed' then 'Reporte de chat descartado'
    when 'user.view' then 'Consulta de datos de un usuario'
    when 'user.suspend' then 'Usuario suspendido'
    when 'user.restore' then 'Usuario habilitado nuevamente'
    when 'user.credit_compensation' then 'Créditos de compensación entregados'
    when 'chat.audit' then 'Consulta del historial de un chat'
    when 'sponsor.pause' then 'Campaña pausada'
    when 'sponsor.activate' then 'Campaña activada'
    when 'sponsor.save' then case
      when not coalesce(p_changes ? 'before',false) then 'Campaña guardada'
      when p_changes#>>'{before,id}' is null then 'Campaña creada'
      when p_changes#>>'{before,activo}' is distinct from p_changes#>>'{after,activo}'
        then case when p_changes#>>'{after,activo}'='true' then 'Campaña activada' else 'Campaña pausada' end
      else 'Campaña editada' end
    when 'staff.add' then 'Cuenta del equipo incorporada'
    when 'staff.disable' then 'Cuenta del equipo desactivada'
    when 'staff.enable' then 'Cuenta del equipo activada'
    when 'staff.permissions' then 'Permisos del equipo modificados'
    when 'staff.sponsors_restricted' then 'Acceso a patrocinadores restringido'
    else 'Otra acción administrativa' end;
$$;
create or replace function public.staff_audit_group(p_action text)
returns text language sql immutable set search_path='' as $$
  select case when p_action='user.credit_compensation' then 'credits'
    else case split_part(p_action,'.',1) when 'session' then 'sessions' when 'article' then 'articles'
      when 'report' then 'reports' when 'chat_report' then 'reports' when 'user' then 'users'
      when 'chat' then 'chats' when 'sponsor' then 'campaigns' when 'staff' then 'team' else 'other' end end;
$$;
revoke all on function public.staff_audit_label(text,jsonb),public.staff_audit_group(text) from public,anon,authenticated;

create or replace function public.staff_audit_entries(p_search text default '',p_page integer default 1,p_group text default '',p_days integer default 0,p_actor text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;term text:=translate(lower(left(trim(coalesce(p_search,'')),100)),'áéíóúüñ','aeiouun');since timestamptz;view_all boolean;actor uuid:=auth.uid();selected_actor uuid;members jsonb:='[]';
begin
  perform public.staff_require('access');
  view_all:=public.staff_permission('team');
  if p_group is null or p_group not in ('','sessions','articles','reports','users','credits','chats','campaigns','team','other')
    or p_days is null or p_days not in (0,1,7,30,90) or p_actor is null
    or (p_actor not in ('','me','system') and p_actor!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Filtros de auditoria no validos.'; end if;
  if p_actor not in ('','me','system') then
    if not view_all then raise exception using errcode='42501',message='Acceso no autorizado.'; end if;
    selected_actor:=p_actor::uuid;
  end if;
  if view_all then
    select coalesce(jsonb_agg(to_jsonb(m) order by lower(m.name),m.email,m.id),'[]') into members from(
      select ids.id,coalesce(nullif(u.nombre,''),nullif(au.email,''),'Cuenta retirada') as name,
        coalesce(au.email,'') as email,s.role,s.active,(s.user_id is null) as retired
      from(select user_id as id from public.staff_accounts union select actor_id from public.staff_audit where actor_id is not null) ids
      left join public.staff_accounts s on s.user_id=ids.id left join public.usuarios u on u.id=ids.id left join auth.users au on au.id=ids.id
    )m;
  end if;
  if p_days>0 then since:=(date_trunc('day',now() at time zone 'America/Bogota')-make_interval(days=>p_days-1)) at time zone 'America/Bogota'; end if;
  with visible as(
    select a.id,a.actor_id,coalesce(nullif(u.nombre,''),nullif(au.email,''),case when a.actor_id is null then 'Sistema' else 'Cuenta retirada' end) as actor_name,
      case when view_all then au.email else null end as actor_email,
      a.action,public.staff_audit_label(a.action,a.changes) as action_label,public.staff_audit_group(a.action) as action_group,a.target_id,a.reason,a.created_at
    from public.staff_audit a left join public.usuarios u on u.id=a.actor_id left join auth.users au on au.id=a.actor_id
    where (view_all or a.actor_id=actor) and (since is null or a.created_at>=since)
      and (p_actor='' or (p_actor='me' and a.actor_id=actor) or (p_actor='system' and a.actor_id is null) or a.actor_id=selected_actor)),
  filtered as materialized(select * from visible where (p_group='' or action_group=p_group)
    and position(term in translate(lower(action_label||' '||action||' '||reason||' '||actor_name||' '||coalesce(actor_email,'')||' '||coalesce(actor_id::text,'')),'áéíóúüñ','aeiouun'))>0),
  totals as(select count(*)::integer as total from filtered),
  pagination as(select total,least(greatest(1,coalesce(p_page,1)),greatest(1,ceil(total/20.0)::integer)) as page,greatest(1,ceil(total/20.0)::integer) as pages from totals),
  paged as(select * from filtered order by created_at desc,id desc limit 20 offset(select (page-1)*20 from pagination))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from paged p),'[]'),
    'total',total,'page',page,'pageCount',pages,'members',members) into result from pagination;
  return result;
end;
$$;
revoke all on function public.staff_audit_entries(text,integer,text,integer,text) from public,anon;
grant execute on function public.staff_audit_entries(text,integer,text,integer,text) to authenticated;

notify pgrst,'reload schema';
commit;
