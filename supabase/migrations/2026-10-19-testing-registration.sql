begin;
alter table public.legal_consents drop constraint if exists legal_consents_source_check;
alter table public.legal_consents add constraint legal_consents_source_check check(source in('registration','renewal','testing'));

-- Preserve explicit acknowledgement of the draft, without claiming final approval.
-- Older clients can still register: no acknowledgement is invented for them.
create or replace function public.capture_testing_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare acceptance jsonb:=new.raw_user_meta_data->'legal_acceptance';release public.legal_releases%rowtype;
begin
 if acceptance->>'review_status' is distinct from 'draft'
  or acceptance->'adult_confirmed' is distinct from 'true'::jsonb
  or acceptance->>'terms_version' is distinct from acceptance->>'privacy_version' then return new;end if;
 select * into release from public.legal_releases where version=acceptance->>'terms_version' and not enabled and documents->>'reviewStatus'='draft';
 if not found then return new;end if;
 insert into public.legal_consents(user_id,version,adult_confirmed,source) values(new.id,release.version,true,'testing') on conflict(user_id,version) do nothing;
 return new;
end;
$$;
revoke all on function public.capture_testing_registration() from public,anon,authenticated;
-- This is a separate, non-blocking capture. Do not disable any existing trigger.
do $$begin
 if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='capture_testing_registration' and not tgisinternal) then
  create trigger capture_testing_registration after insert on auth.users for each row execute function public.capture_testing_registration();
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
