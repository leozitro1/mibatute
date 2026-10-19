begin;
alter table public.data_rights_requests alter column user_id drop not null;
alter table public.data_rights_requests add column if not exists source text not null default 'web';
alter table public.data_rights_requests add column if not exists requester_contact text;
alter table public.data_rights_requests add column if not exists received_at timestamptz not null default clock_timestamp();
alter table public.data_rights_requests add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.data_rights_requests add column if not exists verification text not null default 'pending';
alter table public.data_rights_requests add column if not exists internal_notes text not null default '';
alter table public.data_rights_requests add column if not exists delivery_confirmed boolean not null default false;
alter table public.data_rights_requests add column if not exists work_revision integer not null default 0;
alter table public.data_rights_requests drop constraint if exists rights_source_check;
alter table public.data_rights_requests add constraint rights_source_check check(
 (source='web' and user_id is not null and requester_contact is null)
 or(source='email' and user_id is null and requester_contact is not null and length(requester_contact) between 3 and 254));
alter table public.data_rights_requests drop constraint if exists rights_verification_check;
alter table public.data_rights_requests add constraint rights_verification_check check(verification in('pending','verified','not_required'));
alter table public.data_rights_requests drop constraint if exists rights_internal_notes_check;
alter table public.data_rights_requests add constraint rights_internal_notes_check check(length(internal_notes)<=500);
-- Preserve the actual original receipt date when upgrading web requests.
update public.data_rights_requests set received_at=created_at where source='web' and work_revision=0 and received_at is distinct from created_at;

create or replace function public.data_requests_inbox(p_staff boolean default false,p_page integer default 1,p_status text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();staff boolean:=coalesce(p_staff,false);total integer;page integer;rows jsonb;
begin
 if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 if staff then perform public.staff_require('access');end if;
 select count(*) into total from public.data_rights_requests where (staff or user_id=uid) and (coalesce(p_status,'')='' or status=p_status or (staff and p_status='pending' and status in('open','reviewing')));
 page:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(total/20.0)::integer));
 select coalesce(jsonb_agg(to_jsonb(r) order by case when staff then r.received_at end asc,case when not staff then r.created_at end desc,r.id),'[]'::jsonb) into rows from(
  select id,kind,body,created_at,status,response,responded_at,received_at,
   case when staff then source else null end as source,
   case when staff then requester_contact else null end as requester_contact,
   case when staff then assigned_to else null end as assigned_to,
   case when staff then (select nombre from public.usuarios where id=assigned_to) else null end as assignee_name,
   case when staff then verification else null end as verification,
   case when staff then internal_notes else null end as internal_notes,
   case when staff then delivery_confirmed else null end as delivery_confirmed,
   case when staff then work_revision else null end as work_revision,
   case when staff then user_id else null end as user_id
  from public.data_rights_requests where (staff or user_id=uid) and (coalesce(p_status,'')='' or status=p_status or (staff and p_status='pending' and status in('open','reviewing')))
  order by case when staff then received_at end asc,case when not staff then created_at end desc,id limit 20 offset(page-1)*20
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
 if previous.assigned_to is distinct from auth.uid() then raise exception 'Toma el caso antes de responder.';end if;
 if p_status='answered' and (previous.verification='pending' or length(btrim(previous.internal_notes))<10) then
  raise exception 'Documenta la verificación y las acciones antes de cerrar el caso.';end if;
 if p_status='answered' and previous.source='email' and not previous.delivery_confirmed then
  raise exception 'Confirma el envío de la respuesta por correo. Este panel no envía correos.';end if;
 if previous.status='answered' then raise exception 'La solicitud ya tiene una respuesta final. No se puede sobrescribir.';end if;
 update public.data_rights_requests set status=p_status,response=answer,responded_at=clock_timestamp(),handled_by=auth.uid(),work_revision=work_revision+1 where id=p_request;
 insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'privacy.respond',p_request,'Atención de solicitud de datos',jsonb_build_object('status',p_status));
