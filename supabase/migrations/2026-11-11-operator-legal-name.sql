begin;
do $$
declare previous jsonb; next_documents jsonb;
begin
 select documents into strict previous from public.legal_releases where version='2026-11-10.1' and not enabled;
 if md5(previous::text)<>'f12f05764449c70e744ed4ec032e23ae' then raise exception 'El borrador base no coincide.'; end if;

 next_documents := jsonb_set(previous, '{version}', '"2026-11-11.1"'::jsonb);
 next_documents := jsonb_set(next_documents, '{operator,name}', to_jsonb('Edgar Leonardo Ortiz Diaz'::text));
 next_documents := jsonb_set(next_documents, '{operator,nit}', to_jsonb('79571562-4'::text));
 if md5(next_documents::text)<>'22c5dd382c2fea55de55961fe533aab4' then raise exception 'El nuevo borrador no coincide.'; end if;

 insert into public.legal_releases(version,documents,enabled,published_at)
 values('2026-11-11.1',next_documents,false,clock_timestamp()) on conflict(version) do nothing;
 if not exists(select 1 from public.legal_releases where version='2026-11-11.1' and not enabled and documents=next_documents) then
  raise exception 'La versión existente difiere; no sobrescribir.';
 end if;
end;
$$;
commit;
