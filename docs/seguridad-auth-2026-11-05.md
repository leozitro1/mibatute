# Protección de Auth — 5 de noviembre de 2026

Estado: publicación autorizada. 424 pruebas, compilación con la sitekey real, lint y diff aprobados. Sitekey pública añadida solo a Vercel Production. Borrador 2026-11-05.1 registrado y verificado en Supabase; integración publicada en https://www.mibatute.com, commit funcional 5bab290, despliegue dpl_FYV1tNpf97LnuiE1mmiiL6Rh4oyh READY. CAPTCHA de Supabase continúa apagado: la transferencia automática del secreto no se pudo completar y requiere pegarlo directamente desde Cloudflare, sin compartirlo por chat. Registro y acceso siguen habilitados; no se enviaron correos ni crearon cuentas de prueba en producción.

## Revisión de producción, solo lectura

Proyecto habitual de Supabase `sgxzjggxlswvpedrosck`:

- Confirmación de correo activa; registro por email habilitado. Acceso anónimo, vinculación manual, teléfono y proveedores sociales deshabilitados.
- Límites visibles: solicitudes de registro/acceso, 30 por cinco minutos e IP; verificación, 30 por cinco minutos e IP; token/renovación, 150 por cinco minutos e IP; intervalo mínimo entre correos al usuario, 60 segundos. Son los valores observados, no controles nuevos instalados por esta entrega. La documentación distingue las operaciones del endpoint `/token`, que incluye contraseña y renovación.
- No se pudo leer el valor global de correos por hora en la interfaz automatizada. No se infiere ni modifica su valor, ni el SMTP existente.
- CAPTCHA desactivado. Cambio seguro de email activo; cambio seguro de contraseña, exigencia de contraseña actual y bloqueo de contraseñas filtradas desactivados. Longitud mínima no legible en esta revisión; no se atribuye un valor a producción a partir del formulario local.
- Cloudflare: sesión disponible y dominio mibatute.com presente. Tras la indicación del responsable de usar el navegador interno, se creó el widget **MiBatute Auth**, modo Managed, hostname `mibatute.com` (incluye sus subdominios) y pre-clearance apagado. No se activó CAPTCHA en Supabase, se cambiaron DNS, crearon Workers ni contrataron suscripciones. Las claves permanecen en Cloudflare; no se copian al repositorio ni a este documento.

## Cambios locales

- Los clientes público y administrativo comparten un control de solicitudes en el navegador. Tras una solicitud de correo aceptada, esperan 60 segundos antes de otra de registro, recuperación o reenvío, incluso cambiando de formulario o cerrándolo. También se conserva en recargas si localStorage está disponible.
- Evita solicitudes simultáneas de la misma clase dentro de la página. Almacena solo dos fechas y un contador de fallos por proyecto, sin email, contraseña ni token. Con almacenamiento bloqueado o inválido continúa en memoria. Las pestañas pueden leer la espera guardada, pero no hay bloqueo atómico entre pestañas.
- Acceso con contraseña: un segundo entre intentos y una pausa de 60 segundos después de cinco respuestas fallidas. Un acceso aceptado reinicia los fallos. Las respuestas 429 fijan una espera local mínima de 60 segundos, usando Retry-After válido hasta una hora; no cambian el límite real del servidor. Los clics denegados no prolongan la espera ni hacen fetch.
- Una respuesta perdida de envío de correo impone espera sin reintento automático. Un rechazo de validación ordinario permite corregir el formulario. No se aplica este control a renovación, PKCE, MFA, cierre de sesión, actualización de contraseña, consultas SQL, Storage ni otros proveedores.
- Mensajes de recuperación/reenvío no aseguran que una cuenta exista ni que un correo haya llegado. Esto reduce información en la interfaz; no certifica ocultamiento de cuentas en toda la API.
- Turnstile preparado para registro, acceso, recuperación y reenvío públicos, más acceso, confirmación de identidad y recuperación del equipo. Las páginas antiguas AdminPage/MasterPage no son rutas activas: App utiliza StaffConsole.
- El script oficial solo se carga si existe `VITE_TURNSTILE_SITE_KEY` y se abre un formulario protegido. Se comparte una carga, se retira el widget al salir y se invalidan tokens usados, vencidos o con error. Los errores/vencimientos requieren reintento manual, sin bucles de renovación. Cargar el catálogo no crea desafíos.
- El token viaja en las opciones del SDK al Auth de Supabase, que debe verificarlo contra Cloudflare al habilitar CAPTCHA. No se almacena en metadata del usuario. La clave secreta del widget pertenece exclusivamente a la configuración de Supabase Auth.
- Sin sitekey, no se carga Cloudflare y se conserva el acceso existente. Con sitekey configurada pero sin token válido, el formulario no solicita autenticación. Esta decisión de cliente no sustituye la exigencia de CAPTCHA en el servidor.

