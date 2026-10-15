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

Los colaboradores entran por `/gestion/operaciones`, sin enlaces en la pagina publica.
El primer ingreso exige configurar un autenticador TOTP; los siguientes requieren
contrasena y codigo de seis digitos. La cuenta local inicial es `mibatutesupervisor`.
Cada cuenta local tiene correo interno `<usuario>@admin.mibatute.com`.
Para crear mas cuentas locales, definir `LOCAL_ADMIN_PASSWORD` y ejecutar
`node scripts/create-local-admin.mjs <usuario>`. Este script no modifica produccion.
Las cuentas Admin no tienen acceso al panel Super Admin. Los permisos efectivos
provienen de `staff_accounts`, no del perfil ni de localStorage.

## Acceso Master

Abrir `/gestion/direccion` e ingresar usuario `leozitro` y su clave, seguido de TOTP.
No requiere iniciar sesion previamente en el Home.
La cuenta se crea en Supabase local definiendo `LOCAL_MASTER_PASSWORD`
y ejecutando `node scripts/create-local-master.mjs`.
El correo local inicial es `leozitro@master.mibatute.com`. La migracion importa
solo roles asignados mediante `app_metadata` de Auth, nunca metadatos editables.
Las nuevas incorporaciones se autorizan desde Super Admin en `staff_accounts`.
La sesion administrativa esta separada de la del mercado. Vence por quince
minutos sin operaciones verificadas o por ocho horas como maximo. Desactivar
una cuenta revoca sus sesiones en la base inmediatamente.

El panel acepta un correo completo o el alias local correspondiente al dominio
interno. No hay contrasenas maestras ni llaves privadas en el panel nuevo.
Las rutas antiguas `/admin`, `/master` y `/master/ads` ya no abren paneles.

En el ingreso hay `Olvide mi contrasena`: envia un enlace al correo registrado,
sin confirmar publicamente si la cuenta existe. En local los mensajes se reciben
en Mailpit (`http://127.0.0.1:54324`), nunca en un correo externo. El enlace vuelve
al panel correspondiente, limpia sus tokens de la URL y exige el autenticador
si ya existe un factor verificado. No permite recuperar cuentas ajenas al equipo.
`Cambiar contrasena`, dentro del panel, pide la clave actual y TOTP. La clave
nueva exige al menos doce caracteres y confirmacion; al guardarla se solicita
el cierre global de sesiones. Ningun flujo elimina el segundo factor.
Si se pierde tambien el autenticador, se necesita un procedimiento independiente
de verificacion de identidad; no hay un boton que lo omita.

Para una cuenta de prueba local olvidada, el operador puede ejecutar
`node scripts/reset-local-staff-password.mjs leozitro@master.mibatute.com`.
Genera una clave aleatoria, no la guarda en archivos, conserva rol y factores,
y revoca las sesiones administrativas. No usar este mecanismo en produccion.
Prueba de navegador: `node scripts/check-staff-passwords-local.mjs`.
Antes de produccion, configurar correos reales del equipo, SMTP y autorizar los
redirects de ambos paneles en Supabase; los alias internos locales no son buzones
reales ni permiten recibir mensajes fuera de Mailpit.

