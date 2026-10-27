begin;

-- Persistent receipt, independent of email settings and browser callbacks.
create or replace function public.record_wompi_inbox(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.wompi_topups%rowtype; inserted_id uuid;
begin
 select * into r from public.wompi_topups where id=p_id and state='approved';
 if not found or (r.environment<>'prod' and current_setting('app.settings.wompi_test_credits',true) is distinct from 'on')
  or not exists(select 1 from public.cupos_historial where usuario_id=r.usuario_id and referencia_id=r.id and concepto='recarga_wompi' and cantidad=r.credits) then return;end if;
 insert into public.system_messages(id,title,body,created_at)
 values(r.id,'Recarga confirmada',concat(
  case when r.environment='test' then 'Prueba Sandbox, sin dinero real. ' else '' end,
  'Se abonaron ',r.credits,case when r.credits=1 then ' crédito' else ' créditos' end,
  ' a tu cuenta. ',case when r.environment='test' then 'Valor simulado: ' else 'Total pagado: ' end,
  to_char(r.amount_in_cents::numeric/100,'FM999999990.00'),' ',r.currency,
  '. Referencia: ',r.reference,'. Consulta tu saldo y las últimas 5 recargas desde tu perfil. Gracias por apoyar MiBatute.'),coalesce(r.credited_at,r.created_at))
 on conflict(id) do nothing returning id into inserted_id;
 -- Do not restore a receipt that the customer deliberately deleted.
 if inserted_id is not null then
  insert into public.system_message_receipts(message_id,user_id,created_at)
  values(inserted_id,r.usuario_id,coalesce(r.credited_at,r.created_at));
 end if;
end $$;
revoke all on function public.record_wompi_inbox(uuid) from public,anon,authenticated;

create or replace function public.capture_wompi_inbox() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state='approved' and old.state is distinct from 'approved' then
  perform public.record_wompi_inbox(new.id);
 end if;
 return new;
end $$;
revoke all on function public.capture_wompi_inbox() from public,anon,authenticated;
drop trigger if exists wompi_inbox_receipt on public.wompi_topups;
create trigger wompi_inbox_receipt after update on public.wompi_topups for each row execute function public.capture_wompi_inbox();

-- The receipt already generates the bell notification; avoid a second generic credit alert.
drop trigger if exists notify_credits on public.cupos_historial;
create trigger notify_credits after insert on public.cupos_historial for each row
 when (new.concepto is distinct from 'recarga_wompi') execute function public.record_activity_notification();

-- Include previous confirmed and credited purchases, preserving their original dates.
do $$ declare item record;begin
 for item in select id from public.wompi_topups where state='approved' loop
  perform public.record_wompi_inbox(item.id);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
