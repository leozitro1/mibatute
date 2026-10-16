begin;

create or replace function public.staff_block_user(p_user uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reason text:=trim(coalesce(p_reason,'')); previous jsonb; message_id uuid;
begin
  perform public.staff_require('team');
  if length(reason) not between 8 and 500 then raise exception 'Indica un motivo de 8 a 500 caracteres.'; end if;
  if p_user=auth.uid() or exists(select 1 from public.staff_accounts where user_id=p_user) then
    raise exception 'Gestiona las cuentas del equipo desde Equipo.';
  end if;
  select jsonb_build_object('is_blocked',is_blocked,'bloqueado',bloqueado,'ban_until',ban_until)
    into previous from public.usuarios where id=p_user for update;
  if not found then raise exception 'El usuario ya no existe.'; end if;
  if (previous->>'is_blocked')::boolean or (previous->>'bloqueado')::boolean then
    raise exception 'El usuario ya esta bloqueado permanentemente.';
  end if;
  perform set_config('mibatute.staff_action','on',true);
  update public.usuarios set is_blocked=true,bloqueado=true,ban_until=null where id=p_user;
  update public.chats c set status='closed'
    where c.status in ('open','pending') and (c.buyer_id=p_user or c.seller_id=p_user
      or exists(select 1 from public.articulos a where a.id=c.articulo_id and a.owner_id=p_user));
  insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Bloqueo permanente de tu cuenta',
    concat('Tu cuenta de MiBatute ha sido bloqueada de forma permanente por mal uso de la plataforma.',
      E'\nMotivo: ',reason,E'\nEste bloqueo no tiene fecha de vencimiento.',
      E'\nTus creditos quedan bloqueados y no puedes realizar recargas. Para solicitar la devolucion de creditos comprados, comunicate con administracion en hola@mibatute.com.',
      E'\nSi consideras que esta decision no es justa, solicita una revision escribiendo a hola@mibatute.com. Incluye el correo de tu cuenta y el motivo de tu solicitud.')) returning id into message_id;
  insert into public.system_message_receipts(message_id,user_id) values(message_id,p_user);
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'user.block',p_user,reason,jsonb_build_object('before',previous,'permanent',true,'message_id',message_id));
  return jsonb_build_object('notice','Usuario bloqueado permanentemente. El motivo y la opción de solicitar revisión están en su buzón.');
end;
$$;
revoke all on function public.staff_block_user(uuid,text) from public,anon,authenticated;
grant execute on function public.staff_block_user(uuid,text) to authenticated;

create or replace function public.guard_permanent_user_block()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.jwt()->>'role'='service_role' then return new; end if;
  if tg_table_name='usuarios' then
    -- Preserve voluntary account deactivation, never self-restoration.
    if new.id=auth.uid() and not exists(select 1 from public.staff_accounts where user_id=auth.uid())
      and new.ban_until is not distinct from old.ban_until
      and (not old.is_blocked or new.is_blocked) and (not old.bloqueado or new.bloqueado) then return new; end if;
    if (old.is_blocked or old.bloqueado or new.is_blocked or new.bloqueado)
      and (new.is_blocked is distinct from old.is_blocked or new.bloqueado is distinct from old.bloqueado
        or new.ban_until is distinct from old.ban_until)
      and (not public.staff_permission('team') or current_setting('mibatute.staff_action',true) is distinct from 'on') then
      raise exception 'Solo el super admin puede modificar un bloqueo permanente.' using errcode='42501';
    end if;
  elsif exists(select 1 from public.usuarios where id=auth.uid() and (is_blocked or bloqueado)) then
    raise exception 'Tu cuenta esta bloqueada permanentemente. Contacta con la plataforma para solicitar una revision.' using errcode='42501';
  end if;
  if tg_table_name='chat_messages' and exists(
    select 1 from public.chats c join public.usuarios u on (u.id in (c.buyer_id,c.seller_id)
      or u.id=(select a.owner_id from public.articulos a where a.id=c.articulo_id))
    where c.id=(to_jsonb(new)->>'chat_id')::uuid and (u.is_blocked or u.bloqueado)) then
    raise exception 'Esta conversacion esta desactivada por un bloqueo de cuenta.' using errcode='42501';
  end if;
  if tg_table_name='chats' and (to_jsonb(new)->>'status') in ('open','pending') and exists(
    select 1 from public.usuarios u where u.id in ((to_jsonb(new)->>'buyer_id')::uuid,(to_jsonb(new)->>'seller_id')::uuid)
      and (u.is_blocked or u.bloqueado)) then
    raise exception 'Esta conversacion esta desactivada por un bloqueo de cuenta.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_permanent_user_block() from public,anon,authenticated;
do $$ declare name text;
begin
  foreach name in array array['usuarios','articulos','postulaciones','chats','chat_messages'] loop
    execute format('drop trigger if exists guard_permanent_user_block on public.%I',name);
    execute format('create trigger guard_permanent_user_block before %s on public.%I for each row execute function public.guard_permanent_user_block()',
      case when name='usuarios' then 'update' else 'insert or update' end,name);
  end loop;
end $$;

create or replace function public.market_account_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.usuarios where id=p_user and (is_blocked or bloqueado));
$$;
revoke all on function public.market_account_blocked(uuid) from public;
grant execute on function public.market_account_blocked(uuid) to anon,authenticated;
drop policy if exists hide_blocked_owner_articles on public.articulos;
create policy hide_blocked_owner_articles on public.articulos as restrictive for select to anon,authenticated
using (not public.market_account_blocked(owner_id) or owner_id=auth.uid() or public.staff_permission('access'));
update public.chats c set status='closed' where c.status in ('open','pending') and (
  public.market_account_blocked(c.buyer_id) or public.market_account_blocked(c.seller_id)
  or exists(select 1 from public.articulos a where a.id=c.articulo_id and public.market_account_blocked(a.owner_id)));
do $$ declare name text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach name in array array['usuarios','chats'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=name) then
        execute format('alter publication supabase_realtime add table public.%I',name);
      end if;
    end loop;
  end if;
end $$;
commit;
