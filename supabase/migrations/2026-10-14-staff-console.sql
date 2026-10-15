begin;

alter table public.chat_reports add column if not exists resolution text default '';
alter table public.chat_reports add column if not exists handled_at timestamptz;
alter table public.chat_reports add column if not exists handled_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','master')),
  active boolean not null default true,
  permissions text[] not null default array['moderation','reports','users'],
  created_at timestamptz not null default now()
);
create table if not exists public.staff_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.staff_accounts(user_id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '8 hours',
  revoked_at timestamptz
);
create table if not exists public.staff_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid,
  action text not null, target_id uuid, reason text not null,
  changes jsonb not null default '{}',created_at timestamptz not null default now()
);
create index if not exists staff_audit_date_idx on public.staff_audit(created_at desc);
create index if not exists staff_audit_actor_date_idx on public.staff_audit(actor_id,created_at desc);
-- Preserve the actor identifier even if its Auth account is later removed.
alter table public.staff_audit drop constraint if exists staff_audit_actor_id_fkey;
create index if not exists staff_sessions_user_idx on public.staff_sessions(user_id);
alter table public.staff_accounts enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.staff_audit enable row level security;
revoke all on public.staff_accounts,public.staff_sessions,public.staff_audit from anon,authenticated;
grant all on public.staff_accounts,public.staff_sessions,public.staff_audit to service_role;

-- Import only roles assigned through the Auth admin API, never editable profile metadata.
insert into public.staff_accounts(user_id,role)
select id,raw_app_meta_data->>'role' from auth.users where raw_app_meta_data->>'role' in ('admin','master')
on conflict(user_id) do nothing;

create or replace function public.staff_permission(p_permission text default 'access')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); claims jsonb:=auth.jwt(); account public.staff_accounts%rowtype;
begin
  if uid is null or claims->>'aal' is distinct from 'aal2' then return false; end if;
  select * into account from public.staff_accounts where user_id=uid and active;
  if not found or exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado or ban_until>now())) then return false; end if;
  if not exists(select 1 from auth.mfa_factors where user_id=uid and status='verified' and factor_type='totp') then return false; end if;
  if not exists(select 1 from auth.sessions where id=(claims->>'session_id')::uuid and user_id=uid) then return false; end if;
  if not exists(select 1 from public.staff_sessions where session_id=(claims->>'session_id')::uuid and user_id=uid
    and revoked_at is null and expires_at>now() and last_seen_at>now()-interval '15 minutes') then return false; end if;
  return p_permission='access' or account.role='master'
    or (p_permission=any(account.permissions) and p_permission in ('moderation','reports','users','chat_audit'));
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.staff_bootstrap()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account public.staff_accounts%rowtype;
begin
  select * into account from public.staff_accounts where user_id=auth.uid() and active;
  if not found or exists(select 1 from public.usuarios where id=auth.uid() and (is_blocked or bloqueado or ban_until>now())) then
    raise exception 'Acceso no autorizado.' using errcode='42501';
  end if;
  return jsonb_build_object('userId',account.user_id,'role',account.role,'permissions',account.permissions,
    'ready',public.staff_permission('access'),
    'expiresAt',(select expires_at from public.staff_sessions where session_id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()));
end;
$$;

create or replace function public.staff_open_session()
returns jsonb language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); account jsonb; sid uuid;
begin
  account:=public.staff_bootstrap();
  if claims->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors
    where user_id=auth.uid() and status='verified' and factor_type='totp') or not exists(
      select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) amr
      where amr->>'method'='totp' and (amr->>'timestamp')::numeric>=extract(epoch from now()-interval '5 minutes')) then
    raise exception 'Verifica el segundo factor para continuar.' using errcode='42501';
  end if;
  sid:=(claims->>'session_id')::uuid;
  if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then
    raise exception 'Sesion no valida.' using errcode='42501';
  end if;
  insert into public.staff_sessions(session_id,user_id) values(sid,auth.uid())
    on conflict(session_id) do update set last_seen_at=now(),expires_at=now()+interval '8 hours',revoked_at=null
    where public.staff_sessions.user_id=auth.uid();
  insert into public.staff_audit(actor_id,action,reason) values(auth.uid(),'session.open','Segundo factor verificado');
  return account || jsonb_build_object('ready',true,'expiresAt',now()+interval '8 hours');
end;
$$;

create or replace function public.staff_require(p_permission text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.staff_permission(p_permission) then raise exception 'Acceso no autorizado o sesion vencida.' using errcode='42501'; end if;
  update public.staff_sessions set last_seen_at=now() where session_id=(auth.jwt()->>'session_id')::uuid;
end;
$$;

create or replace function public.staff_require_recent_mfa()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) amr
    where amr->>'method'='totp' and (amr->>'timestamp')::numeric>=extract(epoch from now()-interval '5 minutes')) then
    raise exception 'Verifica nuevamente tu segundo factor.' using errcode='42501';
  end if;
