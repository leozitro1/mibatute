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

## Preparación local para crecimiento — 20 de noviembre de 2026

Cambios pendientes de revisión del responsable, sin commit, push ni deploy. No se tocaron producción, planes, permisos de acceso, SMTP ni pagos.

- El catálogo conserva el mismo tema al paginar o cambiar búsqueda/filtros que no cambian ciudad/categoría. Su callback usa la consulta vigente sin recrear suscripciones por cada cambio de formulario.
- El canal público se retira mientras la pestaña está oculta, espera su desconexión antes de volver a crearlo y descarta callbacks antiguos. Al recuperar conexión invalida la caché y señala novedades. Chat y notificaciones privadas siguen funcionando con sus canales existentes; no se añade sondeo. Esto reduce suscripciones/tráfico de catálogo; no equivale a eliminar la conexión privada del usuario autenticado.
- Se verificaron los límites existentes: listado paginado, historial inicial del chat de 50 mensajes, recuperación incremental por cursor, historial de conversaciones de 12 filas, caché acotada del catálogo y ubicaciones, métricas por lotes y presupuestos de ingestión del servidor. No se reducen límites de funciones para aparentar ahorro.
- Cinco índices parciales nuevos cubren las ramas de participantes actuales e históricos de las consultas personales: usuario, comprador, ganador y sus alias. Se mantienen los índices ya existentes de propietario, búsqueda de texto y cursor del chat. No se cambian filas ni RLS. Migración `2026-11-20-growth-participant-indexes.sql` instalada y verificada únicamente en la base local; incluida al final de la semilla local.
- Se conservan los ajustes de imágenes de esta revisión: reutilizar un archivo ya generado por nuestro canvas sin volver a codificarlo, liberar recursos de procesamiento, avatares diferidos y caché temporal de URLs autorizadas separada por cliente, cuenta y token. La caché no utiliza almacenamiento persistente, no atiende visitantes anónimos ni sesiones vencidas y no omite permisos de subida.

### Verificación reproducible por terminal

`npm run local:check-growth` crea una base PostgreSQL/WASM aislada en memoria, con 10.000 cuentas y 100.000 artículos sintéticos; no realiza peticiones HTTP ni conecta con Supabase/Vercel. Compara resultados y planes antes/después de los índices y comprueba que reaplicarlos es seguro. En la ejecución del 20 de noviembre:

| Consulta | Filas ajenas filtradas antes | Después | Tiempo local antes → después |
|---|---:|---:|---:|
| Publicaciones de los participantes | 99.986 | 0 | 23,283 ms → 0,129 ms |
| Compras del usuario | 99.996 | 0 | 17,629 ms → 0,059 ms |

Son medidas de dos consultas sintéticas en esta máquina; no predicen tiempos de producción, cuotas de facturación ni capacidad de 10.000 sesiones simultáneas. Los resultados y su orden se conservaron. Los índices sí tienen un costo adicional de espacio y mantenimiento en escrituras, a cambio de evitar recorridos completos para esas consultas.

Pruebas adicionales: 1.000 consumidores lógicos de un mismo avatar comparten una autorización; 1.000 catálogos ocultos no crean canales. Son pruebas con clientes simulados, no 1.000 usuarios conectados a la web real. Conjunto completo: **488 pruebas aprobadas**, compilación correcta, lint de módulos nuevos sin errores y diferencias sin problemas de formato. Sin navegador ni capturas.

### Seguimiento pendiente antes de una prueba real de concurrencia

Las alertas de los paneles no se modificaron. Antes de abrir una prueba de tráfico real, revisar en Supabase y Vercel las cuotas vigentes y avisos al 50/75/90 %, separando egress con/sin caché, Realtime, cómputo e invocaciones. Evaluar visitas activas, mensajes y fotos vistas por sesión, no solo cuentas registradas. Hacer una prueba controlada primero con pocos clientes y ampliar por etapas según latencia, errores y consumo medidos, con permiso explícito antes de generar carga sobre producción. Estos cambios no garantizan que 10.000 personas conectadas simultáneamente quepan en el plan actual.

### Publicación autorizada del 20 de noviembre

El responsable autoriza commit/push en main y deploy del conjunto de mejoras de frontend en el proyecto Vercel habitual. Se conserva la migración de índices en el commit, pero su aplicación a producción está pendiente de acceso administrativo a Supabase: la CLI no tiene sesión y no se usa el navegador interno, de acuerdo con las normas vigentes. Se solicitó iniciar sesión con la CLI; el frontend es compatible con el esquema anterior y sus mejoras de imágenes/suscripciones no dependen de esos índices. La base local sí los tiene instalados y verificados. No declarar la mejora SQL como activa en producción hasta aplicar y comprobar los cinco índices.

Para aplicar tras habilitar el acceso, usar exclusivamente `supabase/migrations/2026-11-20-growth-participant-indexes.sql` en el proyecto habitual y verificar sus cinco índices válidos en `pg_indexes`/`pg_index`. No ejecutar un `db push` masivo: el repositorio contiene migraciones históricas con nombres heredados. No se generará carga de usuarios contra producción para comprobar este deploy.
