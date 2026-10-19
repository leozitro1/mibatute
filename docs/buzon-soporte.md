# Buzón de soporte de MiBatute

Migraciones aplicadas a producción el 19 de octubre de 2026 mediante el editor SQL autenticado de Supabase, en una sola transacción y en este orden: `supabase/migrations/2026-10-19-support-inbox.sql` y `supabase/migrations/2026-10-19-support-inbox-hide.sql` en el proyecto `sgxzjggxlswvpedrosck`. La aplicación no incorpora los hilos ficticios del entorno local.

El usuario inicia una conversación desde Perfil → Buzón → Enviar mensaje a MiBatute. Puede abrir una nueva cada 24 horas exactas según el reloj del servidor. El límite se comprueba bajo un bloqueo transaccional por usuario, por lo que varias pestañas o solicitudes simultáneas no lo evitan. Las respuestas en hilos existentes están permitidas; una protección de 15 segundos entre mensajes del usuario evita ráfagas accidentales. El formulario conserva el identificador de envío al reintentar, para no duplicar mensajes.

Admin y superadmin tienen una sección Buzón compartida. Ambos pueden leer y responder, conservando un cursor de lectura independiente por administrador. Se exige la autorización existente con MFA y sesión de personal vigente. El usuario solo puede leer y responder sus propios hilos; no tiene acceso directo a las tablas. Las respuestas públicas identifican al remitente como Equipo MiBatute. Las respuestas del personal quedan registradas en auditoría sin copiar el contenido privado.

## Consumo

- Sin consultas periódicas. Se consulta la lista al abrir el buzón, buscar, paginar, actualizar o recibir un cambio relevante.
- Lista de 20 conversaciones y lectura de los últimos 40 mensajes; mensajes anteriores bajo demanda. Máximo 2000 caracteres por mensaje y 500 mensajes por hilo.
- El usuario reutiliza su canal privado de notificaciones existente. El personal abre un canal privado de metadatos solo mientras tiene su buzón abierto.
- Las señales contienen identificadores y secuencias, nunca cuerpos de mensajes. Las respuestas del personal reutilizan el feed de notificaciones existente.
- Un cambio en otro hilo actualiza la lista sin volver a consultar la conversación abierta. Durante un envío se agrupan los avisos con la actualización final.
- No se agregan funciones de Vercel, correo automático ni archivos adjuntos.

## Validación

Pruebas de PostgreSQL mediante PGlite: aislamiento entre usuarios, límite de 24 horas, reintentos, admin/superadmin con MFA, sesiones revocadas, lecturas independientes, paginación y políticas restrictivas Realtime incluso con otras políticas permisivas. Pruebas de notificaciones verifican que una respuesta nueva vuelva a marcar el hilo como sin leer y que una lectura anterior no oculte una respuesta más reciente.

Prueba manual local: creación de hilo con Cliente 1, bloqueo de segunda conversación, respuesta del usuario dentro de las 24 horas, actualización en tiempo real y apertura desde la campana. Respuestas ficticias de ambos roles añadidas en la base local para comprobar presentación; la autenticación MFA del personal se verificó en pruebas SQL, no mediante un inicio de sesión manual. Anchuras móviles de 320 y 375 px sin desbordamiento horizontal.

El buzón del perfil separa Conversaciones y Avisos del sistema mediante subpestañas accesibles con contadores derivados de las notificaciones existentes. La sección oculta no realiza lecturas ni escucha cambios de soporte; el hilo y los borradores se conservan al cambiar de subpestaña. Los avisos se cargan al abrir su sección. Un clic en la campana selecciona automáticamente la subpestaña correspondiente.


## Eliminar conversación del usuario

La acción está disponible en cada fila y dentro del hilo, con confirmación y posibilidad de cancelar. Solo el propietario puede ejecutarla. Guarda `user_hidden_at` y no elimina mensajes ni el hilo en la base de datos. El hilo deja de aparecer en la lista y la campana del usuario, y no puede abrirse ni responderse usando su identificador. Admin y superadmin conservan todos los mensajes y ven la indicación Eliminada por el usuario; el hilo queda disponible como historial, sin nuevas respuestas.

La eliminación no modifica la fecha original ni permite saltarse las 24 horas. Usa una señal en el canal privado existente para sincronizar otras pestañas. Al reconectar, el feed elimina de la caché los avisos de hilos ocultos, sin borrar respuestas concurrentes posteriores a la consulta. No se agregan consultas periódicas ni canales.

Validación adicional: pruebas SQL de propiedad, idempotencia, conservación de mensajes para ambos roles, exclusión del feed y mantenimiento del plazo; pruebas de sincronización del aviso y caché. En el navegador local se comprobó cancelar y confirmar la eliminación de un hilo ficticio.
