# MiBatute en local

La interfaz es la misma aplicacion React del proyecto Vercel `mibatute`.
Supabase local ejecuta PostgreSQL, Auth, Storage, Realtime y el buzon de
correo de pruebas en Docker. No requiere crear organizaciones en la nube.

## Iniciar

Con Docker Desktop abierto:

```sh
npm run local:setup
npm run dev
```

La primera ejecucion descarga las imagenes oficiales de Supabase y las
fotos de ejemplo. Luego las fotos y los datos quedan guardados localmente.
La configuracion `.env.development.local` se genera automaticamente y esta
excluida de Git. La clave administrativa solo se usa en el proceso de carga;
no se guarda ni se entrega al navegador.

- Pagina: http://127.0.0.1:5173
- Supabase Studio: http://127.0.0.1:54323
- Buzon de correos: http://127.0.0.1:54324
- Vendedor: `vendedor@example.com`, clave `123456`.
- Comprador: `comprador@example.com`, clave `123456`.
- Clientes 1 a 4: `cliente1@example.com`, `cliente2@example.com`,
  `cliente3@example.com` y `cliente4@example.com`, clave `123456`.
  Cada cliente tiene tres articulos propios: una venta y dos donaciones.

La cabecera permite elegir busqueda Relacionados o Especifica. Relacionados
amplia prefijos conocidos como bici/bicicleta/ciclismo, celular/telefono y
computador/portatil/laptop. Los accesorios deben mencionar ese concepto en
su titulo, descripcion o categoria; un casco de moto no coincide con bici.
Las coincidencias directas aparecen primero. El saldo de creditos junto al
perfil se actualiza con la respuesta de cada gasto, al recibir un aviso de
creditos y al volver a la ventana si la ultima lectura tiene al menos un
minuto. No realiza consultas periodicas en reposo ni al leer otros avisos.
La migracion `2026-10-08-related-article-search.sql` se aplica despues de
`2026-10-08-home-article-search.sql`; tambien esta incluida en el setup local.
Para comprobar la cabecera con un articulo temporal y sesion real:
`node scripts/check-header-local.mjs` (requiere Playwright).

`EXPECT_ZERO_IDLE=true node scripts/check-idle-consumption-local.mjs`
verifica 65 segundos sin consultas a Supabase ni `/api/`, despues de cargar
la sesion. `node scripts/check-credit-balance-local.mjs` verifica un gasto
real de credito y la actualizacion inmediata de la cabecera sin releer el
saldo; restaura el saldo local y elimina su publicacion temporal al terminar.

El filtro Estado del articulo usa un minimo de 0 a 10: 0 no restringe el
estado, incluidos articulos sin puntuacion. Un minimo mayor excluye los que
no tienen estado informado y se aplica antes de contar, paginar y elegir
destacados. El deslizador consulta al soltarlo o finalizar una accion de
teclado, sin solicitudes por cada movimiento. Limpiar reutiliza los
resultados en cache cuando siguen vigentes. Aplicar
`2026-10-09-condition-filter.sql` despues de la busqueda relacionada antes
de publicar el frontend. El sello del estado es una valoracion declarada
por quien publica, no una certificacion de MiBatute.

## Acceso Admin

Los colaboradores entran directamente por `/admin` con usuario y clave.
La cuenta local inicial es `mibatutesupervisor`. Cada cuenta tiene su propio
correo interno `<usuario>@admin.mibatute.com` y rol `admin` en Auth y perfil.
Para crear mas cuentas locales, definir `LOCAL_ADMIN_PASSWORD` y ejecutar
`node scripts/create-local-admin.mjs <usuario>`. Este script no modifica produccion.
Las cuentas Admin no tienen acceso al panel Master.

## Acceso Master

Abrir `/master` directamente e ingresar usuario `leozitro` y su clave.
No requiere iniciar sesion previamente en el Home.
La cuenta se crea en Supabase local definiendo `LOCAL_MASTER_PASSWORD`
y ejecutando `node scripts/create-local-master.mjs`.
El usuario visible corresponde a `leozitro@master.mibatute.com` en Auth y
requiere `app_metadata.role = master`, asignado desde el servidor.
La sesion se conserva hasta cerrarla.

Para produccion debe crearse la cuenta en Supabase de produccion con ese
correo, clave y rol antes de desplegar. `VITE_MASTER_USER` y
`VITE_MASTER_EMAIL` permiten configurar el nombre y el correo de acceso.

