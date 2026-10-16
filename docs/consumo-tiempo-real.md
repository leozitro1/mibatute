# Tiempo real y consumo de MiBatute

Cambios preparados el 16 de octubre de 2026. No modifican los planes ni los límites de facturación.

## Qué cambia

- El canal privado existente `mb:inbox:user:<uid>` recibe avisos de mensajes, solicitudes, actividad, publicaciones propias, saldo y moderación. Los componentes comparten esos eventos dentro de la página; no abren una suscripción general por componente.
- Las notificaciones de mensajes contienen identificadores y metadatos del artículo, sin el cuerpo del chat ni la justificación del aspirante. El chat abierto sigue recibiendo mensajes con su filtro `chat_id`.
- Recibir un evento actualiza campana, contadores y datos ya cargados sin volver a descargar el feed de notificaciones.
- Enviar un mensaje hace un INSERT con retorno de la fila guardada. La autorización sigue en RLS y en los triggers de venta/donación; no se consulta el perfil y el estado del chat antes de cada envío.
- Al recuperar conexión se sincronizan una vez los datos personales y las notificaciones. El historial del chat usa un cursor `(created_at,id)` y páginas de 100 para recuperar mensajes faltantes. No se añade polling.
- Los acuerdos de recogida se actualizan con las filas del evento o del RPC de escritura, sin consultar de nuevo el historial por cada cambio.
- Las lecturas de pestañas del perfil se comparten mientras están en curso y se conservan hasta 60 segundos en una caché acotada. Los eventos y las escrituras relevantes invalidan esa caché.
- El catálogo y el perfil aprovechan el contador `interested_count` mantenido por la base de datos, en lugar de descargar postulaciones para contarlas.
- La barra recibe moderación desde el estado de usuario compartido; se elimina su consulta periódica. La renovación del token no vuelve a hidratar todo el perfil y se deduplican las notificaciones iniciales de sesión.
- Las tarjetas usan imágenes de 500 píxeles del endpoint de ImageKit configurado. No se alteran URLs firmadas, externas, locales o con recortes especiales; no se crea un proxy en Vercel.

## Catálogo público

Cada visitante del catálogo escucha un solo tema de ciudad/categoría. Una escritura pública envía una señal al tema de la ciudad y al de su categoría, sin copiar participantes, solicitantes o texto de chat. Al cambiar de ciudad/categoría se notifica también al ámbito anterior.

La señal es orientativa: muestra «Hay novedades en las publicaciones». No descarga automáticamente el catálogo ni cambia su orden; la persona pulsa Actualizar. Los temas públicos no se usan para autorizar operaciones ni como fuente de datos privados. El detalle y las acciones siguen sujetos a las validaciones de la base de datos.

Las modificaciones de contadores o timestamps por sí solas no disparan avisos generales del catálogo. Las novedades de publicaciones propias y transacciones sí se entregan por el canal privado.

## Instalación

1. Aplicar primero `supabase/migrations/2026-10-16-market-realtime.sql` en la base correspondiente. Requiere el esquema y las migraciones previas, especialmente `2026-10-16-staff-inbox-signals.sql`, que define las políticas restrictivas de recepción y publicación del tema privado. El SQL es transaccional y puede reaplicarse sin emitir actividad histórica.
2. Desplegar el frontend de este mismo cambio después de la migración. No desplegar únicamente el frontend: reemplaza las antiguas suscripciones de moderación y buzón por los avisos nuevos.
3. Comprobar con dos cuentas solicitudes, reserva/aprobación de venta, chat, recogidas, saldo y reconexión. Una tercera cuenta no debe recibir eventos privados ajenos.

La lista ordenada de SQL de `supabase/config.toml` incluye la nueva migración para nuevas instalaciones locales. Aplicarla localmente no la instala en el proyecto alojado de Supabase. No se necesita otro servicio, dependencia, función de Vercel, cron ni plan.

## Comprobaciones

```sh
npm test
npm run build
node scripts/check-market-realtime-local.mjs
node scripts/check-pickups-local.mjs
EXPECT_ZERO_STATE_READS=true node scripts/check-idle-consumption-local.mjs
```

Las comprobaciones de navegador requieren Supabase local, el servidor de Vite en `127.0.0.1:5174` (o `LOCAL_APP_URL` para la prueba de tiempo real), Playwright y Chromium. Se pueden usar `NODE_PATH` y `PLAYWRIGHT_EXECUTABLE_PATH` para las dependencias ya instaladas. Los scripts locales comprueban el hostname para no ejecutar fixtures sobre producción.

La prueba de tiempo real cuenta las solicitudes HTTP: comprueba que mensajes y solicitudes no vuelvan a leer el feed, que el envío no haga consultas previas, que recogidas no descarguen su historial tras cada evento, y que el chat recupere mensajes al reconectar. Comprueba también ventas, saldo y ausencia de errores del navegador.

La prueba de 65 segundos informa separadamente solicitudes de estado, lotes de métricas e imágenes de patrocinadores. `EXPECT_ZERO_STATE_READS` prohíbe llamadas de estado en ese periodo; **no afirma consumo total cero**. `EXPECT_ZERO_IDLE` conserva su comprobación estricta de cero solicitudes de cualquier clase. Los heartbeats del WebSocket, la renovación legítima de sesión, los lotes de estadísticas y los recursos visibles siguen existiendo.

## Qué medir en producción

Comparar periodos de tráfico similares antes y después: pico de conexiones, mensajes Realtime, transferencia, tiempo de consultas y CPU de Postgres, almacenamiento y uso de funciones/transferencia de Vercel. Broadcast también factura envíos y entregas: estos cambios reducen consultas y destinatarios innecesarios, pero no garantizan menor facturación total frente a tener funciones desactivadas.

Los límites actuales de lectura de notificaciones e historial inicial se conservan. No constituyen una prueba de capacidad para 1.000 usuarios simultáneos. Para la meta de 1.000 registrados hay que observar concurrencia y actividad reales antes de decidir un aumento de recursos.

## Resultado de la validación local

- `npm test`: 203 pruebas correctas, ninguna fallida.
- `npm run build`: compilación correcta.
- Navegador: solicitudes privadas, mensajes sin consultas previas de envío, recogidas sin relecturas, avisos de ventas y saldo, recuperación de mensajes al reconectar y catálogo sin descarga automática; sin errores de página.
- Prueba de recogidas existente: permisos reales, confirmación bilateral, concurrencia y cierre de transacciones correctos. Se actualizó únicamente la creación del fixture de postulación para respetar que la escritura directa del usuario ya estaba revocada por la migración de créditos.
- Avisos administrativos: móvil/escritorio, destinatarios privados, corte temporal de mensajes generales y descarga de cuerpos solo al entrar al buzón, correctos.
- Reposo de 65 segundos: cero llamadas HTTP de estado y cero llamadas `/api/`. Se observaron un lote de métricas de patrocinadores, un lote de métricas del mercado y tres solicitudes de imágenes de patrocinadores. Estos conteos HTTP no miden bytes facturados ni los frames del WebSocket.
- ESLint en archivos modificados: ningún error nuevo frente a `HEAD`; permanecen 21 errores anteriores (había 26 en esos archivos). No se declara que el lint global esté limpio.
- Migración aplicada a Supabase local y comprobada también en PostgreSQL embebido, incluyendo rollback y reaplicación. No aplicada a Supabase alojado y sin despliegue a Vercel en esta tarea.
