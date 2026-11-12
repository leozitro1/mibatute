-- Ejecutar después de instalar 2026-11-10-seller-registration.sql y publicar el formulario.
begin;
do $$
begin
  update public.seller_registration_settings
    set enrollment_open=true where singleton and not enabled;
  if not found then
    raise exception 'Se esperaba que el registro obligatorio estuviera desactivado.';
  end if;
end;
$$;
commit;
select enrollment_open as formulario_abierto, enabled as requisito_activo
from public.seller_registration_settings where singleton;