La carga crea veintiocho articulos (catorce ventas y catorce donaciones), con fotos y localidades variadas de Bogota,
estado fisico y 20 cupos por usuario. Volver a iniciar conserva las reservas,
mensajes y publicaciones existentes. Los nombres de los articulos contienen
PRUEBA. Las cuentas iniciales tienen el correo confirmado; los registros
nuevos requieren confirmacion desde el buzon local.

Para detener Supabase sin borrar los datos: `npm run local:stop`.
El servidor Vite se detiene con Ctrl+C.

## Diferencias con produccion

Se usa el esquema versionado `supabase/schema.sql` mas la migracion del
estado del producto, la migracion de destacados y la paginacion. Es una reconstruccion del
esquema conocido, no un respaldo verificado de la base de produccion ni una
copia de sus datos. `2026-10-01-feature-article.sql` agrega el descuento
atomico del credito al destacar y debe aplicarse tambien antes del deploy.
`2026-10-01-home-pagination.sql` agrega la consulta del listado con nueve
resultados por pagina, filtros en el servidor y hasta doce destacados independientes.
Tambien debe aplicarse en produccion antes del deploy del frontend.
`2026-10-01-article-context.sql` concentra la lectura de articulos, participantes
publicos y chat de la reserva en una consulta, respetando RLS. Debe aplicarse
antes del deploy. No se agregan sondeos ni suscripciones Realtime de reservas;
el estado se verifica al gestionar o abrir el chat.
`2026-10-01-sale-chat-approval.sql` deja las nuevas compras con chat pendiente.
Solo el vendedor puede aprobarlo al abrir la conversacion; la base de datos
bloquea mensajes antes de esa aprobacion y despues de cancelar o entregar.
Debe aplicarse antes del deploy. Las conversaciones existentes con mensajes
se conservan; las reservas sin mensajes pasan a pendientes.
`2026-10-01-sale-cancellation.sql` registra quien cancelo y cuando desde el
servidor. Las compras canceladas por el vendedor se muestran en gris durante
24 horas en Mis Rescates y luego se ocultan; las canceladas por el comprador
se ocultan inmediatamente. No se borran el articulo ni el historial del chat,
ni se agregan tareas programadas o consultas periodicas. Aplicar antes del deploy.
`2026-10-01-approved-sale-retention.sql` registra la aprobacion al abrir el chat.
Despues ni vendedor ni comprador pueden cancelar ni borrar la venta o su conversacion.
La venta entregada se conserva siete dias desde `delivered_at`, no desde la
reserva ni desde cambios posteriores. Luego desaparece del listado del perfil;
no se destruye automaticamente el historial de la base. Aplicar antes del deploy.
`2026-10-01-donation-decisions.sql` registra los rechazos de donaciones durante
24 horas y bloquea nuevas postulaciones al mismo articulo durante ese plazo.
Aceptar a un aspirante reserva el articulo, crea su chat y rechaza a los demas
en una transaccion. El perfil lee solicitudes y rechazos en la misma consulta,
sin consultas periodicas adicionales. Aplicar antes del deploy.
`2026-10-01-publication-limit.sql` limita a veinte publicaciones no entregadas
por propietario, incluyendo reservas, pausadas y en revision. Valida inserciones
y reactivaciones en la base, serializando solicitudes simultaneas. Aplicar antes
del deploy. Los listados del perfil muestran cinco entradas por pagina con los
datos ya cargados, sin consultas adicionales al cambiar de pagina.
`2026-10-02-publication-expiry.sql` limita la visibilidad publica a sesenta
dias desde la creacion y bloquea nuevas reservas, solicitudes y destacados
al vencer. Las reservas existentes pueden finalizar o cancelar segun sus
reglas habituales; los anuncios vencidos permanecen en el perfil y liberan
cupo cuando no estan reservados. La cuenta regresiva aparece en el detalle
y en Mis publicaciones, sin consultas de fondo. Aplicar antes del deploy.
`2026-10-08-home-article-search.sql` agrega busqueda indexada por titulo,
descripcion y categorias, con todas las palabras/prefijos sin distinguir
acentos ni mayusculas. Requiere la migracion de vencimiento previa.
`2026-10-08-pickup-agreements.sql` permite proponer fecha y franja de recogida
en chats abiertos de reservas activas. Solo la otra persona puede confirmar
o rechazar; ambas pueden cancelar y reemplazar explicitamente. Conserva un
historial y finaliza el acuerdo al entregar. RLS y RPCs validan participantes,
bloqueos y horario futuro de Bogota. Realtime solo mientras el chat esta
abierto, sin consultas periodicas. Ambas migraciones son idempotentes.
El listado reutiliza hasta ocho resultados durante un minuto, separados por
usuario, filtros y pagina. Las operaciones que recargan datos invalidan la
cache; no se persisten datos de usuarios en ella fuera de la sesion React.
Al cerrar un detalle se restaura la posicion del listado y no se consulta
otra vez su contenido.
Las notificaciones conservan las diez entradas recientes, agrupadas por
conversacion o articulo. Leer una no la elimina; abrir el panel no marca
todas como leidas. Un evento posterior del mismo grupo vuelve a avisar.
El historial y la lectura se guardan por cuenta en este navegador, no se
sincronizan entre dispositivos ni sobreviven a borrar los datos del sitio.
Se conserva el resumen local incluso si el origen deja de estar disponible.
No guarda textos de chat, correos ni datos completos de perfiles. Marcar
como leido no recarga notificaciones; abrir el panel reutiliza un minuto de
cache y agrupa llamadas simultaneas. La lectura inicial espera la carga de
articulos propios. No agrega tablas, servicios, polling ni suscripciones.
Las consultas existentes estan acotadas a cincuenta chats, ochenta solicitudes
y cien mensajes recibidos; el indicador del panel cuenta grupos sin leer
dentro de las diez entradas mostradas, no todos los mensajes de la cuenta.
Los archivos SQL legacy no usan nombres de migracion CLI; por eso el arranque
local carga explicitamente el esquema y no ejecuta migraciones remotas.

