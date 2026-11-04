begin;
-- Historical rows stay NULL: no new choice is inferred from an old version string.
alter table public.legal_consents add column if not exists terms_accepted boolean;
alter table public.legal_consents add column if not exists privacy_accepted boolean;
alter table public.legal_consents add column if not exists terms_version text;
alter table public.legal_consents add column if not exists privacy_version text;

create or replace function public.capture_registration_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare release public.legal_releases%rowtype;acceptance jsonb:=new.raw_user_meta_data->'legal_acceptance';
begin
 select * into release from public.legal_releases where enabled order by published_at desc nulls last,version desc limit 1;
 if not found or release.documents='{}'::jsonb then raise exception 'El registro estará disponible cuando se publiquen las políticas definitivas.';end if;
 if acceptance->'terms_accepted' is distinct from 'true'::jsonb
  or acceptance->'privacy_accepted' is distinct from 'true'::jsonb
  or acceptance->>'terms_version' is distinct from release.version
  or acceptance->>'privacy_version' is distinct from release.version
  or acceptance->'adult_confirmed' is distinct from 'true'::jsonb then
  raise exception 'Debes aceptar los términos, autorizar el tratamiento necesario y confirmar que eres mayor de 18 años.';
 end if;
 insert into public.legal_consents(user_id,version,adult_confirmed,source,terms_accepted,privacy_accepted,terms_version,privacy_version) values(new.id,release.version,true,'registration',true,true,release.version,release.version);
 return new;
end;
$$;

create or replace function public.capture_testing_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare acceptance jsonb:=new.raw_user_meta_data->'legal_acceptance';release public.legal_releases%rowtype;
begin
 if acceptance->>'review_status' is distinct from 'draft'
  or acceptance->'terms_accepted' is distinct from 'true'::jsonb
  or acceptance->'privacy_accepted' is distinct from 'true'::jsonb
  or acceptance->'adult_confirmed' is distinct from 'true'::jsonb
  or acceptance->>'terms_version' is distinct from acceptance->>'privacy_version' then return new;end if;
 select * into release from public.legal_releases where version=acceptance->>'terms_version' and not enabled and documents->>'reviewStatus'='draft';
 if not found then return new;end if;
 insert into public.legal_consents(user_id,version,adult_confirmed,source,terms_accepted,privacy_accepted,terms_version,privacy_version) values(new.id,release.version,true,'testing',true,true,release.version,release.version) on conflict(user_id,version) do nothing;
 return new;
end;
$$;

create or replace function public.accept_legal_release(p_version text,p_terms boolean,p_privacy boolean,p_adult boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 if p_terms is distinct from true or p_privacy is distinct from true or p_adult is distinct from true
 or not exists(select 1 from public.legal_releases where version=p_version and enabled and documents<>'{}'::jsonb)
 then raise exception 'Revisa las autorizaciones y la versión vigente.';end if;
 insert into public.legal_consents(user_id,version,adult_confirmed,source,terms_accepted,privacy_accepted,terms_version,privacy_version) values(auth.uid(),p_version,true,'renewal',true,true,p_version,p_version) on conflict(user_id,version) do update
 set terms_accepted=true,privacy_accepted=true,terms_version=excluded.terms_version,privacy_version=excluded.privacy_version,accepted_at=clock_timestamp(),source='renewal'
 where public.legal_consents.terms_accepted is distinct from true or public.legal_consents.privacy_accepted is distinct from true or public.legal_consents.terms_version is distinct from excluded.terms_version or public.legal_consents.privacy_version is distinct from excluded.privacy_version;
end;
$$;

create or replace function public.legal_consent_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare release public.legal_releases%rowtype;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 select * into release from public.legal_releases where enabled order by published_at desc nulls last,version desc limit 1;
 return jsonb_build_object('version',release.version,'required',release.version is not null and not exists(
   select 1 from public.legal_consents where user_id=auth.uid() and version=release.version and source in('registration','renewal') and terms_accepted is true and privacy_accepted is true and terms_version=release.version and privacy_version=release.version));
end;
$$;

create or replace function public.guard_legal_topup()
returns trigger language plpgsql security definer set search_path='' as $$
declare release public.legal_releases%rowtype;accepted timestamptz;
begin
 select * into release from public.legal_releases where enabled and documents<>'{}'::jsonb order by published_at desc nulls last,version desc limit 1;
 if not found then raise exception 'Las recargas requieren condiciones definitivas publicadas.';end if;
 if auth.uid() is null or new.usuario_id is distinct from auth.uid() then raise exception 'Cuenta no autorizada.' using errcode='42501';end if;
 select accepted_at into accepted from public.legal_consents where user_id=new.usuario_id and version=release.version and source in('registration','renewal') and terms_accepted is true and privacy_accepted is true and terms_version=release.version and privacy_version=release.version;
 if accepted is null then raise exception 'Revisa y acepta la versión vigente de las condiciones antes de recargar.';end if;
 new.legal_version:=release.version;new.legal_accepted_at:=accepted;
 return new;
end;
$$;

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
   or coalesce(new.documents#>>'{operator,nit}','')=''
   or coalesce(new.documents#>>'{operator,dataEmail}','')=''
   or not coalesce((new.documents->'policies') ?& array['/terminos','/privacidad','/pagos'],false) then
   raise exception 'Faltan identidad, contacto o documentos completos de la versión legal.';
  end if;
  if new.published_at is null then new.published_at:=clock_timestamp();end if;
 end if;
 return new;
end;
$$;

-- Existing triggers and permissions remain; no release, registration block or deletion is activated.
notify pgrst,'reload schema';
commit;
