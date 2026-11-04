# Chats cerrados: contador y limpieza de 30 días

Implementación revisada por el responsable en local y autorizada para commit y despliegue el 4 de noviembre de 2026. El responsable autorizó después activar el borrado en producción y sustituir la revisión cada quince minutos por una ejecución diaria a las 23:59 de Colombia. Calendario y activación verificados tanto en local como en producción.

- El contador empieza al cerrar/cancelar el chat o marcar la operación entregada. Las solicitudes pendientes, los chats abiertos y la lectura temporal por revisión/bloqueo no lo inician.
- Los chats que ya estaban cerrados cuentan desde su cierre registrado (cancelación, fin de reserva o actualización del cierre); las entregas usan su fecha registrada. Una columna de cierre protegida por trigger conserva esa fecha ante cambios posteriores. Reaplicar la migración o actualizar un chat cerrado no reinicia ese plazo.
- Reabrir un chat de una operación activa retira el contador. Volver a cerrarlo inicia un plazo nuevo.
- La lista de conversaciones y el chat muestran «Se elimina el» y la fecha prevista, en horario de Colombia. El cálculo de borrado usa la fecha del servidor; el contador de la interfaz se actualiza cada minuto mientras la vista está activa, sin consultas periódicas a Supabase.
- Un reporte de chat abierto/en revisión o un caso de venta abierto aplaza la eliminación. Al resolverlo se vuelve a aplicar la fecha original, sin iniciar otros treinta días. La interfaz informa del aplazamiento.
- Un trabajo PostgreSQL revisa vencimientos una vez al día a las 23:59 de Colombia (04:59 UTC), con lotes de hasta 100. No requiere consultas periódicas desde el navegador. El borrado ocurre en la siguiente limpieza tras el vencimiento. Funciona sin mantener abierto el navegador, mientras Supabase local esté encendido; al reiniciar, los vencimientos pendientes se revisarán en el siguiente corte diario. Los chats que venzan después del corte pasan al siguiente.
- Se eliminan el chat, mensajes, lecturas, acuerdos de recogida, reportes de chat ya finalizados con sus copias de mensajes y avisos vinculados. Las publicaciones, registros de operación, créditos y calificaciones se conservan. Las copias de respaldo no se purgan mediante esta función.
- Se mantienen los bloqueos por casos abiertos y se toman bloqueos de artículo/chat sin esperar a operaciones concurrentes. Un contador obsoleto no permite borrar un chat activo.
- Solo PostgreSQL y el rol de servicio pueden ejecutar la limpieza. Un usuario únicamente consulta el contador de sus propios chats; no puede cambiar la fecha, activar el proceso ni borrar otros chats. La auditoría guarda cantidades y fecha, sin copiar mensajes ni lugares.

## Revisión local

En el perfil → Conversaciones, desmarcar Abiertos y abrir un chat cerrado. Su contador aparece también en la lista. Una solicitud pendiente o revisión temporal sigue sin contador. La simulación administrativa refleja treinta días e indica si la limpieza de chats está activa; consultar esa simulación nunca ejecuta borrados.

Pruebas: 399 aprobadas, incluidas ocho del contador, privacidad, reapertura, vencimiento, eliminación en cascada, reportes abiertos, límites y controles desactivados/ausentes. El ejecutor `pg_cron` se comprobó con un trabajo temporal real, finalizado correctamente y retirado después; el calendario se sustituyó después por un único trabajo diario. Tras corregir el inicio al cierre histórico, una conversación local existente supera los treinta días y queda sujeta a la siguiente limpieza; no se ejecuta el borrado como prueba. La API local confirmó la coherencia entre lista y chat y el rechazo de la limpieza por un usuario común. Sin navegador ni capturas locales.

## Publicación posterior

Aplicar, en este orden, `2026-11-04-chat-retention.sql`, `2026-11-04-chat-retention-preview.sql`, `2026-11-04-chat-retention-closure-dates.sql` `2026-11-04-chat-retention-scheduler.sql` y `2026-11-04-chat-retention-daily.sql`. Requiere la extensión oficial `pg_cron`, disponible en Supabase. La primera instalación crea el control `chat_retention_settings.enabled=false`; instalar las migraciones o publicar el frontend no lo activa en producción. La activación del borrado requiere una instrucción expresa posterior, independiente del despliegue del código.

La matriz de conservación se actualizó a treinta días en una nueva versión **en borrador** `2026-11-04.3`, sin sobrescribir la versión anterior ni marcar revisión jurídica como aprobada. Para preparar su snapshot inmutable: `node scripts/prepare-chat-retention-draft.mjs /private/tmp/mibatute-chat-retention-draft.sql`; registrar ese archivo en el entorno correspondiente manteniendo `enabled=false`. El snapshot está registrado en local y producción, siempre como borrador. No modifica el bloqueo de registro ni atribuye consentimientos históricos.

## Activación expresa y calendario diario

El 4 de noviembre de 2026 se aplicó `2026-11-04-chat-retention-daily.sql` en local y producción. La programación es `59 4 * * *` UTC (23:59 Colombia), con un único trabajo activo `mibatute-chat-retention`. Por instrucción expresa se cambió `chat_retention_settings.enabled` a `true` en producción y se registró auditoría `chat.retention_enable`. Se verificaron las funciones de borrado y aplazamiento antes de activar. No se ejecutó una limpieza manual ni se agregaron consultas periódicas desde el navegador. La próxima ejecución diaria aplica los vencimientos y las protecciones existentes.
