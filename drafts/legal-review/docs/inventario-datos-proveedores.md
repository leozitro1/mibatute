# Inventario de datos y proveedores de MiBatute

Revisión técnica del 19 de octubre de 2026. Alcance: código actual, migraciones y metadatos de la base **local**. Se leyeron nombres de tablas/campos y configuraciones de acceso, no contenidos de mensajes ni credenciales. No se copiaron datos de producción. No constituye una revisión jurídica completa ni confirma la configuración de las cuentas contratadas.

## Estado y decisiones respetadas

- Canal de atención temporal vigente: `edgarleonardo202@gmail.com` (Gmail/Google), designado por el responsable. Falta probar recepción/respuesta y revisar acceso, MFA, conservación y condiciones aplicables. No se configuró una integración de Gmail. `hola@mibatute.com` queda aplazado sin contratar servicio por ahora. `contacto@mibatute.com` sigue como contacto de apoyo; no sustituye al temporal.
- Wompi: puesta en marcha, configuración efectiva y prueba de pagos/devoluciones pendientes. Hay código preparatorio; eso no demuestra que el servicio esté activo.
- El paquete legal sigue en borrador. `LEGAL_REVIEW.processors`, `retention`, `refundWorkflow` y los demás indicadores pendientes siguen sin aprobar. Esta revisión no habilita registro, pagos ni depuración automática.
- La configuración de desarrollo revisada apunta a `127.0.0.1`, con servicios locales habilitados. No se imprimieron valores de claves ni archivos de credenciales. No se deduce de ella la región o configuración de producción.

## Proveedores y rutas de datos

| Servicio | Evidencia técnica y datos que puede recibir | Qué se confirmó | Qué falta verificar en la cuenta real |
|---|---|---|---|
| Supabase: base y Auth | Perfiles, correo y credenciales de acceso gestionadas por Auth, publicaciones, reservas, chats, soporte, solicitudes de datos, créditos, permisos y auditoría. Tráfico de autenticación y consultas desde el navegador. | SDK `@supabase/supabase-js`; clientes separados del mercado y del personal. Auth local incluye campos para IP, agente de usuario y metadatos de sesiones. | Región efectiva del proyecto, políticas/contratos de tratamiento y subencargados, retención de logs/Auth, accesos del equipo, backups y restauración. No inferir Colombia por la ciudad del usuario. |
| Supabase Realtime | Señales privadas de cambios y, según cada suscripción, datos autorizados por sus políticas. | Soporte/notificaciones reutilizan canales privados con metadatos; control de acceso probado previamente. | Inventario de todas las publicaciones/suscripciones en producción, registros y permisos efectivos. Que una tabla tenga RLS no demuestra por sí solo que cada política sea suficiente. |
| Supabase Storage | En local, imágenes de prueba; el flujo de patrocinadores usa `sponsor-media`. | Buckets locales `local-images` y `sponsor-media` públicos: sus URLs de archivo no deben tratarse como acceso privado. | Buckets efectivos en producción, políticas de subida/eliminación, URLs públicas ya compartidas, copias de objetos y caché. |
| Vercel | Archivos del sitio, peticiones HTTP y rutas `/api/imagekit-auth`, `/api/imagekit-delete`, `/api/wompi-checkout`, `/api/wompi-events`. Las rutas autenticadas reciben el token de sesión y lo validan con Supabase. | Código de las rutas y `vercel.json`. No se encontró un SDK de Vercel Analytics/Speed Insights en las dependencias o entradas revisadas. | Regiones de ejecución, logs, retención, exportaciones/log drains, integraciones, acceso del equipo y DPA aplicable. No confundir región de una función con alcance completo del CDN. |
| ImageKit | Archivos de fotos de artículos/perfil, nombres de archivo, carpetas que incorporan UUID y peticiones a su CDN. El navegador sube directamente a `upload.imagekit.io`; Vercel firma la autorización. | Ruta externa de carga y API de eliminación de imágenes de artículos presentes. Desarrollo local utiliza Storage en su lugar. | Activación y cuenta efectiva en producción, endpoint propio, originales/versiones, región, subencargados, contratos, caché, retirada de fotos antiguas de perfil. No subir documentos privados a este flujo público. |
| Correo de autenticación | Destinatarios y enlaces de confirmación/recuperación. | Flujos de registro y recuperación en el código. | Proveedor SMTP efectivo en producción, región, logs, conservación, contrato y entrega. La configuración SMTP local no demuestra la de producción. |
| Correo de atención | Peticiones, respuestas y posibles adjuntos que las personas envíen. | Designación del canal y procedimiento manual. | Configurar/probar el principal; identificar proveedor, personas autorizadas, MFA, carpetas, plazos y tratamiento de adjuntos. No confundirlo con SMTP de autenticación. |
| Wompi | Código de checkout, referencias, estados de transacción, montos y abono de créditos; el checkout del proveedor procesa el pago. | Integración preparatoria y controles de habilitación. | Pendiente por decisión del responsable: configuración, operación y reembolsos. No se verificó tráfico real ni contratos. No se encontró captura propia de PAN/CVV en el flujo revisado; esto no reemplaza una auditoría del servicio de pagos cuando se active. |
| Unsplash y hosts de imágenes/enlaces configurables | Hay dos imágenes de respaldo externas en `HeroBanner` y `SponsorCarousel`. Cuando se muestran, el navegador solicita el archivo al host. Imágenes de anuncios/publicaciones pueden añadir otros hosts según las URLs guardadas. Los enlaces externos se abren al pulsarlos. | Referencias estáticas a `images.unsplash.com`; saneamiento de URLs de patrocinadores. | Inventariar hosts efectivos de archivos de producción, licencias y sustituir los respaldos externos por recursos propios si se quiere evitar esas solicitudes. No se hizo una captura completa de red ni una lectura masiva de URLs de usuarios. |