La migracion `2026-10-14-staff-console.sql` se aplico solo a Supabase local.
Agrega permisos, sesiones AAL2, auditoria y RPCs acotados a veinte filas por pagina.
Admin modera publicaciones y reportes, suspende usuarios temporalmente y gestiona
patrocinadores. No puede gestionar el equipo ni modificar creditos. Super Admin
incorpora cuentas existentes con correo confirmado, desactiva integrantes y
asigna permisos; esas acciones requieren una verificacion TOTP de menos de cinco
minutos. Nadie puede cambiar sus propios permisos desde el panel. La auditoria
conserva el identificador del actor incluso si su cuenta se elimina posteriormente.
No se otorga lectura directa general de chats. La auditoria de negociaciones
esta limitada al RPC `staff_article_chat_audit`, exige MFA y el permiso separado
`chat_audit` (Super Admin lo tiene; los Admin no lo reciben por defecto). Super Admin
puede habilitarlo desde Equipo > Editar permisos. Cada consulta registra actor,
publicacion, conversacion, motivo, pagina y fecha; no copia mensajes en la auditoria.
Solo permite lectura, con veinte conversaciones o cincuenta mensajes por pagina.
La fecha de consulta se conserva al paginar para no mezclar mensajes nuevos.
No modifica mensajes ni las marcas de lectura de los participantes, y no hace
polling. Antes de produccion, informar claramente esta revision de seguridad en
la politica de privacidad y limitar el permiso al personal responsable.
La lista de publicaciones abre un detalle protegido (fotos, descripcion y datos
publicos), con filtros de tipo, ciudad, localidad, categoria y estado aplicados
antes de paginar. Pausar cambia a `en_revision`: el anuncio permanece en el
catalogo, atenuado y sin permitir solicitudes. Solo el equipo puede reactivarlo.
El contador muestra el total filtrado, no solo los veinte registros de la pagina.
Cada registro incluye el nombre publico del propietario en la misma consulta.
Pulsar `Publicado por` filtra por su UUID, conservando busqueda, ciudad, tipo,
estado y demas filtros. `Ver todas` elimina solo el filtro de propietario y vuelve
a la primera pagina. Pulsar foto o titulo sigue abriendo el detalle. No se envia
telefono, correo ni direccion al listado.
El lapiz `Editar publicacion` abre correcciones de titulo, descripcion y fotos
para las cuentas con permiso de Moderacion. Se pueden retirar fotos y cambiar
su orden (la primera es la principal); no se agregan URLs ajenas ni se suben
imagenes nuevas desde esta herramienta. Aplica `2026-10-15-staff-edit-article.sql`
despues de las migraciones anteriores de staff y reportes: incorpora la version
de contenido y la galeria completa al detalle administrativo.
El servidor valida contactos, permiso, MFA, motivo y version antes de guardar.
Sincroniza galeria y los cuatro campos de imagen, preserva precio, propietario,
tipo y estado, y no permite editar reservas o entregas. Corregir no reactiva una
publicacion en revision. La auditoria registra antes/despues y el propietario
recibe un aviso con el motivo. Las fotos se desvinculan del anuncio, no se borran
fisicamente los archivos originales del almacenamiento ni los de otros anuncios.
Prueba integral: `node scripts/check-staff-edit-local.mjs` (Admin/Super Admin,
movil/escritorio, imagenes reales locales y rechazo de ediciones desactualizadas).
Los reportes publicos usan `submit_article_report` y `submit_chat_report`, definidos
en `2026-10-14-report-submission.sql` (aplicar despues de la migracion de staff).
El servidor deriva emisor, propietario y contraparte desde Auth y la publicacion
o conversacion real; no recibe identidades ni evidencias declaradas por el cliente.
Exige correo confirmado, impide autorreportes de publicaciones y denuncias de
chats ajenos, limita a diez reportes nuevos por hora y reutiliza un caso propio
pendiente para evitar duplicados. Las inserciones directas quedan revocadas.
En el encabezado del chat hay una bandera para denunciar. El contexto adjunto
contiene como maximo los ultimos veinte mensajes reales al momento del envio.
Admin y Super Admin con permiso de Reportes ven ambos tipos en esa seccion y
en el contador de Pendientes al abrirla o pulsar Actualizar, sin polling adicional.
Abrir un caso muestra el detalle y, para chats, el contexto acotado; ese acceso
queda auditado y no concede lectura general de conversaciones. Las resoluciones
guardan motivo, responsable y fecha en ambos tipos. El reporte es visible solo
para quien lo envio y el equipo autorizado, no para el usuario denunciado.
Poner un reporte en revision tambien pone su publicacion en `en_revision` y envia
el aviso al propietario, en la misma transaccion. Requiere permisos de Reportes
y Moderacion. Reservas y entregas mantienen su estado y contraparte: el caso
puede revisarse, pero el panel advierte que no se altero esa operacion. Resolver
o descartar un caso no reactiva anuncios automaticamente; su aprobacion se hace
desde Publicaciones, evitando reabrir contenido con otros reportes pendientes.
Prueba integral: `node scripts/check-reports-local.mjs` (formularios reales, movil
y escritorio, permisos y resolucion). No modifica cuentas ni reportes reales.
Hay icono de chat y filtros de activos/pendientes, historial o sin conversaciones;
los contenidos se consultan unicamente al abrir la auditoria, no en la lista.
Al pausar se envia automaticamente al buzon del propietario el motivo y una
aclaracion de que todavia no se confirma un incumplimiento. Repetir la pausa sin
reactivacion no duplica el aviso. Al eliminar, el aviso indica el motivo concreto
de la revision, incluida la norma incumplida cuando corresponde.
El ajuste de `2026-10-08-activity-notifications.sql` evita una segunda alerta
generica para las pausas del equipo: la notificacion enlaza al aviso del buzon.
Aplicar ese ajuste junto con la migracion de staff al preparar el despliegue.
El icono cambia de pausa a reactivacion. El borrado exige un motivo de una lista
validada en el servidor y un detalle: elimina y envia al buzon del propietario
un aviso persistente, junto con la auditoria, en la misma transaccion. Las reservas
y entregas no se modifican ni eliminan desde estas acciones. Los creditos de
donaciones pendientes mantienen sus devoluciones existentes al eliminar.
Telefono, correo y direccion de perfiles quedan accesibles solo para su propietario.
Los datos de identidad publicos se consultan mediante `usuarios_publicos`, sin
campos privados. No se permite borrar la fila de perfil para evadir sanciones;
el cierre voluntario debe conservar el bloqueo mediante el RPC correspondiente.

