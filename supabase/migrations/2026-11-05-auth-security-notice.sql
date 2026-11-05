begin;
do $$
declare previous jsonb; next_documents jsonb;
begin
 select documents into strict previous from public.legal_releases where version='2026-11-04.3' and not enabled;
 if md5(previous::text)<>'d2ab7e16d1ba49cabd91996a564419e2' then raise exception 'El borrador base no coincide; no continuar.'; end if;
 next_documents := jsonb_insert(jsonb_insert(jsonb_set(previous, '{version}', '"2026-11-05.1"'::jsonb), '{policies,/privacidad,sections,1}', '["Verificación de seguridad con Cloudflare Turnstile","Al abrir formularios de autenticación cargamos Turnstile de Cloudflare para reducir bots y abuso. Cloudflare recibe señales técnicas como IP, navegador, conexión y origen del sitio; Supabase verifica el token antes de permitir la operación protegida. No enviamos la contraseña como parámetro del widget. Cloudflare trata señales por cuenta del sitio para protegerlo y también como responsable para mejorar su detección de bots, según su aviso de privacidad de Turnstile. Esta verificación no habilita métricas opcionales ni publicidad de MiBatute. La revisión contractual y de destinos internacionales sigue pendiente; no se certifica procesamiento exclusivo en Colombia ni aprobación jurídica definitiva."]'::jsonb), '{policies,/cookies,sections,0}', '["Seguridad de los formularios","Turnstile se carga al abrir formularios de autenticación y procesa señales técnicas para distinguir bots. La espera entre solicitudes se conserva localmente mediante fechas y un contador, sin guardar el correo ni la contraseña. No depende de aceptar métricas opcionales. Consulta Privacidad para conocer el tratamiento de Cloudflare."]'::jsonb);
 if md5(next_documents::text)<>'dd1d02eb2d4fa4b1b99eebec3d05c242' then raise exception 'El nuevo snapshot no coincide.'; end if;
 insert into public.legal_releases(version,documents,enabled,published_at) values('2026-11-05.1',next_documents,false,clock_timestamp()) on conflict(version) do nothing;
 if not exists(select 1 from public.legal_releases where version='2026-11-05.1' and not enabled and documents=next_documents) then raise exception 'La version existente difiere; no sobrescribir.'; end if;
end $$;
commit;