## Comprobar estas mejoras

Con Supabase y Vite local activos:

```sh
npm test
node scripts/check-pickups-local.mjs
```

La segunda comprobacion usa Clientes 1, 2 y 3, crea articulos temporales y
los elimina al terminar. Verifica permisos reales, venta, donacion y acuerdos.
Para incluir navegador, ejecutar con `LOCAL_BROWSER_CHECK=1`; requiere que
Playwright este disponible. `scripts/check-listing-local.mjs` comprueba scroll,
paginacion, cache y busqueda en escritorio y movil. Ambos aceptan
`LOCAL_APP_URL` (por defecto `http://127.0.0.1:5174`) y, cuando sea necesario,
`PLAYWRIGHT_EXECUTABLE_PATH`. Las capturas quedan en
`/private/tmp/mibatute-marketplace`, configurable con `LOCAL_SCREENSHOT_DIR`.
`scripts/check-notifications-local.mjs` usa Playwright y articulos temporales
para comprobar el limite de diez, lectura, persistencia, nuevos mensajes,
aislamiento entre cuentas y ausencia de recargas al leer/reabrir. Limpia los
articulos creados al terminar y solo permite destinos locales.

## Prueba de diez postulaciones

`node scripts/seed-applicants-local.mjs` prepara una donacion independiente
"Libros con 10 postulaciones - PRUEBA", propiedad de Cliente 1, con diez
personas ficticias. Iniciar sesion como `cliente1@example.com` / `123456`
y abrir el articulo en Mis Publicaciones. Las cuentas `aspirante1@example.com`
a `aspirante10@example.com` usan la misma clave de prueba. El script solo
admite Supabase local, conserva solicitudes existentes y no reinicia una
donacion que ya tenga ganador.

`node scripts/check-applicants-local.mjs` comprueba el dialogo en escritorio
y movil, mensajes desplegables sin consultas adicionales y decisiones en
una donacion temporal que elimina al terminar. Requiere Playwright y acepta
`PLAYWRIGHT_EXECUTABLE_PATH` y `LOCAL_APP_URL`. Las diez postulaciones de la
demostracion permanecen disponibles; las capturas quedan en
`/private/tmp/mibatute-marketplace/postulaciones-*.png`.

## Notificaciones de actividad

La migracion `2026-10-08-activity-notifications.sql` registra avisos de
propuestas de recogida, confirmaciones, rechazos y cancelaciones. Cambiar
el horario produce una nueva propuesta, no dos avisos por el reemplazo.
Tambien registra aprobacion de compra, donacion elegida/no elegida,
cancelacion de reserva, entrega, calificacion recibida, creditos recibidos,
recarga rechazada, revision/aprobacion de publicaciones y avisos del sistema.
Los vencimientos de publicaciones propias se calculan con los datos ya
cargados. No se notifican al actor sus propias acciones de recogida.