end;
$$;

create or replace function public.staff_close_session()
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.staff_sessions set revoked_at=now() where session_id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid();
end;
$$;

drop function if exists public.staff_queue(text,text,integer);
create or replace function public.staff_queue(p_section text,p_search text default '',p_page integer default 1,p_filters jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; total integer; page integer:=greatest(1,coalesce(p_page,1)); owner_filter uuid:=nullif(p_filters->>'owner_id','')::uuid;
  term text:=left(trim(coalesce(p_search,'')),100); permission text;
begin
  permission:=case p_section when 'pending' then 'access' when 'articles' then 'moderation'
    when 'reports' then 'reports' when 'users' then 'users' when 'sponsors' then 'sponsors'
    when 'team' then 'team' when 'audit' then 'access' else null end;
  if permission is null then raise exception 'Seccion no valida.'; end if;
  perform public.staff_require(permission);
  if p_section='pending' then
    return jsonb_build_object('counts',jsonb_build_object(
      'articles',case when public.staff_permission('moderation') then (select count(*) from public.articulos where review_status in ('pending','en_revision','reviewing')) else 0 end,
      'reports',case when public.staff_permission('reports') then (select count(*) from public.reports where status in ('open','reviewing'))+(select count(*) from public.chat_reports where status in ('open','reviewing')) else 0 end,
      'team',case when public.staff_permission('team') then (select count(*) from public.staff_accounts where active) else 0 end));
  elsif p_section='articles' then
    select count(*) into total from public.articulos a where position(lower(term) in lower(title))>0
      and (owner_filter is null or owner_id=owner_filter)
      and (coalesce(p_filters->>'featured','')='' or (p_filters->>'featured'='yes' and coalesce(is_featured,false)) or (p_filters->>'featured'='no' and not coalesce(is_featured,false)))
      and (coalesce(p_filters->>'mode','')='' or mode=p_filters->>'mode')
      and (coalesce(p_filters->>'city','')='' or city=p_filters->>'city')
      and (coalesce(p_filters->>'locality','')='' or locality=p_filters->>'locality')
      and (coalesce(p_filters->>'status','')='' or status=p_filters->>'status')
      and (coalesce(p_filters->>'chat','')='' or
        (p_filters->>'chat'='any' and exists(select 1 from public.chats c where c.articulo_id=a.id)) or
        (p_filters->>'chat'='active' and exists(select 1 from public.chats c where c.articulo_id=a.id and c.status in ('open','pending'))) or
        (p_filters->>'chat'='none' and not exists(select 1 from public.chats c where c.articulo_id=a.id)))
      and (coalesce(p_filters->>'category','')='' or coalesce(to_jsonb(a)->>'category',to_jsonb(a)->>'categoria')=p_filters->>'category');
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select id,title,mode,status,review_status,city,locality,created_at,image_url,owner_id,coalesce(is_featured,false) as is_featured,
        (select nombre from public.usuarios where id=a.owner_id) as owner_name,
        (select count(*) from public.chats c where c.articulo_id=a.id) as chat_count,
        (select count(*) from public.chats c where c.articulo_id=a.id and c.status in ('open','pending')) as active_chat_count
      from public.articulos a where position(lower(term) in lower(title))>0
        and (owner_filter is null or owner_id=owner_filter)
        and (coalesce(p_filters->>'featured','')='' or (p_filters->>'featured'='yes' and coalesce(is_featured,false)) or (p_filters->>'featured'='no' and not coalesce(is_featured,false)))
        and (coalesce(p_filters->>'mode','')='' or mode=p_filters->>'mode')
        and (coalesce(p_filters->>'city','')='' or city=p_filters->>'city')
        and (coalesce(p_filters->>'locality','')='' or locality=p_filters->>'locality')
        and (coalesce(p_filters->>'status','')='' or status=p_filters->>'status')
        and (coalesce(p_filters->>'chat','')='' or
          (p_filters->>'chat'='any' and exists(select 1 from public.chats c where c.articulo_id=a.id)) or
          (p_filters->>'chat'='active' and exists(select 1 from public.chats c where c.articulo_id=a.id and c.status in ('open','pending'))) or
          (p_filters->>'chat'='none' and not exists(select 1 from public.chats c where c.articulo_id=a.id)))
        and (coalesce(p_filters->>'category','')='' or coalesce(to_jsonb(a)->>'category',to_jsonb(a)->>'categoria')=p_filters->>'category')
      order by (review_status in ('pending','en_revision','reviewing')) desc nulls last,created_at desc,id
      limit 20 offset (page-1)*20) r;
  elsif p_section='users' then
    select count(*) into total from public.usuarios u join auth.users a on a.id=u.id
      where position(lower(term) in lower(concat(u.nombre,' ',a.email,' ',u.movil,' ',u.id)))>0
      and (coalesce(p_filters->>'city','')='' or u.ciudad=p_filters->>'city')
      and (coalesce(p_filters->>'locality','')='' or u.localidad=p_filters->>'locality')
      and (coalesce(p_filters->>'state','')='' or
        (p_filters->>'state'='blocked' and (u.is_blocked or u.bloqueado)) or
        (p_filters->>'state'='suspended' and not(u.is_blocked or u.bloqueado) and u.ban_until>now()) or
        (p_filters->>'state'='active' and not(u.is_blocked or u.bloqueado) and (u.ban_until is null or u.ban_until<=now())))
      and (coalesce(p_filters->>'reported','')<>'yes' or exists(select 1 from public.staff_publication_history h join public.staff_publication_reports r on r.article_id=h.article_id where h.owner_id=u.id));
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select p.*,public.staff_user_stats(p.id) as stats from (
        select u.id,u.nombre,u.foto_url,u.ciudad,u.localidad,u.created_at,u.is_blocked or u.bloqueado as is_blocked,u.ban_until,
          coalesce((select saldo from public.cupos where usuario_id=u.id),0) as credits
        from public.usuarios u join auth.users a on a.id=u.id
        where position(lower(term) in lower(concat(u.nombre,' ',a.email,' ',u.movil,' ',u.id)))>0
          and (coalesce(p_filters->>'city','')='' or u.ciudad=p_filters->>'city')
          and (coalesce(p_filters->>'locality','')='' or u.localidad=p_filters->>'locality')
          and (coalesce(p_filters->>'state','')='' or
            (p_filters->>'state'='blocked' and (u.is_blocked or u.bloqueado)) or
            (p_filters->>'state'='suspended' and not(u.is_blocked or u.bloqueado) and u.ban_until>now()) or
            (p_filters->>'state'='active' and not(u.is_blocked or u.bloqueado) and (u.ban_until is null or u.ban_until<=now())))
          and (coalesce(p_filters->>'reported','')<>'yes' or exists(select 1 from public.staff_publication_history h join public.staff_publication_reports r on r.article_id=h.article_id where h.owner_id=u.id))
        order by u.created_at desc,u.id limit 20 offset (page-1)*20
      )p) r;
  elsif p_section='reports' then
    with combined as (
      select r.id,'article' as kind,r.articulo_id as target_id,r.articulo_id,r.reason,r.details,r.status,r.created_at,
        (select title from public.articulos where id=r.articulo_id) as article_title,
        (select nombre from public.usuarios where id=r.reporter_user_id) as reporter_name,
        (select nombre from public.usuarios where id=r.reported_user_id) as reported_name from public.reports r
      union all select r.id,'chat',r.chat_id,r.articulo_id,r.reason,r.details,r.status,r.created_at,
        (select title from public.articulos where id=r.articulo_id),
        (select nombre from public.usuarios where id=r.reporter_id),
        (select nombre from public.usuarios where id=r.reported_user_id) from public.chat_reports r
    ) select count(*) into total from combined where status in ('open','reviewing') and position(lower(term) in lower(coalesce(reason,'')))>0;
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    with combined as (
      select r.id,'article' as kind,r.articulo_id as target_id,r.articulo_id,r.reason,r.details,r.status,r.created_at,
        (select title from public.articulos where id=r.articulo_id) as article_title,
        (select nombre from public.usuarios where id=r.reporter_user_id) as reporter_name,
        (select nombre from public.usuarios where id=r.reported_user_id) as reported_name from public.reports r
      union all select r.id,'chat',r.chat_id,r.articulo_id,r.reason,r.details,r.status,r.created_at,
        (select title from public.articulos where id=r.articulo_id),
        (select nombre from public.usuarios where id=r.reporter_id),
        (select nombre from public.usuarios where id=r.reported_user_id) from public.chat_reports r
    ) select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select * from combined where status in ('open','reviewing') and position(lower(term) in lower(coalesce(reason,'')))>0
      order by (status in ('open','reviewing')) desc,created_at desc,id limit 20 offset (page-1)*20) r;
  elsif p_section='sponsors' then
    select count(*) into total from public.patrocinadores where position(lower(term) in lower(texto))>0;
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select id,texto,descripcion,imagen_url,enlace,activo,created_at from public.patrocinadores
      where position(lower(term) in lower(texto))>0 order by created_at desc,id limit 20 offset (page-1)*20) r;
  elsif p_section='team' then
    select count(*) into total from public.staff_accounts s join auth.users u on u.id=s.user_id
      left join public.usuarios p on p.id=s.user_id where position(lower(term) in lower(coalesce(u.email,'')||' '||coalesce(p.nombre,'')))>0;
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select s.user_id as id,s.role,s.active,s.permissions,u.email,coalesce(p.nombre,'') as nombre,s.created_at
      from public.staff_accounts s join auth.users u on u.id=s.user_id left join public.usuarios p on p.id=s.user_id
      where position(lower(term) in lower(coalesce(u.email,'')||' '||coalesce(p.nombre,'')))>0
      order by s.created_at,s.user_id limit 20 offset (page-1)*20) r;
  elsif p_section='audit' then
    select count(*) into total from public.staff_audit where (public.staff_permission('team') or actor_id=auth.uid())
      and position(lower(term) in lower(action||' '||reason))>0;
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select a.id,a.actor_id,coalesce(u.nombre,'Equipo') as actor_name,a.action,a.target_id,a.reason,a.created_at
      from public.staff_audit a left join public.usuarios u on u.id=a.actor_id
      where (public.staff_permission('team') or a.actor_id=auth.uid()) and position(lower(term) in lower(a.action||' '||a.reason))>0
      order by a.created_at desc,a.id limit 20 offset (page-1)*20) r;
  end if;
  return jsonb_build_object('rows',rows,'total',total,'page',page,'pageCount',greatest(1,ceil(total/20.0)::integer));
