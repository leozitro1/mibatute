# Permisos de producción — revisión del 4 de noviembre de 2026

Proyecto confirmado en el panel: `mibatute`, referencia `sgxzjggxlswvpedrosck`, rama `main`. Se ejecutaron cuatro consultas SQL de lectura sobre catálogos de PostgreSQL desde el editor de Supabase. No se consultaron filas de cuentas, saldos, chats o mensajes; tampoco se llamaron funciones de la aplicación ni se probaron escrituras o vaciados. No se alteró la configuración de producción.

## Resultados

- **61 de 61 tablas** de `public` tienen RLS activado. Esto no demuestra que todas sus políticas sean correctas.
- Los roles `anon` y `authenticated` no tienen permiso `CREATE` en el esquema `public`.
- En las tablas revisadas, las políticas de lectura de perfiles privados, créditos e historial limitan el acceso al identificador autenticado. Los chats y mensajes comprueban participantes. Los cambios de participantes y el envío requieren además los triggers de control de ventas/donaciones, observados habilitados.
- `staff_accounts`, `staff_sessions` y `staff_audit` no presentan escrituras directas concedidas a los roles cliente en el inventario revisado. Tampoco se observaron `INSERT`, `UPDATE` o `DELETE` de cliente en `cupos`/`cupos_historial`.
- Se compararon las huellas MD5 de los cuerpos de **26 funciones** seleccionadas con los archivos locales. Coinciden, incluidos roles/MFA, sanciones, compensación de créditos, publicación, reservas, abono Wompi, participantes y mensajes. Para `profile_chat_history(integer,boolean,text)` se reprodujeron las dos sustituciones de `2026-11-04-chat-retention.sql`; su huella resultante `7f8f7176b3441909ee4474ab245a551e` también coincide. La comparación es de cuerpo, no una certificación de toda la firma, dependencias, índices o permisos.
- Las funciones internas revisadas para acreditar Wompi, liquidar créditos y exigir autorización administrativa no tienen ejecución directa para `anon` ni `authenticated`; las APIs de usuario conservan ejecución autenticada. `staff_permission` es consultable, pero su cuerpo comprueba el rol del equipo, MFA y la sesión vigente.
- No se encontraron funciones `SECURITY DEFINER` en `public` sin un `search_path` configurado. Algunas funciones heredadas lo fijan a `public`; esto no equivale a revisar individualmente cada función elevada.

## Permiso sobrante confirmado: TRUNCATE

Los dos roles cliente tienen permiso SQL `TRUNCATE` en **23 tablas reales**, todas propiedad de `postgres`: `article_publication_credits`, `articulo_imagenes`, `articulos`, `chat_messages`, `chat_reads`, `chat_reports`, `chats`, `cupos`, `cupos_extra_donacion`, `cupos_historial`, `donation_application_credits`, `patrocinadores`, `postulacion_historial`, `postulaciones`, `postulaciones_rechazadas`, `recargas_pendientes`, `reports`, `reputacion`, `sale_purchase_credits`, `system_message_receipts`, `system_messages`, `usuarios` y `wompi_topups`.

El listado general de grants contó 52 concesiones en 26 relaciones; la consulta de privilegio efectivo sobre tablas reales confirmó 23 tablas. No se interpreta un grant sobre una vista como capacidad de truncar una tabla real.

RLS no controla `TRUNCATE`. Es un permiso de más que conviene retirar, aunque **no se demostró una vía para ejecutar SQL arbitrario desde la API pública ni una explotación desde el navegador**. No se debe afirmar que cualquier visitante puede vaciar estas tablas con la API actual. [PostgreSQL: alcance de RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

Se preparó y, tras autorización expresa del responsable, se aplicó en producción `supabase/migrations/2026-11-04-revoke-client-truncate.sql`:

- Retira únicamente `TRUNCATE` de `PUBLIC`, `anon` y `authenticated` sobre las relaciones actuales de `public`.
- Retira ese permiso de los defaults de nuevas tablas creadas por `postgres` en `public`.
- Conserva los permisos habituales de lectura/escritura, RLS, datos y el acceso del servidor `service_role`.
- No añade tablas, índices, consultas de aplicación, tareas periódicas ni proveedores. Solo cambia permisos una vez; la transacción tiene límites de espera y ejecución.

También existen defaults propiedad de `supabase_admin`. La migración no intenta asumir ese rol ni promete corregir sus defaults: requieren la vía del proveedor. No cambian los datos actuales. [Supabase: límites de revocación de permisos gestionados](https://supabase.com/kb/troubleshooting/revoking-privileges-on-storage-pg_cron-vault-and-extension-objects-has-no-effect-916576).

## Dos avisos de vistas en el asesor de Supabase

- `usuarios_publicos` usa permisos del propietario y una barrera de seguridad. Su definición selecciona identificador, nombre, ubicación general, foto, estado de bloqueo y verificación; no selecciona correo, móvil, dirección ni mensajes. El acceso elevado es deliberado para ofrecer campos públicos sin abrir la tabla privada completa. Cambiarla a `security_invoker` sin adaptar el diseño puede ocultar perfiles ajenos.
- `reputacion_promedio` calcula identificador, promedio de estrellas y total. No se seleccionan comentarios ni datos de contacto. Puede estudiarse su conversión a invocador con pruebas específicas; no se cambió durante esta auditoría.

Los avisos no se marcaron como resueltos ni se ocultaron.

## Verificación y siguiente paso

La prueba local en PGlite confirma que retirar `TRUNCATE` rechaza intentos de ambos roles, conserva las filas, la lectura limitada por RLS, las operaciones habituales y los privilegios del servidor. Verifica también tablas futuras de `postgres` y reaplicación segura. No se ejecutó contra producción.

Validación: 46 pruebas aprobadas entre el nuevo control de privilegios, administración/MFA y transacciones de venta; ESLint del nuevo archivo y `git diff --check` correctos. Se cerró la pestaña de Supabase al terminar para evitar actividad de fondo.

Aplicación autorizada por el responsable el 4 de noviembre de 2026, junto con commit y despliegue en el proyecto habitual. La transacción terminó correctamente. Una consulta posterior confirmó: cero tablas con `TRUNCATE` efectivo para `anon`/`authenticated`, cero defaults de `postgres` que concedan ese permiso, 61 tablas con RLS, permisos de edición de perfil conservados, acceso de `service_role` conservado y cuerpos de MFA y abono de créditos sin cambios. No se leyeron ni modificaron datos de usuarios para verificarlo.

Validación de la entrega completa: **402 pruebas aprobadas**, compilación correcta y lint de las APIs, componentes y pruebas modificados sin errores. La publicación conserva registro habilitado y recargas reales deshabilitadas. La migración de calendario diario que ya estaba pendiente de commit se conserva como historial; no se ejecuta nuevamente ni se activa una limpieza por esta entrega.