El autenticador se habilito en el GoTrue local y el limite de ingresos es diez
por cinco minutos. Las credenciales y factores de cuentas reales no se cambiaron;
las pruebas crean cuentas temporales, verifican MFA real y las eliminan al terminar.
El panel usa una sesion de navegador separada (`mb-staff-auth`) y no carga el
catalogo publico. No agrega polling, funciones de Vercel ni consultas en reposo.
Wompi y los ajustes de creditos permanecen desactivados.

Pruebas: `node --test tests/staff-console.test.js` y
`node scripts/check-staff-console-local.mjs` (Playwright y Supabase local).
Antes de produccion: revisar sus politicas y funciones legacy reales, incluido
`master-delete-user` y `self_delete_and_block`, preparar la cuenta inicial confiable,
habilitar TOTP y
limites de ingreso en Supabase, revisar CAPTCHA/recuperacion segura de MFA y
aplicar la migracion solo despues de verificar que no rompe las cuentas existentes.
Invitaciones de nuevas cuentas por correo, PQR dedicadas, pagos y configuracion
global de limites quedan para las siguientes etapas; no se simulan como activas.

Referencias de diseno y seguridad:
https://github.com/marmelab/shadcn-admin-kit
https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-mfa.mdx

La carga crea veintiocho articulos (catorce ventas y catorce donaciones), con fotos y localidades variadas de Bogota,
estado fisico y 20 cupos por usuario. Volver a iniciar conserva las reservas,
mensajes y publicaciones existentes. Los nombres de los articulos contienen
PRUEBA. Las cuentas iniciales tienen el correo confirmado; los registros
nuevos requieren confirmacion desde el buzon local.

Para detener Supabase sin borrar los datos: `npm run local:stop`.
El servidor Vite se detiene con Ctrl+C.

## Diferencias con produccion

