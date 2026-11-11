begin;
do $$
declare previous jsonb; next_documents jsonb;
begin
 select documents into strict previous from public.legal_releases where version='2026-11-05.1' and not enabled;
 if md5(previous::text)<>'dd1d02eb2d4fa4b1b99eebec3d05c242' then raise exception 'El borrador base no coincide.'; end if;
 next_documents:=jsonb_set(jsonb_set(previous,'{version}',to_jsonb('2026-11-11.2'::text)),'{operator}','{"name":"Edgar Leonardo Ortiz Diaz","entityType":"natural","nit":"79571562-4","address":"Transversal 96B 20D 70, Bogotá, Colombia","phone":"6015727978","email":"info@mibatute.com","dataEmail":"info@mibatute.com","emailVerified":true,"identityOnRequest":false}'::jsonb);
 if md5(next_documents::text)<>'2e48e13fa96fe2214d1e1195d86c0187' then raise exception 'El nuevo borrador no coincide.'; end if;
 insert into public.legal_releases(version,documents,enabled,published_at) values('2026-11-11.2',next_documents,false,clock_timestamp()) on conflict(version) do nothing;
 if not exists(select 1 from public.legal_releases where version='2026-11-11.2' and not enabled and documents=next_documents) then raise exception 'La versión existente difiere.'; end if;
end;
$$;
commit;