Los eventos sobreviven a cambios y eliminacion del articulo. Solo el
destinatario puede leerlos; el cliente no puede crearlos, editarlos o
borrarlos. Se limpian los eventos anteriores a los 50 mas recientes por
persona y la campana combina las ultimas 10 con mensajes/postulaciones.
La lectura sigue siendo local a cada navegador. La nueva consulta trae
como maximo diez filas y comparte la cache de 60 segundos. No hay sondeo
ni suscripcion global nueva; los cambios de recogida del chat abierto
actualizan la actividad usando su canal existente.

Aplicar esta migracion despues de las de decisiones, reservas y recogidas
antes de desplegar. Hasta entonces se mantienen los avisos anteriores.
`node scripts/check-activity-notifications-local.mjs` verifica en la API y
el navegador locales los destinatarios, las decisiones, apertura del chat,
lectura sin borrar y reapertura sin consultas. Elimina sus datos temporales.

Los enlaces de recogida y mensajes consultan el chat exacto del aviso,
sin depender de la pagina cargada ni de la reserva mas reciente. Un chat
finalizado se abre solo para lectura; si ya no existe se explica el motivo
y se conserva el aviso. La consulta comprueba los participantes y no expone
la conversacion anterior al nuevo comprador.
Los avisos del sistema incluyen el identificador del recibo y abren el
mensaje completo. Los avisos de publicaciones/rescates reinician filtros,
buscan la pagina correspondiente y enfocan el articulo indicado.
`node scripts/check-notification-links-local.mjs` comprueba los enlaces
reales de recogida y casos temporales de chat finalizado, aviso del sistema
y publicaciones paginadas en el navegador local; limpia sus datos al terminar.

La prueba `LOCAL_IDLE_CHECK_MS=65000 node scripts/check-notifications-local.mjs`
comprueba que el reloj y la campana no generen solicitudes a Supabase o
`/api/` en reposo, ademas de verificar la reutilizacion de cache al reabrir.
La recogida carga al suscribirse, con respaldo unico si la conexion demora;
la campana agrupa eventos proximos de una misma accion. Estas funciones
requieren consultas bajo demanda, pero no agregan sondeo ni rutas de Vercel.

El 2026-10-08 se aplicaron en Supabase de produccion las migraciones de
vencimiento, busqueda indexada, recogidas y notificaciones antes de publicar
el frontend. Las cuentas y publicaciones de prueba siguen solo en local.

Tambien se aplico `2026-10-08-related-article-search.sql` en produccion y
se verifico la consulta con el rol anon. La cabecera muestra el saldo real
de creditos; los filtros de categorias, localidades y tipo de publicacion
empiezan cerrados en movil y conservan la seleccion al plegarlos.

Las fotos locales usan un bucket de Supabase Storage con permisos por
propietario. Este modo solo funciona en desarrollo y con URL de Supabase
local. En produccion se conserva ImageKit. El servidor Vite tambien ejecuta
los dos handlers existentes de `/api/imagekit-*` si se configura ImageKit
para una prueba de integracion especifica.

Los correos locales se capturan en Mailpit usando las plantillas de marca
existentes. En produccion Supabase conserva su SMTP de Resend; no se modifica
DNS, dominios ni claves. La entrega real por Resend, ImageKit y las funciones
de Vercel necesita una prueba de integracion con esos servicios antes de
afirmar que todo funciona en produccion.

## Publicar despues de probar

El commit incluye el codigo y las configuraciones de desarrollo, pero no
variables privadas, cuentas, imagenes ni datos de Docker. `npm run build`
usa el modo produccion, que no carga `.env.development.local` ni activa el
almacenamiento local. Vercel debe seguir usando sus variables de Supabase e
ImageKit y el proyecto `mibatute` ya vinculado en este computador.

Antes de desplegar, ejecutar `npm test`, `npm run build` y
`npm run local:check`, comprobar las
migraciones necesarias en Supabase de produccion y probar el flujo completo
con las dos cuentas locales. Commit y despliegue se realizan cuando el
usuario indique que los cambios estan listos.

Referencia: https://supabase.com/docs/guides/local-development