El sistema local de donaciones usa `2026-10-13-donation-credits.sql`:
una solicitud gratuita cada seis horas, hasta tres pendientes simultaneas,
y un credito retenido por cada adicional, con consentimiento explicito.
Rechazo, eleccion de otra persona, eliminacion y vencimiento devuelven el credito
una sola vez. Eleccion propia lo consume; retirada voluntaria no lo devuelve.
Los destacados se consumen al activarlos y nunca se reembolsan por falta de venta.
La devolucion por vencimiento se concilia al consultar estado/saldo desde el perfil
o una donacion; no hay cron ni sondeos. Las solicitudes antiguas se conservan
gratis. Antes de aplicar a produccion, revisar las pruebas y la transicion de
cupos extra antiguos. En la revision de produccion del 2026-10-13 no se encontraron
cupos extra antiguos ni historial de postulaciones que requirieran conversion.
Las nuevas solicitudes se crean exclusivamente con el RPC
`apply_for_donation`; no usar inserts de postulaciones desde clientes autenticados.

`2026-10-13-sale-credits.sql` agrega un limite independiente para compras:
cinco reservas gratuitas y tres adicionales a un credito cada una, hasta ocho.
La aprobacion del chat no libera el cupo; la entrega o cancelacion si lo libera.
El credito adicional se retiene, se consume al entregar o cancelar el comprador,
y se devuelve una sola vez si rechaza/cancela el vendedor antes de aprobar.
Se mantiene la proteccion existente que impide cancelar compras aprobadas.
Eliminar datos desde servicio o expirar un anuncio no devuelve creditos de compra.
Las reservas anteriores permanecen gratuitas. `transition_sale_unmetered` es
privado; `transition_sale` protege tambien clientes antiguos, y
`transition_sale_with_credit` exige consentimiento para gastar. El perfil lee
saldo y ambos limites en una sola llamada `account_credit_status`.
Pruebas locales: `node --test tests/sale-credits.test.js` y
`node scripts/check-sale-credits-local.mjs` (requiere Playwright).

Ambas migraciones de creditos se aplicaron a produccion el 2026-10-13.
Se verificaron RLS, acceso autenticado a los RPC, bloqueo de insercion directa
de postulaciones y del RPC de compras sin limite, y cero cobros retroactivos.
Las pruebas integrales de donaciones, compras y `npm run local:check` pasaron.
En movil el catalogo muestra dos tarjetas normales por fila; los destacados
conservan su tamano y ocupan una fila completa. No se agregan consultas por
este cambio visual ni tareas programadas por el sistema de creditos.

El catalogo local usa `2026-10-13-home-random-order.sql`: orden aleatorio por
defecto, estable durante la visita y la paginacion. Una destacada coincidente
ocupa la primera posicion; despues se intercala una cada seis articulos normales.
El intervalo se calcula antes de paginar, conservando el orden elegido dentro
de cada grupo y sin repetir publicaciones. Si se agotan los normales, los
destacados restantes aparecen al final; el filtro Solo destacadas los conserva todos.
Todos los filtros se aplican antes de intercalar; si ninguna destacada coincide
no se agrega una de otra localidad o categoria.
En movil solo los destacados ocupan ancho completo. Cada pagina contiene cuatro
filas: una fila destacada o dos articulos normales por fila. La consulta devuelve
`pageCount`; no se cortan parejas al paginar ni se amplian las tarjetas normales.
Si los resultados contienen un numero impar de normales, la ultima queda a medio
ancho. Escritorio conserva nueve publicaciones por pagina. La cache distingue
ambos formatos y cambiar de formato reinicia la pagina, sin consultas periodicas.
La migracion del catalogo se aplico en produccion el 2026-10-13 y se comprobo
la consulta movil con el rol anon antes de desplegar el frontend.

## Wompi preparado, sin activar

Se retiro del perfil la transferencia manual a Nequi. Las recargas antiguas
permanecen en el panel Master; no se borran ni convierten automaticamente.
El nuevo dialogo muestra Wompi pendiente de configuracion y no permite pagar.
`WOMPI_ENABLED` debe ser exactamente `true` para habilitar los endpoints;
por defecto estan desactivados, incluso si existen llaves. No activar todavia.

