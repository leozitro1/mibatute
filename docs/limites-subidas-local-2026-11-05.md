# Límites de autorizaciones de imágenes — 5 de noviembre de 2026

Estado: probado en local y publicación autorizada por el responsable. Migración aplicada en Supabase de producción y verificada mediante metadatos; API preparada para el despliegue habitual en esta entrega.

## Reglas acordadas

- Máximo 20 autorizaciones por cuenta durante los últimos 10 minutos.
- Máximo 120 durante las últimas 24 horas.
- Máximo 4 autorizaciones para la carpeta de perfil durante las últimas 24 horas, incluidas en ambos límites generales.
- Las ventanas son móviles: no se reinician a medianoche. Una cuenta con créditos tiene los mismos límites de seguridad.
- Se cuenta la reserva aceptada antes de emitir la firma, aunque el cliente no termine la subida, pierda la respuesta o ImageKit rechace después el archivo. No se devuelve este cupo borrando una imagen, cancelando una publicación o reintentando. Esto no cobra créditos.
- Los intentos rechazados no añaden reservas ni alargan la espera. Si coinciden varios límites, se devuelve la fecha que satisface todos los aplicables a la operación solicitada.
- El límite de perfil se refiere a autorizar archivos nuevos en su carpeta; no cuenta elegir una foto ya subida o reutilizar una URL. No es un límite de ediciones de la fila de perfil.

## Control del servidor

`public.reserve_image_upload(text)` usa exclusivamente `auth.uid()`, acepta solo `articulos`/`perfiles` y no permite indicar otra cuenta. Las cuentas bloqueadas o con suspensión vigente no pueden reservar.

`public.image_upload_limits` tiene RLS y carece de acceso directo para clientes. Se revocan sus permisos, incluidos UPDATE, DELETE y TRUNCATE, y la función solo se concede al rol autenticado. El cliente no puede borrar o reiniciar el contador ni consultar el de otra cuenta.

Una única fila por cuenta mantiene hasta 120 fechas de reserva y hasta 4 fechas de perfil. La fila se bloquea durante la comprobación y actualización; la clave primaria también serializa el primer uso simultáneo. Todos los procesos de Vercel y los dos tipos de imagen comparten la misma cuota persistente. No depende de memoria de una instancia.

Las fechas vencidas dejan de contar y se compactan al aceptar una nueva reserva. **No se promete eliminación física exactamente a las 24 horas:** una fila inactiva conserva sus últimas marcas hasta el siguiente uso o la eliminación de la cuenta, que las elimina por cascada. No guarda IP, contenido de imágenes ni mensajes.

## Uso y consumo

- En producción: se conserva la verificación existente de sesión y se añade **una llamada RPC a Supabase por solicitud de autorización válida y de carpeta propia**, tanto si resulta aceptada como limitada. El navegador sigue haciendo una autorización al servidor y una subida directa a ImageKit si se acepta.
- Coste técnico: una operación corta y un registro acotado por cuenta; hay consumo adicional de base de datos. No se contratan servicios ni se añaden consultas periódicas o tareas de limpieza.
- En modo de imágenes locales se usa la misma reserva antes de escribir en Storage local. El código local actualizado ya se sirve en `http://127.0.0.1:5173/`.
- La API devuelve HTTP 429 con `Retry-After`, `retryAt`, `retryAfter` y un mensaje con fecha/hora de Colombia. Sin firma ni parámetros de subida cuando se deniega. Si falta la migración o falla la comprobación, devuelve error sin autorizar la imagen.
- El formulario de publicación conserva sus campos y archivos al recibir el error; su flujo ya devuelve antes de resetear/cerrar. Las fotos se suben antes de confirmar la publicación y el débito, así que el rechazo no crea la publicación ni descuenta créditos. En una tanda parcialmente subida se conserva el mecanismo existente de limpieza.
- No cambia precios, créditos, las cuatro fotos por publicación ni el máximo comercial de veinte publicaciones. Tampoco implementa ampliaciones administrativas de cuota en esta primera versión.

## Validación

- **411 pruebas aprobadas**, compilación correcta, lint de archivos nuevos/modificados sin errores y `git diff --check` correcto.
- Pruebas SQL: ventanas, vencimientos, aislamiento de cuentas, cuota de perfil compartida, denegaciones que no prolongan espera, combinación de límites, bloqueos, permisos, eliminación por cuenta y reaplicación que conserva reservas.
- API: HTTP 429 con espera y sin token para cada límite; falta/error de RPC deniega la autorización. Las peticiones inválidas y de carpeta ajena no reservan cuota.
- Tres pruebas adicionales con conexiones PostgreSQL independientes en una base Docker temporal: primer uso sin perder reservas, última plaza de ráfaga y última plaza diaria. La base temporal se retiró al terminar sin modificar la base de usuarios.
- Migración aplicada a Supabase local. Verificación de metadatos: RLS activo, escrituras directas y lectura anónima revocadas, ejecución autenticada permitida y anónima denegada. La migración se añadió al arranque inicial local para que un entorno nuevo incluya el contador.
- Sin navegador local ni capturas, pruebas de carga ni subidas ImageKit para esta etapa. En producción solo se aplicó la migración y se consultaron metadatos, sin reservar cupos de usuarios para pruebas.

## Publicación autorizada

Aplicada `supabase/migrations/2026-11-05-image-upload-limits.sql` en el proyecto habitual. Verificados RLS, ausencia de permisos directos de cliente, ejecución autenticada, arrays acotados, cascada por cuenta y cuerpo exacto de la función (`44a9c3080cb917a9b449936dfb44cc8e`). Confirmadas 62 tablas con RLS, cero permisos de TRUNCATE de cliente y funciones de MFA/créditos sin cambios. El siguiente paso de esta entrega es desplegar el conjunto del código. El control anterior no empieza a limitar ImageKit solo por instalar la tabla: se activa para las nuevas autorizaciones al publicar la API.

Los JWT de ImageKit emitidos antes de esa publicación pueden seguir utilizándose hasta su vencimiento de cinco minutos. No se inventa consumo histórico. La primera autorización después de activar el control comienza el registro de cada cuenta.

Este límite por cuenta no sustituye protección de Auth contra creación masiva de cuentas, límites globales de consumo o medidas DDoS. Una llamada directa a esta RPC puede gastar la cuota propia, pero no genera firmas ni consume la de otro usuario.