No se encontraron etiquetas de Google Analytics, Meta Pixel, Sentry, PostHog ni fuentes de Google en las entradas, dependencias y fuentes revisadas. Es una revisión estática, **no** una garantía sobre scripts inyectados por infraestructura, integraciones o futuros cambios.

## Inventario por categoría de datos

| Categoría y almacenamiento | Finalidad y exposición | Copias o pendientes que debe cubrir la conservación |
|---|---|---|
| Cuenta: `usuarios`, `auth.users`, sesiones y metadatos de Auth | Nombre, correo, móvil, ciudad/localidad, dirección y foto; autenticación y contacto. La vista local `usuarios_publicos` no incluye correo, teléfono ni dirección. | El registro exige móvil: justificar su necesidad. La dirección es un campo de perfil: revisar si hace falta conservarla o basta un acuerdo puntual entre participantes. Nombre, móvil y ubicación pueden estar duplicados en Auth y perfil; una corrección/supresión debe contemplar ambos. No se cambiaron requisitos de registro ni se borraron campos. |
| Publicaciones: `articulos`, `articulo_imagenes` | Texto, categoría, precio, ubicación general, fotos e identificadores de propietario/comprador. Contenido público y datos operativos relacionados. | Campos duplicados/compatibilidad y copias de nombre/foto del propietario. URLs y originales de imágenes; versiones/CDN. No son archivos confidenciales. |
| Solicitudes y reservas: `postulaciones`, historiales/rechazos y `chats` | Justificación, participantes, estado, fechas de solicitud/reserva/entrega. | Textos libres pueden contener información innecesaria. El historial/rechazo no equivale a conservar solo la solicitud activa. |
| Conversación: `chat_messages`, `chat_reads`, `chat_pickups` | Mensajes y lecturas; acuerdo de fecha/franja de recogida. Acceso de participantes y tareas administrativas autorizadas. | La tabla local mantiene varios campos de compatibilidad para mensajes. Algunos borrados de artículos/solicitudes ya eliminan chats antes de 90 días. No se prometió recuperación ni se cambió esa lógica. |
| Reportes: `reports`, `chat_reports` | Motivos, detalles, resolución y responsables; `messages_snapshot` puede guardar una copia de mensajes reportados. | **Borrar un chat no demuestra que desaparezca su copia en un reporte.** Revisar finalidad y excepción concreta, acceso y plazo por caso. |
| Reputación: `reputacion`, promedios | Puntuaciones, comentarios, autor/destinatario y artículo. | Texto libre y persistencia en `staff_rating_history`; anonimizar el perfil no elimina automáticamente estas referencias. |
| Créditos: `cupos`, `cupos_historial`, créditos de solicitudes/ventas y tablas de recargas presentes | Saldo, cantidad, concepto, referencias y conciliación de operaciones. | No borrar saldos por depuración; los créditos comprados no vencen. Revisar además tablas de pagos que existan solo en producción: la ausencia en la base local no acredita su ausencia allí. |
| Soporte: `support_threads`, `support_messages`, lecturas del equipo | Asunto, mensajes de hasta 500 caracteres, roles, lecturas y cierre. | Ocultar para el usuario no borra historial del personal. La propuesta de 180 días comienza desde cierre formal; una respuesta reabre. |
| Avisos: `staff_messages`, destinatarios/estados y tablas de sistema | Avisos individuales/generales, recepción y lectura. | Separar copias por usuario, contenido del mensaje y caché del navegador. |
| Derechos: `data_rights_requests`, `legal_consents`, `legal_releases` | Radicado, petición/respuesta, verificación, notas privadas, contacto externo y evidencia de versión/aceptación. | Notas y contactos también son datos. Los 24 meses propuestos parten de respuesta final; no de aviso En revisión. La evidencia de consentimiento requiere justificación propia. |
| Administración: `staff_accounts`, `staff_sessions`, `staff_audit`, historiales de publicaciones/calificaciones | Roles, permisos, sesiones, actor/objetivo, motivos y cambios. Algunos historiales preservan referencias después de borrar contenido. | Revisar cada acción de auditoría: varios cambios/motivos son texto/JSON. No afirmar que todos los logs carecen de datos personales solo porque soporte no copia el cuerpo. |
| Métricas propias: tablas `market_*`, `sponsor_*` | Búsquedas normalizadas, filtros, identificadores de artículo/anuncio, fechas, conteos e identificador aleatorio de visita. | Son seudónimas; no declararlas anónimas por omitir el correo. La depuración existente de eventos depende de abrir ciertas consultas administrativas y usa lotes; no garantiza una fecha máxima sin ejecutar esos flujos. |

