begin;
create table if not exists public.legal_releases(
 version text primary key,enabled boolean not null default false,
 documents jsonb not null default '{}',published_at timestamptz
);
insert into public.legal_releases(version) values('2026-10-19.1') on conflict do nothing;
create or replace function public.protect_legal_release()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.published_at is not null and (new.documents is distinct from old.documents or new.version is distinct from old.version or new.published_at is distinct from old.published_at) then
  raise exception 'Una versión publicada es inmutable. Publica otra versión para cambiar sus documentos.';
 end if;
 if new.enabled then
  if new.documents->>'reviewStatus'='draft' then raise exception 'Una version de pruebas no se puede activar como aprobada. Publica una version definitiva nueva.';end if;
  if new.documents->>'version' is distinct from new.version
   or coalesce(new.documents#>>'{operator,name}','')=''
   or coalesce(new.documents#>>'{operator,entityType}','')=''
   or coalesce(new.documents#>>'{operator,address}','')=''
   or coalesce(new.documents#>>'{operator,phone}','')=''
   or coalesce(new.documents#>>'{operator,email}','')=''
   or not coalesce((new.documents->'policies') ?& array['/terminos','/privacidad','/pagos'],false) then
   raise exception 'Faltan identidad, contacto o documentos completos de la versión legal.';
  end if;
  if new.published_at is null then new.published_at:=clock_timestamp();end if;
 end if;
 return new;
end;
$$;
revoke all on function public.protect_legal_release() from public,anon,authenticated;
drop trigger if exists protect_legal_release on public.legal_releases;
create trigger protect_legal_release before insert or update on public.legal_releases for each row execute function public.protect_legal_release();
create table if not exists public.legal_consents(
 id bigint generated always as identity primary key,user_id uuid references auth.users(id) on delete set null,
 version text not null references public.legal_releases(version),accepted_at timestamptz not null default clock_timestamp(),
 adult_confirmed boolean not null check(adult_confirmed),source text not null check(source in('registration','renewal')),
 unique(user_id,version)
);
alter table public.legal_releases enable row level security;
alter table public.legal_consents enable row level security;
revoke all on public.legal_releases,public.legal_consents from public,anon,authenticated;
revoke all on sequence public.legal_consents_id_seq from public,anon,authenticated;
grant all on public.legal_releases,public.legal_consents to service_role;
grant all on sequence public.legal_consents_id_seq to service_role;

create or replace function public.capture_registration_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare release public.legal_releases%rowtype;acceptance jsonb:=new.raw_user_meta_data->'legal_acceptance';
begin
 select * into release from public.legal_releases where enabled order by published_at desc nulls last,version desc limit 1;
 if not found or release.documents='{}'::jsonb then raise exception 'El registro estará disponible cuando se publiquen las políticas definitivas.';end if;
 if acceptance->>'terms_version' is distinct from release.version
  or acceptance->>'privacy_version' is distinct from release.version
  or acceptance->'adult_confirmed' is distinct from 'true'::jsonb then
  raise exception 'Debes aceptar los términos, autorizar el tratamiento necesario y confirmar que eres mayor de 18 años.';
 end if;
 insert into public.legal_consents(user_id,version,adult_confirmed,source) values(new.id,release.version,true,'registration');
 return new;
end;
$$;
revoke all on function public.capture_registration_consent() from public,anon,authenticated;
-- The strict registration trigger is installed only by the final legal release script.
-- Creating support/rights infrastructure must not close functional testing signup.

create or replace function public.legal_consent_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare release public.legal_releases%rowtype;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 select * into release from public.legal_releases where enabled order by published_at desc nulls last,version desc limit 1;
 return jsonb_build_object('version',release.version,'required',release.version is not null and not exists(
   select 1 from public.legal_consents where user_id=auth.uid() and version=release.version and source in('registration','renewal')));
end;
$$;
create or replace function public.accept_legal_release(p_version text,p_terms boolean,p_privacy boolean,p_adult boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 if p_terms is distinct from true or p_privacy is distinct from true or p_adult is distinct from true
 or not exists(select 1 from public.legal_releases where version=p_version and enabled and documents<>'{}'::jsonb)
 then raise exception 'Revisa las autorizaciones y la versión vigente.';end if;
 insert into public.legal_consents(user_id,version,adult_confirmed,source) values(auth.uid(),p_version,true,'renewal') on conflict(user_id,version) do nothing;
end;
$$;
revoke all on function public.legal_consent_status(),public.accept_legal_release(text,boolean,boolean,boolean) from public,anon;
grant execute on function public.legal_consent_status(),public.accept_legal_release(text,boolean,boolean,boolean) to authenticated;

create table if not exists public.data_rights_requests(
 id uuid primary key,user_id uuid not null references auth.users(id),kind text not null check(kind in('consultation','correction','deletion','revocation','complaint')),
 body text not null check(length(body) between 10 and 500),created_at timestamptz not null default clock_timestamp(),
 status text not null default 'open' check(status in('open','reviewing','answered')),
 response text check(length(response) between 10 and 500),responded_at timestamptz,handled_by uuid references auth.users(id) on delete set null
);
create index if not exists data_rights_owner_idx on public.data_rights_requests(user_id,created_at desc,id);
create index if not exists data_rights_queue_idx on public.data_rights_requests(status,created_at,id);
alter table public.data_rights_requests enable row level security;
revoke all on public.data_rights_requests from public,anon,authenticated;
grant all on public.data_rights_requests to service_role;

create or replace function public.submit_data_request(p_request uuid,p_kind text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.data_rights_requests%rowtype;uid uuid:=auth.uid();body text:=btrim(coalesce(p_body,''));
begin
 if uid is null then raise exception 'Inicia sesión o utiliza el correo de atención.' using errcode='42501';end if;
 if p_request is null or p_kind is null or p_kind not in('consultation','correction','deletion','revocation','complaint') or length(body) not between 10 and 500 then raise exception 'Revisa el tipo y escribe entre 10 y 500 caracteres.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,2026101904));
 select * into previous from public.data_rights_requests where id=p_request;
 if found then
  if previous.user_id is distinct from uid or previous.kind is distinct from p_kind or previous.body is distinct from body then raise exception 'Identificador de solicitud ya utilizado.';end if;
  return p_request;
 end if;
 insert into public.data_rights_requests(id,user_id,kind,body) values(p_request,uid,p_kind,body);
 return p_request;
end;
$$;

create or replace function public.data_requests_inbox(p_staff boolean default false,p_page integer default 1,p_status text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();staff boolean:=coalesce(p_staff,false);total integer;page integer;rows jsonb;
begin
 if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 if staff then perform public.staff_require('access');end if;
 select count(*) into total from public.data_rights_requests where (staff or user_id=uid) and (coalesce(p_status,'')='' or status=p_status);
 page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/20.0)::integer));
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id),'[]'::jsonb) into rows from(
  select id,kind,body,created_at,status,response,responded_at,
   case when staff then user_id else null end as user_id
  from public.data_rights_requests where (staff or user_id=uid) and (coalesce(p_status,'')='' or status=p_status)
  order by created_at desc,id limit 20 offset(page-1)*20
 )r;
 return jsonb_build_object('rows',rows,'page',page,'pages',greatest(1,ceil(total/20.0)::integer),'total',total);
end;
$$;

create or replace function public.respond_data_request(p_request uuid,p_status text,p_response text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.data_rights_requests%rowtype;answer text:=btrim(coalesce(p_response,''));
begin
 perform public.staff_require('access');
 if p_status is null or p_status not in('reviewing','answered') or length(answer) not between 10 and 500 then raise exception 'Indica el estado y una respuesta de 10 a 500 caracteres.';end if;
 select * into previous from public.data_rights_requests where id=p_request for update;
 if not found then raise exception 'Solicitud no disponible.';end if;
 if previous.status=p_status and previous.response=answer then return;end if;
 if previous.status='answered' then raise exception 'La solicitud ya tiene una respuesta final. No se puede sobrescribir.';end if;
 update public.data_rights_requests set status=p_status,response=answer,responded_at=clock_timestamp(),handled_by=auth.uid() where id=p_request;
 insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'privacy.respond',p_request,'Atención de solicitud de datos',jsonb_build_object('status',p_status));
end;
$$;
revoke all on function public.submit_data_request(uuid,text,text),public.data_requests_inbox(boolean,integer,text),public.respond_data_request(uuid,text,text) from public,anon;
grant execute on function public.submit_data_request(uuid,text,text),public.data_requests_inbox(boolean,integer,text),public.respond_data_request(uuid,text,text) to authenticated;
-- A direct RPC call must not bypass the draft/legal-consent gate for new orders.
create or replace function public.guard_legal_topup()
returns trigger language plpgsql security definer set search_path='' as $$
declare release public.legal_releases%rowtype;accepted timestamptz;
begin
 select * into release from public.legal_releases where enabled and documents<>'{}'::jsonb order by published_at desc nulls last,version desc limit 1;
 if not found then raise exception 'Las recargas requieren condiciones definitivas publicadas.';end if;
 if auth.uid() is null or new.usuario_id is distinct from auth.uid() then raise exception 'Cuenta no autorizada.' using errcode='42501';end if;
 select accepted_at into accepted from public.legal_consents where user_id=new.usuario_id and version=release.version and source in('registration','renewal');
 if accepted is null then raise exception 'Revisa y acepta la versión vigente de las condiciones antes de recargar.';end if;
 new.legal_version:=release.version;new.legal_accepted_at:=accepted;
 return new;
end;
$$;
revoke all on function public.guard_legal_topup() from public,anon,authenticated;
do $$ begin
 if to_regclass('public.wompi_topups') is not null then
  alter table public.wompi_topups add column if not exists legal_version text references public.legal_releases(version);
  alter table public.wompi_topups add column if not exists legal_accepted_at timestamptz;
  drop trigger if exists guard_legal_topup on public.wompi_topups;
  create trigger guard_legal_topup before insert on public.wompi_topups for each row execute function public.guard_legal_topup();
 end if;
end;$$;

notify pgrst,'reload schema';
commit;
