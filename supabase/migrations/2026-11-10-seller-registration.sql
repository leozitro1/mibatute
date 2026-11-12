begin;

create table if not exists public.seller_registration_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
alter table public.seller_registration_settings add column if not exists enrollment_open boolean not null default false;
insert into public.seller_registration_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.seller_registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legal_name text not null check(char_length(legal_name) between 3 and 150),
  document_type text not null check(document_type in ('CC','CE','PAS','NIT','OTRO')),
  document_number text not null check(document_number ~ '^[A-Z0-9][A-Z0-9-]{2,24}$'),
  notification_address text not null check(char_length(notification_address) between 8 and 240),
  phone text not null check(phone ~ '^[0-9]{10}$'),
  consent_version text not null,
  consent_at timestamptz not null default clock_timestamp()
);
alter table public.seller_registrations enable row level security;
alter table public.seller_registration_settings enable row level security;
revoke all on public.seller_registrations,public.seller_registration_settings from public,anon,authenticated;

create or replace function public.my_seller_registration_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'enabled',exists(select 1 from public.seller_registration_settings where enabled),
    'enrollmentOpen',exists(select 1 from public.seller_registration_settings where enabled or enrollment_open),
    'ready',exists(select 1 from public.seller_registrations where user_id=auth.uid() and consent_version='seller-2026-11-10.1')
  );
$$;

create or replace function public.my_seller_registration()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(
    (select jsonb_build_object('legalName',legal_name,'documentType',document_type,'documentNumber',document_number,
      'notificationAddress',notification_address,'phone',phone)
     from public.seller_registrations where user_id=auth.uid()),
    (select jsonb_build_object('legalName',nombre,'notificationAddress',direccion,'phone',movil)
     from public.usuarios where id=auth.uid()),'{}'::jsonb
  ) where exists(select 1 from public.seller_registration_settings where enabled or enrollment_open);
$$;

create or replace function public.save_my_seller_registration(p_legal_name text,p_document_type text,p_document_number text,
  p_notification_address text,p_phone text,p_consent boolean,p_consent_version text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); legal_name text:=btrim(coalesce(p_legal_name,''));
        document_number text:=upper(btrim(coalesce(p_document_number,'')));
        notification_address text:=btrim(coalesce(p_notification_address,'')); phone text:=btrim(coalesce(p_phone,''));
begin
  if not exists(select 1 from public.seller_registration_settings where enabled or enrollment_open) then
    raise exception 'El registro de vendedor no está habilitado.' using errcode='42501';
  end if;
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
    or not exists(select 1 from public.usuarios where id=uid and not coalesce(is_blocked,false)
      and not coalesce(bloqueado,false) and (ban_until is null or ban_until<=now())) then
    raise exception 'Necesitas una cuenta habilitada y correo confirmado.' using errcode='42501';
  end if;
  if p_consent is distinct from true or p_consent_version is distinct from 'seller-2026-11-10.1' then
    raise exception 'Confirma el uso de tus datos para el registro de vendedor.' using errcode='22023';
  end if;
  if char_length(legal_name) not between 3 and 150 or char_length(notification_address) not between 8 and 240
    or p_document_type is null or p_document_type not in ('CC','CE','PAS','NIT','OTRO')
    or document_number !~ '^[A-Z0-9][A-Z0-9-]{2,24}$' or phone !~ '^[0-9]{10}$' then
    raise exception 'Revisa el nombre, la identificación, la dirección y el teléfono.' using errcode='22023';
  end if;
  insert into public.seller_registrations(user_id,legal_name,document_type,document_number,notification_address,phone,consent_version)
  values(uid,legal_name,p_document_type,document_number,notification_address,phone,p_consent_version)
  on conflict(user_id) do update set legal_name=excluded.legal_name,document_type=excluded.document_type,
    document_number=excluded.document_number,notification_address=excluded.notification_address,phone=excluded.phone,
    consent_version=excluded.consent_version,consent_at=excluded.consent_at;
end;
$$;

create or replace function public.guard_seller_registration()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.mode is distinct from 'venta' then return new; end if;
  if tg_op='UPDATE' and old.mode='venta' and old.owner_id is not distinct from new.owner_id
    and not (coalesce(nullif(old.estado,''),old.status,'') in ('pausado','vencido','expirado')
      and coalesce(nullif(new.estado,''),new.status,'')='disponible') then return new; end if;
  if exists(select 1 from public.seller_registration_settings where enabled)
    and not exists(select 1 from public.seller_registrations where user_id=new.owner_id and consent_version='seller-2026-11-10.1') then
    raise exception 'Completa el registro de vendedor en Mi perfil para ofrecer un producto.' using errcode='P7501';
  end if;
  return new;
end;
$$;

revoke all on function public.my_seller_registration_status(),public.my_seller_registration(),
  public.save_my_seller_registration(text,text,text,text,text,boolean,text),public.guard_seller_registration() from public,anon,authenticated;
grant execute on function public.my_seller_registration_status(),public.my_seller_registration(),
  public.save_my_seller_registration(text,text,text,text,text,boolean,text) to authenticated;
drop trigger if exists guard_seller_registration on public.articulos;
create trigger guard_seller_registration before insert or update of mode,owner_id,estado,status on public.articulos
  for each row execute function public.guard_seller_registration();
notify pgrst,'reload schema';
commit;