end;
$$;

create or replace function public.staff_action(p_kind text,p_id uuid,p_action text,p_reason text,p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_reason text:=trim(coalesce(p_reason,'')); permission text; before_value jsonb; after_value jsonb; days integer; target uuid:=p_id; message_id uuid; deletion_reason text;
  related_article uuid; article_state text; article_owner uuid; article_title text; case_status text;
  review_applied boolean:=false; action_notice text; suspension_until timestamptz;
begin
  permission:=case p_kind when 'article' then 'moderation' when 'report' then 'reports' when 'chat_report' then 'reports'
    when 'user' then 'users' when 'sponsor' then 'sponsors' when 'staff' then 'team' else null end;
  if permission is null then raise exception 'Operacion no valida.'; end if;
  perform public.staff_require(permission);
  if length(v_reason) not between 8 and 500 then raise exception 'Indica un motivo de 8 a 500 caracteres.'; end if;
  if p_kind='article' then
    select to_jsonb(a) into before_value from public.articulos a where id=p_id for update;
    if before_value is null then raise exception 'La publicacion ya no existe.'; end if;
    perform set_config('mibatute.staff_action','on',true);
    if before_value->>'status' in ('reservado','entregado') then raise exception 'No se puede modificar una reserva o entrega desde moderacion.'; end if;
    if p_action='approve' then
      update public.articulos set review_status='approved',approval_status='approved',moderation_status='approved',revision_status='approved',status='disponible',estado='disponible' where id=p_id;
    elsif p_action='pause' then
      update public.articulos set status='en_revision',estado='en_revision',review_status='en_revision',approval_status='en_revision',moderation_status='en_revision',revision_status='en_revision' where id=p_id;
      if before_value->>'status' is distinct from 'en_revision' then
        insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Publicacion en revision',
          concat('Tu publicacion "',before_value->>'title','" fue pausada temporalmente y esta en revision por el equipo de MiBatute.',
            E'\nMotivo: ',v_reason,E'\nSeguira visible como "En revision", pero no recibira compras ni postulaciones mientras se revisa. Este aviso no confirma un incumplimiento.')) returning id into message_id;
        insert into public.system_message_receipts(message_id,user_id) values(message_id,(before_value->>'owner_id')::uuid);
      end if;
    elsif p_action='delete' then
      deletion_reason:=case p_options->>'reason_code'
        when 'prohibited' then 'Articulo prohibido'
        when 'fraud' then 'Posible fraude o informacion enganosa'
        when 'duplicate' then 'Publicacion duplicada o spam'
        when 'inappropriate' then 'Contenido o imagenes inapropiadas'
        when 'privacy' then 'Exposicion de datos personales'
        when 'unavailable' then 'Articulo no disponible'
        when 'community' then 'Incumplimiento de las normas de la comunidad'
        when 'other' then 'Otro motivo' else null end;
      if deletion_reason is null then raise exception 'Selecciona un motivo de eliminacion valido.'; end if;
      insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Publicacion eliminada',
        concat('Tu publicacion "',before_value->>'title','" fue eliminada por el equipo de MiBatute despues de su revision.',E'\nMotivo: ',deletion_reason,E'\nDetalle: ',v_reason)) returning id into message_id;
      insert into public.system_message_receipts(message_id,user_id) values(message_id,(before_value->>'owner_id')::uuid);
      delete from public.articulos where id=p_id;
    else raise exception 'Accion no valida.'; end if;
    if p_action='delete' then after_value:=jsonb_build_object('deleted',true,'reason_code',p_options->>'reason_code','message_id',message_id);
    else select jsonb_build_object('status',status,'review_status',review_status) into after_value from public.articulos where id=p_id; end if;
  elsif p_kind in ('report','chat_report') then
    if p_action not in ('reviewing','approved','delete','resolved','dismissed') then raise exception 'Estado no valido.'; end if;
    case_status:=case when p_action in ('approved','delete') then 'resolved' else p_action end;
    if p_action in ('reviewing','approved','delete') then
      if p_kind='report' then select articulo_id into related_article from public.reports where id=p_id;
      else select articulo_id into related_article from public.chat_reports where id=p_id; end if;
      -- Lock the publication before the case, matching publication deletion's lock order.
      select status,owner_id,title into article_state,article_owner,article_title from public.articulos where id=related_article for update;
    end if;
    if p_kind='report' then
      select jsonb_build_object('status',status) into before_value from public.reports where id=p_id for update;
      update public.reports set status=case_status,resolution=v_reason,handled_at=now(),handled_by_user_id=auth.uid() where id=p_id;
    else
      select jsonb_build_object('status',status) into before_value from public.chat_reports where id=p_id for update;
      update public.chat_reports set status=case_status,resolution=v_reason,handled_at=now(),handled_by_user_id=auth.uid() where id=p_id;
    end if;
    if before_value is null then raise exception 'El reporte ya no existe.'; end if;
    if before_value->>'status' not in ('open','reviewing') then raise exception 'El reporte ya fue resuelto. Actualiza la lista.'; end if;
    if p_action='reviewing' then
      if article_state is null then action_notice:='Reporte en revisión. La publicación ya no está disponible.';
      elsif article_state in ('reservado','entregado') then
        action_notice:='Reporte en revisión. La publicación mantiene su reserva o entrega; no se alteró la operación.';
        if before_value->>'status' is distinct from 'reviewing' then
          insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Reporte en revision',
            concat('El equipo de MiBatute esta revisando un reporte sobre tu publicacion "',article_title,'".',
              E'\nLa reserva o entrega se mantiene sin cambios. Este aviso no confirma un incumplimiento.')) returning id into message_id;
          insert into public.system_message_receipts(message_id,user_id) values(message_id,article_owner);
        end if;
      else
        if not public.staff_permission('moderation') then
          raise exception 'Necesitas permiso de moderacion para poner tambien la publicacion en revision.';
        end if;
        perform public.staff_action('article',related_article,'pause',v_reason,'{}'::jsonb);
        review_applied:=true;
        action_notice:='Reporte y publicación puestos en revisión. El propietario tiene el aviso en su buzón.';
      end if;
    elsif p_action in ('approved','delete') then
      if not public.staff_permission('moderation') then raise exception 'Necesitas permiso de moderacion para aprobar o eliminar la publicacion.'; end if;
      if article_state is null then raise exception 'La publicacion ya no existe.'; end if;
      if p_action='delete' then
        perform public.staff_action('article',related_article,'delete',v_reason,p_options);
        action_notice:='Publicación eliminada y reporte cerrado. El propietario recibió el motivo en su buzón.';
      else
        if article_state not in ('reservado','entregado') then
          perform public.staff_action('article',related_article,'approve',v_reason,'{}'::jsonb);
        end if;
        insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Publicacion aprobada',
          concat('El equipo de MiBatute reviso el reporte sobre tu publicacion "',article_title,'" y la aprobo.',
            case when article_state in ('reservado','entregado') then E'\nTu reserva o entrega se mantiene sin cambios.' else E'\nLa publicacion esta disponible nuevamente.' end)) returning id into message_id;
        insert into public.system_message_receipts(message_id,user_id) values(message_id,article_owner);
        action_notice:='Publicación aprobada y reporte cerrado. El propietario recibió el aviso en su buzón.';
      end if;
    end if;
    after_value:=jsonb_build_object('status',case_status,'article_id',related_article,'publication_in_review',review_applied,'decision',p_action);
  elsif p_kind='user' then
    perform set_config('mibatute.staff_action','on',true);
    if exists(select 1 from public.staff_accounts where user_id=p_id) then raise exception 'Gestiona las cuentas del equipo desde Equipo.'; end if;
    select jsonb_build_object('is_blocked',is_blocked,'ban_until',ban_until) into before_value from public.usuarios where id=p_id for update;
    if before_value is null then raise exception 'El usuario ya no existe.'; end if;
    if p_action='suspend' then
      days:=coalesce((p_options->>'days')::integer,1);
      if days not between 1 and 30 then raise exception 'La suspension debe durar de 1 a 30 dias.'; end if;
      update public.usuarios set ban_until=now()+make_interval(days=>days) where id=p_id returning ban_until into suspension_until;
      insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Suspension temporal de tu cuenta',
        concat('El equipo de MiBatute ha suspendido temporalmente tu cuenta.',
          E'\nMotivo: ',v_reason,E'\nDuracion: ',days,case when days=1 then ' dia.' else ' dias.' end,
          E'\nLa suspension finaliza el ',to_char(suspension_until at time zone 'America/Bogota','DD/MM/YYYY HH24:MI'),' (hora de Colombia).',
          E'\nSi consideras que esta sancion no es justa, puedes solicitar su revision escribiendo a hola@mibatute.com. Incluye el correo de tu cuenta y el motivo de tu solicitud.')) returning id into message_id;
      insert into public.system_message_receipts(message_id,user_id) values(message_id,p_id);
      action_notice:='Usuario suspendido. Recibió el motivo, la duración y el contacto para solicitar revisión en su buzón.';
    elsif p_action='restore' then update public.usuarios set ban_until=null,is_blocked=false,bloqueado=false where id=p_id;
    else raise exception 'Accion no valida.'; end if;
    after_value:=jsonb_build_object('action',p_action,'days',days,'ban_until',suspension_until,'message_id',message_id);
  elsif p_kind='sponsor' then
    select jsonb_build_object('activo',activo) into before_value from public.patrocinadores where id=p_id for update;
    if p_action='save' then
      if length(trim(coalesce(p_options->>'texto',''))) not between 2 and 100
        or length(coalesce(p_options->>'descripcion',''))>250
        or (coalesce(p_options->>'imagen_url','')<>'' and p_options->>'imagen_url' !~ '^https://[^[:space:]]+$')
        or (coalesce(p_options->>'enlace','')<>'' and p_options->>'enlace' !~ '^https://[^[:space:]]+$') then raise exception 'Datos del patrocinador no validos. Usa enlaces HTTPS.'; end if;
      if p_id is null then
        before_value:='{}';
        insert into public.patrocinadores(texto,descripcion,imagen_url,enlace,activo)
          values(trim(p_options->>'texto'),p_options->>'descripcion',coalesce(p_options->>'imagen_url',''),p_options->>'enlace',coalesce((p_options->>'activo')::boolean,true)) returning id into target;
      else
        update public.patrocinadores set texto=trim(p_options->>'texto'),descripcion=p_options->>'descripcion',imagen_url=coalesce(p_options->>'imagen_url',''),enlace=p_options->>'enlace',activo=coalesce((p_options->>'activo')::boolean,true) where id=p_id;
      end if;
      after_value:=jsonb_build_object('texto',trim(p_options->>'texto'));
    elsif p_action in ('activate','pause') then
      update public.patrocinadores set activo=(p_action='activate') where id=p_id;
      after_value:=jsonb_build_object('activo',p_action='activate');
    else raise exception 'Accion no valida.'; end if;
  elsif p_kind='staff' then
    perform public.staff_require_recent_mfa();
    perform pg_advisory_xact_lock(14142026);
    select to_jsonb(s) into before_value from public.staff_accounts s where user_id=p_id for update;
    if p_id=auth.uid() then raise exception 'No puedes cambiar tus propios permisos.'; end if;
    if p_action='disable' then
      if before_value->>'role'='master' and (select count(*) from public.staff_accounts where role='master' and active)<=1 then raise exception 'Debe quedar un Super Admin activo.'; end if;
      update public.staff_accounts set active=false where user_id=p_id;
      update public.staff_sessions set revoked_at=now() where user_id=p_id;
    elsif p_action='enable' then update public.staff_accounts set active=true where user_id=p_id;
    elsif p_action='permissions' then
      if before_value->>'role'<>'admin' then raise exception 'Los permisos del Super Admin no se modifican aqui.'; end if;
      if jsonb_typeof(p_options->'permissions') is distinct from 'array' then raise exception 'Permisos no validos.'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_options->'permissions') v where v not in ('moderation','reports','users','chat_audit')) then raise exception 'Permisos no validos.'; end if;
      update public.staff_accounts set permissions=array(select distinct jsonb_array_elements_text(p_options->'permissions')) where user_id=p_id;
      update public.staff_sessions set revoked_at=now() where user_id=p_id;
    else raise exception 'Accion no valida.'; end if;
    select to_jsonb(s) into after_value from public.staff_accounts s where user_id=p_id;
  end if;
  if before_value is null then raise exception 'El registro no existe.'; end if;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),p_kind||'.'||p_action,target,v_reason,after_value);
  return jsonb_build_object('success',true,'id',target)||case when action_notice is not null then jsonb_build_object('notice',action_notice) else '{}'::jsonb end;
