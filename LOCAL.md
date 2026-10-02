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

La carga crea dieciseis articulos (diez ventas y seis donaciones), con fotos y localidades variadas de Bogota,
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
Los archivos SQL legacy no usan nombres de migracion CLI; por eso el arranque
local carga explicitamente el esquema y no ejecuta migraciones remotas.

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