### Estado técnico local del acceso

Se observaron 43 tablas públicas con RLS activado y tres vistas. Este dato es solo de metadatos locales: no es una auditoría completa de permisos ni prueba igualdad con producción. Las solicitudes de datos y soporte ya tienen pruebas de aislamiento y MFA; falta extender la revisión a todos los flujos y políticas heredadas. No se alteraron roles ni políticas durante este inventario.

## Navegador, cachés y datos técnicos

| Almacenamiento o mecanismo | Uso observado | Conservación a revisar |
|---|---|---|
| Sesión Supabase del mercado y `mb-staff-auth` | Sesiones persistentes del SDK; el personal tiene almacenamiento separado. | Expiración/renovación y cierre de sesión. No exportar tokens a tickets o documentación. |
| `mb_notification_history_<uid>` | Hasta diez notificaciones saneadas: identificadores, fecha, título/resumen y miniatura, no un archivo completo del chat. | Persistencia del navegador hasta sobrescritura/limpieza; no tiene una caducidad legal automática. Puede quedar información visible en un dispositivo compartido. |
| `mb_seen_chats_*`, `mb_seen_posts_*`, `mb_seen_ganador_*`, `chat_seen_<uid>_<chat>` | Marcas de lectura y mapas de fechas. | No se comprobó una purga total al cerrar cuenta; documentar y aplicar limpieza selectiva cuando corresponda. |
| `mb_optional_metrics_v1` | Elección expresa de métricas opcionales. Desactivadas por defecto; respeta DNT/GPC. | Persiste por navegador hasta cambio/limpieza. Retirar descarta la cola y evita nuevos envíos; no retira solicitudes ya transmitidas ni borra automáticamente estadísticas existentes. |
| Cachés en memoria | Resultados y anuncios; la caché de slots tiene un TTL de 60 segundos y límite de contextos. Identificadores de visita generados en memoria. | No confundir TTL de esta caché con TTL de CDN, backup o tablas. |
| HTTP y logs de proveedores | Alojamiento, Auth, APIs e imágenes reciben peticiones técnicas; Auth incluye campos de IP/user agent. | El código de consentimientos no añade IP, pero eso **no significa** que el servicio completo no procese IP. Falta inventario real de logs y retención por proveedor. |

## Corrección aplicada durante esta revisión, solo en local

Las estadísticas de patrocinadores antes se disparaban sin comprobar la preferencia de métricas. Ahora impresiones y clics requieren la misma autorización opcional que búsquedas y visitas. El envío vuelve a comprobar la preferencia; retirarla o cambiarla en otra pestaña descarta la cola y evita reintentos de lotes fallidos anteriores. Los anuncios y sus enlaces siguen funcionando sin aceptar estadísticas. No se añadieron servicios, SDK, consultas periódicas ni llamadas de Vercel.