end;
$$;

-- Existing confirmed accounts can receive staff access only from a verified Super Admin.
create or replace function public.staff_add_account(p_email text,p_role text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform public.staff_require('team');
  perform public.staff_require_recent_mfa();
  if p_role is null or p_role not in ('admin','master') or length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'Datos no validos.'; end if;
  select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if target is null then raise exception 'La cuenta debe existir y tener el correo confirmado.'; end if;
  if exists(select 1 from public.staff_accounts where user_id=target) then raise exception 'La cuenta ya pertenece al equipo.'; end if;
  insert into public.staff_accounts(user_id,role) values(target,p_role);
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'staff.add',target,trim(p_reason),jsonb_build_object('role',p_role));
  return target;
end;
$$;

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path='' as $$
declare fields text[]:=array['role','rol','is_blocked','bloqueado','blocked','ban_until','can_send_system_messages']; k text;
begin
  if auth.uid() is null or auth.jwt()->>'role'='service_role' then return new; end if;
  foreach k in array fields loop
    if tg_op='INSERT' then
      if coalesce(to_jsonb(new)->>k,'') not in ('','false') then raise exception 'No puedes asignarte privilegios.' using errcode='42501'; end if;
    elsif (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then
      if k in ('is_blocked','bloqueado') and new.id=auth.uid() and to_jsonb(new)->>k='true'
        and not exists(select 1 from public.staff_accounts where user_id=auth.uid() and active) then continue; end if;
      if k in ('role','rol','can_send_system_messages') or not public.staff_permission('users')
        or current_setting('mibatute.staff_action',true) is distinct from 'on' then
        raise exception 'No puedes modificar privilegios o sanciones.' using errcode='42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists guard_profile_privileges on public.usuarios;
create trigger guard_profile_privileges before insert or update on public.usuarios for each row execute function public.guard_profile_privileges();

create or replace function public.guard_staff_suspension()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and exists(select 1 from public.usuarios where id=auth.uid() and ban_until>now()) then
    -- A suspended buyer may still cancel an unapproved reservation to release its slot.
    if tg_table_name='articulos' and tg_op='UPDATE' and to_jsonb(old)->>'status'='reservado'
      and to_jsonb(new)->>'status'='disponible' and to_jsonb(old)->>'buyer_id'=auth.uid()::text then return new; end if;
    if tg_table_name='chats' and tg_op='UPDATE' and to_jsonb(new)->>'status'='closed'
      and to_jsonb(old)->>'buyer_id'=auth.uid()::text
      and (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at'])
      and exists(select 1 from public.articulos where id=(to_jsonb(old)->>'articulo_id')::uuid
        and status='disponible' and buyer_id is null) then return new; end if;
    raise exception 'Tu cuenta tiene una suspension temporal activa.' using errcode='42501';
  end if;
  return new;
end;
$$;
do $$ declare name text;
begin
  foreach name in array array['articulos','postulaciones','chats','chat_messages'] loop
    execute format('drop trigger if exists guard_staff_suspension on public.%I',name);
    execute format('create trigger guard_staff_suspension before insert or update on public.%I for each row execute function public.guard_staff_suspension()',name);
  end loop;
end $$;

-- Remove legacy policies that trusted user-editable profile roles.
create index if not exists staff_chat_messages_page_idx on public.chat_messages(chat_id,created_at desc,id desc);
create or replace function public.staff_article_chat_audit(p_article uuid,p_reason text,p_chat uuid default null,p_page integer default 1,p_snapshot timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; rows jsonb; total integer; page integer:=greatest(1,coalesce(p_page,1));
  snapshot timestamptz:=least(coalesce(p_snapshot,now()),now()); heading text; chat public.chats%rowtype; reason text:=trim(coalesce(p_reason,''));
begin
  perform public.staff_require('chat_audit');
  if length(reason) not between 8 and 500 then raise exception 'Indica un motivo de auditoria de 8 a 500 caracteres.'; end if;
  select title into heading from public.articulos where id=p_article;
  if not found then raise exception 'La publicacion ya no existe.'; end if;
  if p_chat is null then
    select count(*) into total from public.chats where articulo_id=p_article and created_at<=snapshot;
    page:=least(page,greatest(1,ceil(total/20.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select c.id,c.status,c.created_at,
        (select nombre from public.usuarios where id=c.buyer_id) as buyer_name,
        (select nombre from public.usuarios where id=c.seller_id) as seller_name
      from public.chats c where c.articulo_id=p_article and c.created_at<=snapshot
      order by c.created_at desc,c.id desc limit 20 offset (page-1)*20) r;
    result:=jsonb_build_object('title',heading,'rows',rows,'total',total,'page',page,'pageCount',greatest(1,ceil(total/20.0)::integer),'snapshot',snapshot);
  else
    select * into chat from public.chats where id=p_chat and articulo_id=p_article;
    if not found then raise exception 'La conversacion no pertenece a esta publicacion.' using errcode='42501'; end if;
    select count(*) into total from public.chat_messages where chat_id=p_chat and created_at<=snapshot;
    page:=least(page,greatest(1,ceil(total/50.0)::integer));
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (
      select m.id,m.created_at,
        coalesce(nullif(to_jsonb(m)->>'body',''),nullif(to_jsonb(m)->>'message',''),nullif(to_jsonb(m)->>'content',''),nullif(to_jsonb(m)->>'text',''),nullif(to_jsonb(m)->>'mensaje',''),'') as body,
        (select nombre from public.usuarios where id=m.sender_id) as sender_name,
        case when m.sender_id=chat.buyer_id then 'Comprador / interesado' when m.sender_id=chat.seller_id then 'Vendedor / donante' else 'Usuario' end as sender_role
      from public.chat_messages m where m.chat_id=p_chat and m.created_at<=snapshot
      order by m.created_at desc,m.id desc limit 50 offset (page-1)*50) r;
    result:=jsonb_build_object('title',heading,'chat_id',p_chat,'status',chat.status,'rows',rows,'total',total,'page',page,'pageCount',greatest(1,ceil(total/50.0)::integer),'snapshot',snapshot);
  end if;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'chat.audit',p_article,reason,jsonb_build_object('chat_id',p_chat,'page',page,'snapshot',snapshot,'returned',jsonb_array_length(rows)));
  return result;
end;
$$;
revoke all on function public.staff_article_chat_audit(uuid,text,uuid,integer,timestamptz) from public,anon;
grant execute on function public.staff_article_chat_audit(uuid,text,uuid,integer,timestamptz) to authenticated;

create or replace function public.staff_article_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.staff_require('moderation');
  select jsonb_build_object('id',id,'title',title,'description',to_jsonb(a)->>'description',
    'mode',mode,'price',to_jsonb(a)->'price','status',status,'review_status',review_status,
    'city',city,'locality',locality,'category',coalesce(to_jsonb(a)->>'category',to_jsonb(a)->>'categoria'),
    'image_url',image_url,'imagenes',to_jsonb(a)->'imagenes','created_at',created_at,
    'owner_name',(select nombre from public.usuarios where id=a.owner_id)) into result
  from public.articulos a where id=p_id;
  if result is null then raise exception 'La publicacion ya no existe.'; end if;
  return result;
end;
$$;
revoke all on function public.staff_article_detail(uuid) from public,anon;
grant execute on function public.staff_article_detail(uuid) to authenticated;

create or replace function public.guard_staff_article_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.jwt()->>'role'='service_role' then return new; end if;
  if old.status='en_revision' and (
    new.status is distinct from old.status or new.estado is distinct from old.estado
    or new.review_status is distinct from old.review_status or new.approval_status is distinct from old.approval_status
    or new.moderation_status is distinct from old.moderation_status or new.revision_status is distinct from old.revision_status)
    and not (public.staff_permission('moderation') and current_setting('mibatute.staff_action',true) is not distinct from 'on') then
    raise exception 'Solo el equipo puede reactivar una publicacion en revision.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_staff_article_review on public.articulos;
create trigger guard_staff_article_review before update on public.articulos for each row execute function public.guard_staff_article_review();
revoke all on function public.guard_staff_article_review() from public,anon,authenticated;

drop policy if exists "Perfiles publicos visibles" on public.usuarios;
create or replace view public.usuarios_publicos with (security_invoker=false,security_barrier=true) as
select id,nombre,ciudad,localidad,foto_url,is_blocked,bloqueado,ban_until from public.usuarios;
grant select on public.usuarios_publicos to anon,authenticated;
do $$ declare p record;
begin
  for p in select * from pg_policies where schemaname='public' and tablename in
    ('reports','chat_reports','patrocinadores','cupos','cupos_historial','recargas_pendientes')
    and (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(role|rol)\M'
  loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
end $$;
drop policy if exists staff_reports_read on public.reports;
drop policy if exists staff_chat_reports_read on public.chat_reports;
drop policy if exists staff_sponsors_read on public.patrocinadores;
drop policy if exists staff_credits_read on public.cupos;
drop policy if exists staff_credit_history_read on public.cupos_historial;
drop policy if exists staff_old_topups_read on public.recargas_pendientes;
create policy staff_reports_read on public.reports for select using(auth.uid()=reporter_user_id or public.staff_permission('reports'));
create policy staff_chat_reports_read on public.chat_reports for select using(auth.uid()=reporter_id or public.staff_permission('reports'));
create policy staff_sponsors_read on public.patrocinadores for select using(activo or public.staff_permission('sponsors'));
create policy staff_credits_read on public.cupos for select using(auth.uid()=usuario_id);
create policy staff_credit_history_read on public.cupos_historial for select using(auth.uid()=usuario_id);
create policy staff_old_topups_read on public.recargas_pendientes for select using(auth.uid()=usuario_id);
revoke insert,update,delete on public.cupos,public.cupos_historial,public.recargas_pendientes,public.patrocinadores from authenticated;
revoke delete on public.usuarios from authenticated;
revoke update,delete on public.reports,public.chat_reports from authenticated;

revoke all on function public.staff_require(text),public.staff_require_recent_mfa(),public.guard_profile_privileges(),public.guard_staff_suspension() from public,anon,authenticated;
revoke all on function public.staff_bootstrap(),public.staff_open_session(),public.staff_close_session(),
  public.staff_queue(text,text,integer,jsonb),public.staff_action(text,uuid,text,text,jsonb),public.staff_add_account(text,text,text) from public,anon;
grant execute on function public.staff_bootstrap(),public.staff_open_session(),public.staff_close_session(),
  public.staff_queue(text,text,integer,jsonb),public.staff_action(text,uuid,text,text,jsonb),public.staff_add_account(text,text,text) to authenticated;
revoke all on function public.staff_permission(text) from public;
grant execute on function public.staff_permission(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