## Consumo y límites reales

Sin tablas, RPC, Edge Functions, funciones de Vercel, cron, sondeo ni dependencias nuevas. La espera del navegador puede reducir solicitudes repetidas, pero un bot puede omitirla: no es un límite de seguridad del servidor. Los límites nativos y el CAPTCHA verificado por Supabase son los controles contra llamadas directas.

Al activar Turnstile habrá descarga del script y desafíos en Cloudflare, además de la validación externa realizada por Supabase en cada operación protegida. No equivale a consumo cero. No se añade un proxy de autenticación en Vercel ni una consulta de aplicación a Postgres por intento. Cloudflare documenta un plan Free con desafíos ilimitados; no es necesario contratar Enterprise ni cambiar DNS para usarlo.

El CAPTCHA y los límites por IP/cuenta no impiden todo abuso distribuido ni imponen un techo global de facturación de Supabase/Vercel.

## Publicación coordinada autorizada

1. Widget **MiBatute Auth** ya creado en la cuenta existente, con modo Managed, hostname restringido a `mibatute.com` y pre-clearance desactivado. Continuar su conexión tras revisión y autorización de publicación. No usar “Any hostname”, secretos compartidos por chat ni claves de prueba en producción.
2. Privacidad/Cookies actualizados para Turnstile en el borrador 2026-11-05.1. Migración auth-security-notice aplicada en producción: snapshot exacto verificado (`dd1d02eb2d4fa4b1b99eebec3d05c242`), cero versiones definitivas, registro sin trigger estricto y captura de pruebas activa. No altera aprobaciones ni consentimientos anteriores. Probadas transformación exacta y reaplicación con PGlite.
3. Sitekey pública añadida como `VITE_TURNSTILE_SITE_KEY` únicamente a Vercel Production. Conjunto probado desplegado mientras CAPTCHA de Supabase sigue apagado. Verificar que el acceso público y StaffConsole entregan el token; los clientes con pestañas antiguas deberán recargarse.
4. Paso manual pendiente: formulario Supabase Auth > Attack Protection preparado con Turnstile seleccionado y campo secreto vacío, **sin guardar**. El cambio no está activo en el servidor. El responsable debe comprobar el widget público, copiar directamente el secreto desde Cloudflare y guardar la configuración; no enviarlo por chat. Verificar entonces rechazo de solicitudes sin token y aceptación del flujo válido, con una cuenta de prueba autorizada, sin pruebas masivas ni correos a terceros. Un widget visible con CAPTCHA apagado no protege la API.
5. Revisar el valor global de correos/hora antes de cambiarlo. No reducir indiscriminadamente los límites por IP ni el de tokens: usuarios que comparten red y renovación de sesiones necesitan margen. Mantener el intervalo de 60 segundos entre correos y ajustar con evidencia de uso, sin añadir monitoreo periódico por esta entrega.
6. Evaluar aparte el bloqueo de contraseñas filtradas y la reautenticación para cambios de contraseña; coordinarlos con los formularios para no impedir recuperación ni acceso administrativo.

Si falla la preparación del widget o del acceso administrativo, no habilitar CAPTCHA a ciegas. No publicar primero una exigencia en Supabase que los clientes aún no pueden satisfacer.

## Validación

424 pruebas aprobadas y compilación correcta; ESLint de los ocho módulos funcionales nuevos/modificados sin errores, y diff correcto. Trece pruebas nuevas cubren concurrencia y persistencia locales, errores de almacenamiento/red, límite de contraseña, exclusión de renovación/MFA, 429 del SDK, serialización del token, un solo uso, caducidad, retirada del widget, callbacks tardíos y recuperación manual del cargador.

Pruebas por terminal con transporte/API de widget simulados: no se completó un desafío real de Cloudflare ni se verificó su exigencia en el Auth de producción. Sin navegador local ni capturas. No se cambió el entorno local de Supabase ni su SMTP para ejecutar estas pruebas.

Referencias oficiales consultadas: [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile renderizado y ciclo de vida](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [configuración de widgets](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/), [planes Turnstile](https://developers.cloudflare.com/turnstile/plans/).

## Comprobación del despliegue

Vercel confirmó READY y alias www.mibatute.com. Catálogo, Privacidad y Cookies respondieron HTTP 200. El transporte publicado contiene el control de esperas. La comprobación del archivo CAPTCHA no se completó: se buscó primero en la entrada principal y luego un nombre de archivo de la compilación local que no existe en el despliegue; no se siguieron intentando variantes. Las páginas legales son shells de React, por lo que buscar el texto de la política en su HTML no verifica el contenido renderizado. Se solicitó al responsable comprobar el widget antes de guardar CAPTCHA. No se afirma validación de un desafío real ni bloqueo de la API sin token hasta completar ese paso.
