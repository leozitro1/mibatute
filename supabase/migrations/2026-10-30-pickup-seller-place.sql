begin;

-- Existing agreements keep their history; new proposals require a place.
alter table public.chat_pickups add column if not exists pickup_place text
  check (pickup_place is null or char_length(btrim(pickup_place)) between 1 and 200);

create or replace function public.propose_chat_pickup(p_chat_id uuid,p_date date,p_start time,p_end time,
  p_replace_id uuid,p_place text)
returns public.chat_pickups language plpgsql security definer set search_path = '' as $$
declare c public.chats%rowtype; previous public.chat_pickups%rowtype; result public.chat_pickups%rowtype;
  place text := btrim(p_place,E' \t\n\r');
begin
  c := public.lock_pickup_chat(p_chat_id);
  if auth.uid() is distinct from c.seller_id then
    raise exception 'Solo el vendedor o donante puede proponer una recogida.' using errcode = '42501';
  end if;
  if place is null or char_length(place) not between 1 and 200 then
    raise exception 'Escribe el lugar de recogida (maximo 200 caracteres).';
  end if;
  if p_date is null or p_start is null or p_end is null or p_start >= p_end
    or p_end >= time '24:00'
    or ((p_date + p_start) at time zone 'America/Bogota') <= clock_timestamp() then
    raise exception 'Elige una fecha futura y una franja valida del mismo dia en America/Bogota.';
  end if;
  select * into previous from public.chat_pickups where chat_id = c.id
    and status in ('pending','confirmed') for update;
  if previous.id is not null then
    if p_replace_id is distinct from previous.id then
      raise exception 'Ya existe una recogida. Confirma explicitamente su reemplazo.';
    end if;
    update public.chat_pickups set status = 'replaced',ended_by = auth.uid(),ended_at = now()
      where id = previous.id;
  elsif p_replace_id is not null then
    raise exception 'La recogida cambio. Actualiza antes de reemplazarla.';
  end if;
  insert into public.chat_pickups(chat_id,proposed_by,pickup_date,start_time,end_time,pickup_place)
    values(c.id,auth.uid(),p_date,p_start,p_end,place) returning * into result;
  return result;
end;
$$;

-- Old clients cannot bypass the seller/place checks through the former RPC.
create or replace function public.propose_chat_pickup(p_chat_id uuid,p_date date,p_start time,p_end time,
  p_replace_id uuid default null)
returns public.chat_pickups language sql security invoker set search_path = '' as $$
  select public.propose_chat_pickup(p_chat_id,p_date,p_start,p_end,p_replace_id,null::text);
$$;

revoke all on function public.propose_chat_pickup(uuid,date,time,time,uuid,text),
  public.propose_chat_pickup(uuid,date,time,time,uuid) from public,anon;
grant execute on function public.propose_chat_pickup(uuid,date,time,time,uuid,text),
  public.propose_chat_pickup(uuid,date,time,time,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