La carga del anuncio y de su imagen sigue siendo necesaria para mostrarlo: rechazar las estadísticas no equivale a bloquear todas las peticiones HTTP de la página.

## Respaldos y eliminación: límites comprobados en documentación oficial

- Supabase documenta la ubicación regional del proyecto y también posibles tratamientos fuera de ella; hay que comprobar la selección real y los acuerdos, no ofrecer residencia absoluta en un país. [Residencia y transferencias](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq).
- El backup de base no incluye los archivos de Storage, solo sus metadatos. La documentación indica acceso a siete días de backups diarios para Pro; **no se verificó el estado del proyecto contratado** ni se activó PITR u otro coste. [Backups](https://supabase.com/docs/guides/platform/backups).
- Para ImageKit, eliminación del original y purga de caché deben contemplarse por separado. No se verificaron las políticas de caché de esta cuenta. [Caché y purga](https://imagekit.io/docs/cdn-caching-and-purging).
- Revisar el acuerdo y subencargados de Vercel con la configuración real. El documento público no es evidencia de una revisión/aceptación específica del responsable. [DPA de Vercel](https://vercel.com/legal/dpa).

No se restauró ni descargó un respaldo, no se borraron archivos y no se promete supresión inmediata en copias. Antes de una restauración se necesita un procedimiento para reaplicar las supresiones que correspondan.

## Orden de los siguientes pasos

1. Supabase, sus respaldos visibles y el proveedor SMTP ya se identificaron mediante las capturas posteriores, e ImageKit por confirmación del responsable; ver actualización abajo. Falta completar configuración de Vercel, alcance/regiones de Resend e ImageKit, contratos y copias de archivos. Mantener aplazados el correo principal y Wompi según lo acordado.
2. Completar la matriz de conservación para cuenta, imágenes, reportes/snapshots, historiales, pruebas de autorización, métricas, logs y backups; justificar excepciones y verificar cómo se ejecutaría cada acción. Los tres plazos iniciales siguen como propuesta parcial.
3. Resolver la necesidad de móvil/dirección y las copias de metadatos antes de cambiar formularios o eliminar datos. Revisar limpieza del navegador y fotos antiguas de perfil.
4. Validar contratos, subencargados y obligaciones aplicables con asesoría jurídica colombiana. No marcar `processors` o `retention` como aprobados solo por completar este inventario.
5. Antes de publicación, comprobar equivalencia con producción y hacer la revisión de red/SDK sobre el despliegue final. Conservar la separación entre pruebas locales y evidencia operativa real.

## Actualización con evidencia del responsable — 19 de octubre de 2026

Esta actualización resuelve la identificación inicial que figura como pendiente en la tabla anterior. No completa la revisión contractual, la entrega de correo ni una prueba de restauración.

- **Supabase:** la captura de Primary Database muestra East US (North Virginia), `us-east-1`, instancia `t3.micro`. No se cambió la región ni la capacidad. La captura no muestra el identificador del proyecto: se registra como el proyecto de producción que el responsable está revisando, sin comprobar independientemente esa asociación.
- **Backups:** Scheduled backups muestra ocho entradas PHYSICAL, una por fecha entre el 12 y el 19 de octubre de 2026. La más reciente indica `19 Oct 2026 05:27:48 (+0000)` y la más antigua visible `12 Oct 2026 05:30:33 (+0000)`. Horas tomadas de la pantalla en UTC. No se infiere una garantía contractual de ocho días ni PITR habilitado por la mera presencia de su pestaña. La pantalla advierte que no incluyen objetos de Storage; tampoco son una copia independiente de los archivos de ImageKit. No se restauró ni descargó ninguna copia. Falta documentar y probar la recuperación.
- **Correo de autenticación:** Custom SMTP aparece activado, con `smtp.resend.com:587`, remitente `noreply@mail.mibatute.com` y nombre MiBatute. Identifica a Resend y la configuración visible; no demuestra entrega, verificación DNS, región, retención o revisión de acuerdos. No se necesita ni se registró contraseña SMTP.
- **ImageKit:** el responsable confirmó que las imágenes sí están en la biblioteca. No se inspeccionó su cuenta ni la configuración de retención, región o caché.
- Estos datos **no** dan por configurado `hola@mibatute.com`, no activan Wompi ni completan `LEGAL_REVIEW.processors`.
