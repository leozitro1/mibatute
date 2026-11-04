-- Manual account review. Private identity data never lives in public profiles.
create table if not exists public.account_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(char_length(full_name) between 5 and 150),
 document_number text not null check(document_number ~ '^[0-9]{5,12}$'),
 issue_date date not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 revision integer not null default 1,
 consent_at timestamptz not null default now(),
 consent_version text not null default 'manual-2026-11-04',
 submitted_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_note text not null default ''
);
create index if not exists account_verifications_queue_idx on public.account_verifications(status,submitted_at,user_id);
create unique index if not exists account_verifications_approved_document_idx on public.account_verifications(document_number) where status='approved';
alter table public.account_verifications enable row level security;
revoke all on public.account_verifications from public,anon,authenticated;
grant all on public.account_verifications to service_role;

create or replace function public.my_account_verification()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('status',status,'full_name',full_name,
 'document_number',document_number,'issue_date',issue_date,'review_note',review_note,
 'submitted_at',submitted_at,'reviewed_at',reviewed_at)
 from public.account_verifications where user_id=auth.uid()),'{"status":"unverified"}'::jsonb);
$$;

create or replace function public.submit_account_verification(p_full_name text,p_document_number text,p_issue_date date,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.account_verifications%rowtype; legal_name text:=btrim(p_full_name);
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
 or exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado or ban_until>now())) then
 raise exception 'Confirma tu correo y verifica que tu cuenta esté habilitada.' using errcode='42501'; end if;
 if p_consent is distinct from true then raise exception 'Debes autorizar el uso de los datos para esta revisión.'; end if;
 if legal_name is null or char_length(legal_name) not between 5 and 150 or legal_name !~ '[[:alpha:]].*[[:space:]].*[[:alpha:]]'
 or p_document_number is null or p_document_number !~ '^[0-9]{5,12}$'
 or p_issue_date is null or p_issue_date<date '1900-01-01' or p_issue_date>current_date then
 raise exception 'Revisa el nombre completo, la cédula y la fecha de expedición.'; end if;
 -- Serialize first submissions as well as retries, without exposing document numbers.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,704));
 select * into existing from public.account_verifications where user_id=uid for update;
 if existing.status in ('pending','approved') then raise exception 'Ya tienes una solicitud en revisión o una cuenta verificada.'; end if;
 insert into public.account_verifications(user_id,full_name,document_number,issue_date)
 values(uid,legal_name,p_document_number,p_issue_date)
 on conflict(user_id) do update set full_name=excluded.full_name,document_number=excluded.document_number,
 issue_date=excluded.issue_date,status='pending',revision=account_verifications.revision+1,
 consent_at=now(),consent_version='manual-2026-11-04',submitted_at=now(),reviewed_at=null,reviewed_by=null,review_note='';
 return public.my_account_verification();
end;
$$;

create or replace function public.staff_account_verifications(p_status text default 'pending',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.staff_require('users');
 if p_status is null or p_status not in ('pending','approved','rejected') or p_page is null or p_page<1 then raise exception 'Filtro inválido.'; end if;
 return jsonb_build_object('total',(select count(*) from public.account_verifications where status=p_status),
 'rows',coalesce((select jsonb_agg(to_jsonb(q)) from (
 select v.*,u.nombre as profile_name from public.account_verifications v left join public.usuarios u on u.id=v.user_id
 where v.status=p_status order by v.submitted_at,v.user_id limit 20 offset (p_page-1)*20) q),'[]'::jsonb));
end;
$$;

create or replace function public.staff_review_account_verification(p_user_id uuid,p_revision integer,p_decision text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.account_verifications%rowtype;
begin
 if not public.staff_permission('users') or p_user_id=auth.uid() then raise exception 'Acceso no autorizado. No puedes revisar tu propia cuenta.' using errcode='42501'; end if;
 perform public.staff_require('users');
 if p_decision is null or p_decision not in ('approved','rejected') or p_note is null or char_length(btrim(p_note)) not between 10 and 500 then
 raise exception 'Indica la decisión y un motivo de 10 a 500 caracteres.'; end if;
 select * into previous from public.account_verifications where user_id=p_user_id for update;
 if not found or p_revision is distinct from previous.revision or (previous.status<>'pending' and not(previous.status='approved' and p_decision='rejected')) then
 raise exception 'La solicitud cambió. Actualiza antes de revisarla.'; end if;
 begin
 update public.account_verifications set status=p_decision,revision=revision+1,reviewed_at=now(),reviewed_by=auth.uid(),review_note=btrim(p_note) where user_id=p_user_id;
 exception when unique_violation then raise exception 'Esta cédula ya tiene una cuenta verificada. Revisa el caso antes de continuar.';
 end;
 -- Audit contains the decision, never the cedula, name, date or review note.
 insert into public.staff_audit(actor_id,action,target_id,reason,changes)
 values(auth.uid(),'identity.'||p_decision,p_user_id,'Revisión manual de cuenta',jsonb_build_object('from',previous.status,'to',p_decision,'revision',previous.revision));
end;
$$;

create or replace function public.account_is_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_verifications v join public.usuarios u on u.id=v.user_id
 where v.user_id=p_user_id and v.status='approved' and not coalesce(u.is_blocked,false)
 and not coalesce(u.bloqueado,false) and (u.ban_until is null or u.ban_until<=now()));
$$;

revoke all on function public.my_account_verification(),public.submit_account_verification(text,text,date,boolean),public.staff_account_verifications(text,integer),public.staff_review_account_verification(uuid,integer,text,text),public.account_is_verified(uuid) from public,anon,authenticated;
grant execute on function public.my_account_verification(),public.submit_account_verification(text,text,date,boolean),public.staff_account_verifications(text,integer),public.staff_review_account_verification(uuid,integer,text,text) to authenticated;
grant execute on function public.account_is_verified(uuid) to anon,authenticated;