Para la futura prueba se requieren llaves sandbox en variables solo del servidor:
`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`,
`WOMPI_EVENTS_SECRET`, `WOMPI_ENVIRONMENT=test`, y `SUPABASE_SERVICE_ROLE_KEY`.
Ningun secreto usa el prefijo `VITE_`. Configurar el webhook de Wompi para
`https://www.mibatute.com/api/wompi-events` solo cuando se autorice la prueba.
La firma del checkout se crea en servidor; el webhook verifica su firma,
consulta el pago canonico con la llave privada y acredita mediante una
transaccion idempotente. No se confia en referencias ni estados del navegador.

La migracion `2026-10-13-wompi-topups.sql` queda preparada, sin aplicar en
produccion. Los pagos sandbox no generan creditos utilizables en la nube.
Solo una base local de pruebas puede habilitar `app.settings.wompi_test_credits`.
El estado se consulta al abrir el dialogo o al pulsar Verificar pago; no hay sondeos.
La integracion real con Wompi sigue pendiente de cuentas administrativas,
configuracion segura de llaves y prueba sandbox de extremo a extremo.

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

## Fichas administrativas e historial

`2026-10-15-staff-user-history.sql` habilita fichas con permiso `users`, MFA
y registro de cada consulta en auditoria. La lista incluye estadisticas en
su misma RPC; cada ficha o pagina de historial usa una RPC adicional, solo
al abrirla. No hay sondeo automatico ni consultas por cada fila.

El historial importa publicaciones, reportes y calificaciones existentes.
Desde su instalacion conserva sus contadores aunque se elimine el articulo;
no puede reconstruir registros borrados antes de instalarse. Los destacados
y entregas son contadores de articulos unicos, no de pagos ni de eventos.
Las publicaciones activas son las disponibles dentro de sus 60 dias;
reservadas y en revision tienen contadores separados.

Las tablas historicas no se exponen a usuarios normales. La ficha privada
solo devuelve campos seleccionados, no tokens ni metadatos de Auth. Al borrar
la cuenta de Auth tambien se elimina su historial administrativo. Prueba:
`scripts/check-staff-users-local.mjs`, con cuentas desechables y anchos
320, 390, 768 y 1440. No modifica usuarios existentes ni produccion.

`2026-10-15-staff-credit-compensation.sql` permite compensaciones de 1 a 5
creditos por operacion con permiso `users` y MFA, nunca a la propia cuenta.
El identificador de solicitud evita repetir un abono al reintentar. Saldo,
movimiento, motivo, auditoria y aviso al buzon se guardan en una transaccion.
El aviso del buzon sustituye la alerta generica de creditos para no duplicarla.

## Campanas y patrocinadores

Patrocinadores es exclusivo del Super Admin incluso si una cuenta antigua
conservaba ese permiso en su arreglo. El servidor, la interfaz y el bucket
`sponsor-media` requieren el rol verificado con MFA. Las migraciones nuevas
son `2026-10-15-sponsor-campaigns.sql` y `2026-10-15-sponsor-storage.sql`.

El banner principal y el cuadro inferior comparten una RPC publica con cache
de 60 segundos por combinacion de filtros (maximo 20 combinaciones en memoria).
Las campanas tienen galeria de hasta 12 fotos, versiones moviles, enlace HTTPS,
orden, fechas en hora Colombia, estado y control de versiones. No hay limite
fijo de anunciantes/campanas: cada carga selecciona hasta seis campanas por
espacio con una semilla aleatoria efimera; la seleccion es estable en esa
pagina. Cada anunciante tiene un turno por vuelta, independientemente de sus
fotos, que cambian en vueltas sucesivas. Es una distribucion probabilistica,
no una garantia de impresiones ni de igualdad exacta de exposicion.

La cobertura vacia significa toda la plataforma; pueden seleccionarse varias
ciudades completas o localidades dentro de cada ciudad. Las categorias vacias
significan todas. Zonas alternativas se combinan con OR, categorias con OR,
y ambos grupos con AND. Una campana de localidad/categoria concreta solo es
elegible al elegir ese filtro, nunca por GPS ni por datos privados del perfil.
Se usan las localidades del catalogo actual, no barrios independientes que la
pagina aun no permite filtrar. No se guardan coordenadas ni filtros personales
en las metricas. Los cambios de filtros se agrupan durante 200 ms y ambos
espacios comparten la misma solicitud. Los motivos de cambio no se solicitan:
la auditoria automatica conserva actor y versiones anterior/posterior.

