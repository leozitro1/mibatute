begin;

-- A bounded record per account, not a growing audit log or a per-minute cron.
create table if not exists public.image_upload_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 issued_at timestamptz[] not null default '{}',
 profile_issued_at timestamptz[] not null default '{}',
 updated_at timestamptz not null default now(),
 check(cardinality(issued_at)<=120),
 check(cardinality(profile_issued_at)<=4)
);
alter table public.image_upload_limits enable row level security;
revoke all on public.image_upload_limits from public,anon,authenticated;
grant all on public.image_upload_limits to service_role;

create or replace function public.reserve_image_upload(p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); stamp timestamptz; current_row public.image_upload_limits%rowtype;
 recent timestamptz[]; profiles timestamptz[]; burst timestamptz[];
 retry_at timestamptz; candidate timestamptz; reason text;
begin
 if uid is null then raise exception 'Inicia sesión para subir imágenes.' using errcode='42501';end if;
 if p_scope is null or p_scope not in ('articulos','perfiles') then raise exception 'Destino de imagen no válido.' using errcode='22023';end if;
 if exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado or ban_until>now())) then
  raise exception 'Tu cuenta no puede subir imágenes.' using errcode='42501';
 end if;
 insert into public.image_upload_limits(user_id) values(uid) on conflict(user_id) do nothing;
 -- Serializes both scopes and first-use races for this account across API instances.
 select * into current_row from public.image_upload_limits where user_id=uid for update;
 stamp:=clock_timestamp();
 select coalesce(array_agg(t order by t),'{}'::timestamptz[]) into recent
  from unnest(current_row.issued_at) t where t>stamp-interval '24 hours';
 select coalesce(array_agg(t order by t),'{}'::timestamptz[]) into profiles
  from unnest(current_row.profile_issued_at) t where t>stamp-interval '24 hours';
 select coalesce(array_agg(t order by t),'{}'::timestamptz[]) into burst
  from unnest(recent) t where t>stamp-interval '10 minutes';
 if cardinality(recent)>=120 then retry_at:=recent[1]+interval '24 hours';reason:='daily';end if;
 if cardinality(burst)>=20 then
  candidate:=burst[1]+interval '10 minutes';
  if retry_at is null or candidate>retry_at then retry_at:=candidate;reason:='burst';end if;
 end if;
 if p_scope='perfiles' and cardinality(profiles)>=4 then
  candidate:=profiles[1]+interval '24 hours';
  if retry_at is null or candidate>retry_at then retry_at:=candidate;reason:='profile';end if;
 end if;
 if retry_at is not null then
  return jsonb_build_object('allowed',false,'limit',reason,'retryAt',retry_at,
   'retryAfter',greatest(1,ceil(extract(epoch from retry_at-stamp))::integer));
 end if;
 update public.image_upload_limits set issued_at=array_append(recent,stamp),
  profile_issued_at=case when p_scope='perfiles' then array_append(profiles,stamp) else profiles end,
  updated_at=stamp where user_id=uid;
 return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.reserve_image_upload(text) from public,anon,authenticated;
grant execute on function public.reserve_image_upload(text) to authenticated;

notify pgrst,'reload schema';
commit;
