begin;

-- Public projection includes only the badge, never the private identity fields.
create or replace view public.usuarios_publicos with (security_invoker=false,security_barrier=true) as
 select id,nombre,ciudad,localidad,foto_url,is_blocked,bloqueado,ban_until,
 public.account_is_verified(id) as account_verified from public.usuarios;
grant select on public.usuarios_publicos to anon,authenticated;

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check
 check(kind in ('published','request','sale','suspension','review','deleted','credits_purchase','credits_gift','account_verified'));
alter table public.email_controls alter column events set default '{"published":false,"request":false,"sale":false,"suspension":false,"review":false,"deleted":false,"credits_purchase":false,"credits_gift":false,"account_verified":true}';
-- Preserve the existing global switch and each configured event, including opt-outs.
update public.email_controls set events='{"account_verified":true}'::jsonb||events,updated_at=clock_timestamp()
 where not(events?'account_verified');

create or replace function public.staff_email_save(p_enabled boolean,p_limit integer,p_events jsonb,p_version timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.email_controls%rowtype; item text;
begin
 perform public.staff_require('team');
 if p_enabled is null or p_limit is null or p_limit not between 1 and 80 or jsonb_typeof(p_events) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_events))<>9 then raise exception 'Configuración no válida.';end if;
 foreach item in array array['published','request','sale','suspension','review','deleted','credits_purchase','credits_gift','account_verified'] loop
  if jsonb_typeof(p_events->item) is distinct from 'boolean' then raise exception 'Configuración no válida.';end if;
 end loop;
 select * into previous from public.email_controls where id for update;
 if previous.updated_at is distinct from p_version then raise exception 'La configuración cambió. Actualiza antes de guardar.';end if;
 update public.email_controls set enabled=p_enabled,daily_limit=p_limit,events=p_events,updated_at=clock_timestamp() where id;
 update public.email_outbox set state='skipped',finished_at=now() where state='pending' and (not p_enabled or not (p_events->>kind)::boolean);
 insert into public.staff_audit(actor_id,action,reason,changes) values(auth.uid(),'settings.email','Configuración de correos transaccionales',
  jsonb_build_object('before',to_jsonb(previous),'enabled',p_enabled,'daily_limit',p_limit,'events',p_events));
 return public.staff_email_settings();
end $$;

create or replace function public.notify_account_verification()
returns trigger language plpgsql security definer set search_path='' as $$
declare message_id uuid;
begin
 if new.status<>'approved' then return new;end if;
 if tg_op='UPDATE' and old.status='approved' then return new;end if;
 insert into public.system_messages(sender_id,title,body)
 values(new.reviewed_by,'Tu cuenta fue verificada',
 'El equipo de MiBatute aprobó la revisión manual de tu cuenta. Ya puedes ver la insignia de cuenta verificada en tu perfil y junto a tus artículos. Esta revisión no garantiza las operaciones entre usuarios.')
 returning id into message_id;
 -- Existing receipt trigger adds the notification to the bell and private inbox.
 insert into public.system_message_receipts(message_id,user_id) values(message_id,new.user_id);
 perform public.queue_market_email(new.user_id,'account_verified',
 'account-verified:'||new.user_id::text||':'||new.revision::text,'Tu cuenta fue verificada',
 'El equipo de MiBatute aprobó la revisión manual de tu cuenta. Tu perfil y tus artículos ya pueden mostrar la insignia de cuenta verificada.');
 return new;
end $$;
revoke all on function public.notify_account_verification() from public,anon,authenticated;
drop trigger if exists account_verification_notice on public.account_verifications;
create trigger account_verification_notice after insert or update on public.account_verifications
 for each row execute function public.notify_account_verification();

notify pgrst,'reload schema';
commit;