Las muestras
estaticas inferiores ya no representan patrocinadores reales; si no hay una
campana se muestra el contacto publicitario de MiBatute.

Las impresiones requieren al menos 50 % visible durante un segundo, con la
pestana visible; un clic tambien acredita la visualizacion. Cada campana/espacio cuenta una impresion y un clic como
maximo por carga de pagina y dia. Los eventos se envian en lotes de hasta 20,
a los 15 segundos si hay pendientes, al hacer clic o al ocultar/salir de la
pagina. No hay consultas al rotar el carrusel ni sondeo del panel. No se
agregan funciones de Vercel ni un proveedor externo de analitica.

Las metricas son orientativas, no certificadas para facturacion ni antifraude.
No se almacenan cuentas, cookies, IP ni huellas en estas tablas: solo un UUID
efimero por carga, campana, espacio y dia para deduplicar. El dashboard elimina
en lotes de 5000 los identificadores de mas de 30 dias; los agregados diarios
permanecen. Con alto trafico se debe automatizar esa retencion. Los contadores
legados se conservan; los periodos 7/30/90 dias comienzan a medir al instalarse.
Las imagenes anteriores no se borran automaticamente por si se reutilizan;
las subidas nuevas canceladas se limpian al cerrar el editor.

Referencia de analitica ligera: https://github.com/umami-software/umami.
Prueba local integral: `scripts/check-sponsors-local.mjs`.

## Auditoria legible

`2026-10-15-staff-audit-filters.sql` agrega una lectura paginada independiente
para Auditoria. Los codigos originales se conservan sin modificar el historial;
la pantalla muestra nombres comunes y permite buscar sin tildes por accion,
motivo o responsable. Filtros por actividad, hoy/7/30/90 dias y, para Super Admin,
todos/mis acciones/sistema o un integrante concreto (nombre y correo para
distinguir homonimos). El selector incluye desactivados y responsables
historicos retirados, incluso si ya no tienen cuenta; estos ultimos conservan
su ID de auditoria. El listado de miembros llega con la misma respuesta, sin
una consulta HTTP adicional. Solo Super Admin recibe el listado y los correos
del equipo; un Admin no puede consultar otro responsable enviando su UUID.
Las fechas se delimitan en hora Colombia. Este filtro no asigna ni restringe
permisos de los miembros por ciudad.
Los filtros y el conteo se aplican antes de paginar, con 20 filas por solicitud.
Cada Admin sigue viendo exclusivamente sus acciones; el Super Admin ve el
conjunto. No se devuelven snapshots ni documentos del historial; el motivo
registrado sigue siendo visible para el equipo autorizado, incluidas notas
internas incorporadas a ese motivo. No se muestran en el buzon del usuario.
No hay sondeo ni solicitudes adicionales para traducir nombres.

## Publicacion del 15 de octubre de 2026

Los apartados anteriores documentan el desarrollo local. Las nueve migraciones
de administracion, reportes, ajustes de notificaciones, edicion, historial,
compensaciones, campanas, almacenamiento y auditoria se aplicaron al proyecto
de produccion `sgxzjggxlswvpedrosck` en una sola transaccion, con autorizacion
explicita del titular. Se habilito la cuenta real designada como primer Super
Admin, sin cambiar su contrasena ni trasladar cuentas o datos locales.

La comprobacion anonima en produccion devolvio tres campanas publicas, cero
perfiles privados y sin acceso a auditoria ni metricas internas. El commit
principal es `51087a2`. El sitio se publico en `https://www.mibatute.com`.
Vercel no esta conectado automaticamente con GitHub: los despliegues se
realizan con la CLI vinculada al proyecto existente. `vercel.json` incluye
solo rutas cliente concretas para paneles, recuperacion y terminos; no
intercepta `/api` ni recursos estaticos. No se activaron pagos Wompi.

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