end;
$$;

create or replace function public.claim_data_request(p_request uuid,p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.data_rights_requests%rowtype;
begin
 perform public.staff_require('access');
 select * into previous from public.data_rights_requests where id=p_request for update;
 if not found or previous.status='answered' then raise exception 'Caso no disponible para asignación.';end if;
 if previous.assigned_to=auth.uid() then return;end if;
 if previous.work_revision is distinct from p_revision then raise exception 'El caso cambió. Actualiza antes de continuar.';end if;
 update public.data_rights_requests set assigned_to=auth.uid(),work_revision=work_revision+1 where id=p_request;
 insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'privacy.assign',p_request,'Asignación de atención',jsonb_build_object('assigned_to',auth.uid()));
end;
$$;
create or replace function public.update_data_request_work(p_request uuid,p_revision integer,p_verification text,p_notes text,p_delivery boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.data_rights_requests%rowtype;notes text:=btrim(coalesce(p_notes,''));
begin
 perform public.staff_require('access');
 if p_verification is null or p_verification not in('pending','verified','not_required') or length(notes)>500 then raise exception 'Revisa la verificación y las notas de hasta 500 caracteres.';end if;
 select * into previous from public.data_rights_requests where id=p_request for update;
 if not found or previous.status='answered' or previous.assigned_to is distinct from auth.uid() then raise exception 'Caso no disponible o asignado a otra persona.';end if;
 if previous.verification=p_verification and previous.internal_notes=notes and previous.delivery_confirmed=coalesce(p_delivery,false) then return;end if;
 if previous.work_revision is distinct from p_revision then raise exception 'El caso cambió. Actualiza antes de guardar.';end if;
 update public.data_rights_requests set verification=p_verification,internal_notes=notes,delivery_confirmed=coalesce(p_delivery,false),work_revision=work_revision+1 where id=p_request;
 insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'privacy.work',p_request,'Seguimiento interno de atención',jsonb_build_object('verification',p_verification,'delivery_confirmed',coalesce(p_delivery,false)));
end;
$$;
create or replace function public.register_external_data_request(p_request uuid,p_kind text,p_received timestamptz,p_contact text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.data_rights_requests%rowtype;contact text:=btrim(coalesce(p_contact,''));body text:=btrim(coalesce(p_body,''));
begin
 perform public.staff_require('access');
 if p_request is null or p_kind is null or p_kind not in('consultation','correction','deletion','revocation','complaint')
 or p_received is null or p_received>clock_timestamp() or length(contact) not between 3 and 254
 or position('@' in contact)<2 or length(body) not between 10 and 500 then raise exception 'Revisa correo, fecha de recepción y resumen de 10 a 500 caracteres.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,2026101904));
 select * into previous from public.data_rights_requests where id=p_request;
 if found then
  if previous.source<>'email' or previous.kind is distinct from p_kind or previous.received_at is distinct from p_received
  or previous.requester_contact is distinct from contact or previous.body is distinct from body then raise exception 'Identificador de solicitud ya utilizado.';end if;
  return p_request;
 end if;
 insert into public.data_rights_requests(id,user_id,kind,body,source,requester_contact,received_at,assigned_to)
 values(p_request,null,p_kind,body,'email',contact,p_received,auth.uid());
 insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'privacy.register_email',p_request,'Registro manual de solicitud recibida por correo',jsonb_build_object('source','email'));
 return p_request;
end;
$$;
revoke all on function public.claim_data_request(uuid,integer),public.update_data_request_work(uuid,integer,text,text,boolean),public.register_external_data_request(uuid,text,timestamptz,text,text) from public,anon;
grant execute on function public.claim_data_request(uuid,integer),public.update_data_request_work(uuid,integer,text,text,boolean),public.register_external_data_request(uuid,text,timestamptz,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
