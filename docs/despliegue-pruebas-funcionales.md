# Flujo de desarrollo y despliegue de MiBatute

Decisión del responsable: trabajar en la rama main y en la carpeta habitual, publicar en el mismo proyecto de Vercel y en https://www.mibatute.com. Publicar el conjunto completo de los cambios autorizados tras probarlos. No crear ramas, checkouts alternativos o entregas parciales que oculten funcionalidades, salvo petición explícita.

## Entrega completa del 19 de octubre de 2026

- Se integraron en el código activo todos los módulos del trabajo legal y operativo: seis páginas del pie, datos del responsable, Gmail temporal, cookies/preferencias, registro de pruebas con elecciones separadas, solicitudes de datos, seguimiento interno y cierre/reapertura de soporte.
- Registro de pruebas habilitado. La nueva elección se registra en el servidor con source=testing y una versión inmutable del borrador. No se inventan elecciones de cuentas anteriores ni se presenta la versión como aprobación jurídica final.
- El trigger estricto capture_registration_consent no se instala automáticamente con la infraestructura. El script de publicación definitiva lo instalará solo tras resolver los pendientes. El trigger no bloqueante capture_testing_registration registra las elecciones válidas de clientes nuevos, sin cerrar el registro de clientes anteriores.
- LEGAL_READY y LEGAL_APPROVED continúan false. El borrador se publica para que el equipo legal pueda revisarlo en el sitio real. Una versión registrada como draft no se puede habilitar como definitiva: se requiere una versión nueva.
- Solicitudes de datos: formulario con radicado para usuarios autenticados, correo para quien no tiene cuenta, panel compartido con MFA, asignación, notas privadas, verificación, respuesta final y registro manual de correo. No envía correos ni borra datos automáticamente.
- Soporte: 500 caracteres, hilos compartidos para admin/superadmin, ocultamiento por el usuario que conserva historial del personal, cierre y reapertura. La simulación de conservación solo consulta, sin borrar.
- Wompi y recargas permanecen deshabilitados con Próximamente. Los saldos existentes y los flujos del mercado conservan sus reglas; no se regalaron créditos ni se ejecutaron pagos.
- Las métricas opcionales respetan la elección del usuario, DNT y GPC; retirar descarta la cola. Todas las rutas legales tienen acceso directo en Vercel.

## Base de datos de producción

Se preparó una sola transacción con legal-foundation, data-rights-workflow, support-closure-preview, testing-registration y la versión de borrador 2026-10-19.2. La comprobación confirmó data_rights_requests existente, trigger estricto ausente, captura de pruebas activa y cero versiones finales habilitadas. Se compara la huella de las 17 funciones contra las definiciones probadas.

El entorno local conserva el trigger estricto de pruebas anteriores. Su desactivación fue autorizada por el responsable, pero la revisión automática no pudo completar esa acción por límite de uso. No se desactivó mediante otra vía ni como efecto de estas migraciones. Ese bloqueo local no existe en producción.

## Conservación del trabajo anterior

El contenido preservado en drafts/legal-review se reintegró en el código activo con ajustes para registro funcional y estado de borrador. La copia inactiva se retira; su versión original sigue recuperable en el commit befb4a6 y en el respaldo git de seguridad. No aplicar automáticamente ese stash antiguo sobre los archivos actuales.

## Validación

227 pruebas pasaron, incluida captura de elecciones de pruebas sin falsas aprobaciones, registro, rutas legales, MFA, aislamiento, solicitudes, cierre de soporte, mensajes de 500 caracteres y checkout deshabilitado. Compilación y lint de los módulos nuevos/modificados sin errores. No se crearon cuentas ajenas, pagos ni solicitudes ficticias en producción.


## Entrega del 20 de octubre: reglas de ventas y donaciones

El responsable autorizó publicar el conjunto probado en local en main y el mismo dominio. Las migraciones `2026-10-20-donation-daily-quota.sql` y `2026-10-20-publication-credits.sql` se aplicaron juntas en una transacción al proyecto de producción existente. La verificación posterior confirmó **8 de 8 funciones idénticas** a las probadas en local, RLS de recibos activo, escrituras de recibos revocadas al cliente, ejecución de publicación revocada al anónimo y trigger de control instalado. Continúan cero versiones legales finales habilitadas.

- Hasta 3 ventas activas gratis; una nueva adicional requiere confirmar 1 crédito. Pausadas/reservadas cuentan; entregadas o vencidas liberan espacio, salvo las reservas pendientes de finalizar. Se conserva el límite general previo de 20 publicaciones activas.
- Dos postulaciones gratuitas por ventana móvil de 24 horas; una adicional requiere 1 crédito, con máximo de 3 pendientes. El historial impide recuperar gratuidades cancelando o recibiendo un rechazo. Se conservan las devoluciones/retenciones de las solicitudes adicionales.
- Destacar requiere otro crédito y tiene protección contra escrituras directas. Los reintentos de publicación/destacado no duplican el débito. Las publicaciones anteriores no reciben cargos retroactivos.
- «Cómo funciona» incluye pasos, costos, seguridad del chat y paquetes propuestos; la cabecera muestra BETA. Las recargas y los botones de compra siguen deshabilitados; no se alteraron los precios del checkout inactivo ni se ejecutaron pagos.
- **241 pruebas**, compilación y lint de los módulos funcionales modificados pasaron. La prueba contra la base local de venta adicional/destacado/reintentos se revirtió completamente. En producción se verificaron definiciones y permisos, sin crear publicaciones ni descontar saldos de usuarios para pruebas.


## Entrega del 21 de octubre: administración y publicación guiada

El responsable autorizó commit en main y producción en el proyecto Vercel habitual, con todos los cambios preparados en local.

- Administración: campana, contadores y puntos por publicaciones por revisar, reportes pendientes, solicitudes de datos y conversaciones sin leer por administrador. Un único canal privado reutilizado y consultas agrupadas, sin sondeo periódico. Filtro Todos/abiertos/cerrados en el buzón y regreso al listado con estilo de botón.
- Reportes: la vista de publicación reutiliza el detalle público completo en modo de revisión. El nombre del vendedor abre su ficha para quienes tienen permiso de usuarios; desde allí se prepara un mensaje con referencia al artículo, sin enviarlo automáticamente.
- Publicación: elección explícita Venta/Donación, fotos, artículo, ubicación y revisión final; validación por paso y conservación del borrador al retroceder. El precio máximo sigue en $500.000 COP por venta.
- Fotos: ajustar la imagen completa, alejar y conservar proporción con márgenes. Flechas de orden y primera foto como portada al crear/editar. En edición, datos, posiciones y alias de portada se guardan en una sola transacción; mover las fotos del borrador no hace escrituras remotas.
- Destacado opcional al publicar: confirmación del total, saldo suficiente y débito conjunto de 1 crédito para destacar una publicación gratuita, o 2 si también corresponde pagar una venta adicional. Recibos y libro de movimientos existentes, reintentos sin duplicar cargos y reversión completa ante fallos. Wompi y compras de recargas continúan deshabilitados.
- Cómo funciona: mercado de pulgas digital, ventajas frente a otras plataformas, papel de MiBatute como puente de contacto, privacidad y seguridad de pagos/entregas, con conservación de obligaciones legales. Son explicaciones operativas; no se aprobó una versión jurídica definitiva.

Las cinco migraciones aplicadas en una sola transacción de producción fueron `2026-10-20-staff-attention.sql`, `2026-10-20-support-inbox-status-filter.sql`, `2026-10-20-staff-article-preview.sql`, `2026-10-20-publish-with-highlight.sql` y `2026-10-21-article-photo-order.sql`. La verificación posterior confirmó **6 de 6 cuerpos de función idénticos** a los archivos probados (MD5), ejecución anónima revocada, permisos autenticados correctos y 6 triggers de invalidación instalados. Las APIs previas de publicación y buzón conservan sus firmas.

Validación: **271 pruebas** aprobadas, compilación correcta y lint sin errores en los archivos revisados (persisten dos advertencias de dependencias de efectos en ProductDetail). Pruebas de navegador en local para publicación de venta/donación, recorte/ajuste, avance y regreso, selección del destacado, orden y vista de portada, ficha del vendedor y mensajes preparados. No se crearon publicaciones, mensajes ni cobros ficticios en producción para comprobar la entrega.


## Entrega del 21 de octubre: ciudades y localidades

- Nuevo menú «Ciudades y localidades», exclusivo del superadmin. Permite añadir ciudad con primera localidad, agregar localidades, activar y desactivar ciudades. No permite eliminar ni renombrar ubicaciones de publicaciones existentes. La última ciudad activa queda protegida; cambios concurrentes de configuración se serializan y cada modificación queda en auditoría.
- El catálogo de Supabase sustituye las listas fijas en registro, perfil, publicación/edición, buscador, filtros y segmentación/estadísticas del equipo. Las ubicaciones inactivas se conservan en el catálogo histórico del equipo; los selectores públicos usan las activas. Un único catálogo compartido en memoria, con caché de cinco minutos y comprobación al volver a la pestaña, sin sondeo ni otro canal Realtime. Los errores conservan el último catálogo válido.
- Desactivar retira una ciudad de los selectores públicos. La base de datos también rechaza nuevas publicaciones o cambios de ubicación hacia ciudades inactivas o localidades ajenas. Las publicaciones previas y sus datos se conservan y pueden editarse sin cambiar su ubicación original. Registro y funciones existentes siguen habilitados; pagos continúan deshabilitados.
- Migración: `2026-10-21-location-catalog.sql`, aplicada en la base local y producción. Se verificaron cinco de cinco cuerpos de función idénticos, permisos de ejecución, RLS, escrituras directas revocadas y trigger de ubicación habilitado. Producción conserva solamente Bogotá activa, con cuatro ciudades configuradas y 34 localidades; ninguna ciudad se activó en producción como prueba.
- Validación: 283 pruebas aprobadas y compilación correcta. Lint sin nuevos errores; los diagnósticos existentes en MarketplaceApp, Navbar y UserProfile no aumentan. Navegador local: menú/formularios de superadmin, activación y desactivación de Cali (restaurada inactiva), catálogo en el buscador y formularios en una columna sin desbordamiento horizontal a 432 px de ancho real. Medellín conserva el estado local elegido por el responsable.


## Entrega del 21 de octubre: editor de ciudades y localidades

- Cada ciudad tiene «Editar», con formulario para añadir localidades, corregir nombres sin uso y quitar/recuperar localidades existentes. Quitar es reversible: conserva los registros y el historial, retira la localidad de los selectores públicos y bloquea nuevas publicaciones en ella. El equipo mantiene sus opciones históricas para consultar publicaciones previas.
- Los nombres con publicaciones, perfiles, historial administrativo, métricas o campañas no se renombran. Para corregir el nombre de una ciudad sin uso debe desactivarse primero. Una ciudad activa conserva al menos una localidad disponible; una ciudad inactiva sin localidades disponibles no puede reactivarse hasta recuperar o añadir una. Los controles se verifican en servidor con MFA/sesión de superadmin y registro en auditoría.
- Migración `2026-10-21-location-editing.sql` aplicada en local y producción. Verificación: cinco de cinco funciones coinciden con los cuerpos probados, permisos de ejecución correctos y 34 localidades disponibles conservadas en producción. No se alteraron nombres ni se retiraron localidades en producción como prueba. Se mantiene la caché compartida de cinco minutos sin sondeo ni canales nuevos.
- Validación: 287 pruebas aprobadas, compilación correcta y lint limpio en los módulos nuevos de edición. Navegador local: apertura/foco del editor, retirar y recuperar Comuna 22 de Cali (restaurada disponible), confirmación en el editor y sin desbordamiento horizontal a 432 px de ancho real. Se respetaron los estados de ciudades elegidos por el responsable en local.


## Entrega del 21 de octubre: selector de ciudad con diseño propio

- Selector compartido para ciudades en buscador, registro, perfil, publicación/edición y administración. Botón y lista con diseño de MiBatute, selección marcada, opciones deshabilitadas, desplazamiento y capa superior para evitar recortes en ventanas. Conserva el catálogo y los manejadores existentes, sin consultas adicionales ni cambios de base de datos.
- Mantiene la validación y los datos del formulario mediante un control nativo oculto; la interacción visible usa combobox/listbox, flechas, inicio/fin, búsqueda por prefijo, Enter, Escape y Tab. Cierra al cambiar foco, pulsar fuera o desplazar la página.
- Validación: compilación y lint de los módulos funcionales sin errores nuevos. Navegador local con el componente real: obligatoriedad del formulario, selección por teclado y ratón, Escape sin cambiar el valor, clic fuera y selección dentro de un diálogo nativo. En el buscador a 432 px reales, la lista mide 240 px y queda dentro de pantalla; se restauró el tamaño del navegador y se eliminó la página temporal de pruebas.


## Entrega del 22 de octubre: privacidad de los datos del operador

- A petición del titular, se retira el bloque de identificación personal que se repetía en las páginas legales, incluida Privacidad. Se muestra únicamente el canal de correo con asunto para solicitar información del responsable. Nombre, identificación, dirección y teléfono ya no forman parte de la configuración distribuida al navegador; el apoyo administrativo también usa una denominación genérica.
- La identificación del responsable queda expresamente pendiente en LEGAL_REVIEW. LEGAL_READY y LEGAL_APPROVED permanecen false; esta presentación del borrador no se considera cumplimiento de la información exigida por el artículo 2.2.2.25.3.1 del Decreto 1074 de 2015. Solicitar los datos por correo no sustituye ese requisito. Debe resolverse con revisión jurídica y canales de contacto adecuados antes de aprobar los documentos definitivos.
- No se alteran consentimientos ni documentos históricos inmutables de la base de datos; no se activa una nueva versión definitiva ni se modifican registro, pagos o SMTP. La retirada del sitio actual no borra copias históricas ni el historial de Git.
- Validación exclusivamente por terminal: compilación correcta, lint sin errores en los módulos modificados, nueve pruebas de infraestructura legal/registro de pruebas aprobadas y análisis del artefacto dist sin los datos personales retirados. No se abrió el navegador ni se tomaron capturas.


## Entrega del 22 de octubre: canal único de contacto

- El canal vigente es el buzón info del dominio mibatute.com; sustituye los contactos anteriores. Botones de correo construyen la dirección al pulsar, sin mostrarla completa ni incluir mailto en el HTML inicial. Dificulta rastreo básico, sin impedir extracción por un rastreador avanzado. No se comprobó recepción ni se enviaron correos.
- Los avisos históricos conservan su contenido almacenado; la interfaz sustituye los antiguos contactos de MiBatute por el botón vigente. Los avisos nuevos usan una referencia genérica al canal. La migración contact-channel se aplicó en local y producción, preservando permisos, propietario y configuración de las dos funciones administrativas. No modifica sanciones ni crea mensajes de prueba.
- 33 pruebas aprobadas, compilación correcta y lint limpio en los componentes de contacto revisados. El artefacto no contiene las direcciones completas del contacto anterior ni actual, ni los datos del operador retirados. No hubo pruebas de navegador local ni capturas; se usó el editor administrativo de producción para aplicar la migración.
- Wompi sigue deshabilitado, la recepción del nuevo correo y la revisión jurídica continúan pendientes.


## Entrega autorizada del 23 de octubre: precios y correos de actividad

- Precios propuestos unificados en Cómo funciona y Pagos/devoluciones: 1 crédito por $2.500 COP, 3 por $7.000 y 5 por $11.000, con cálculo común de descuentos. Recargas y Wompi permanecen deshabilitados. No se modifican precios del circuito inactivo ni saldos.
- Administración de la página, exclusiva del superadmin con MFA y sesión vigente: interruptor general, ocho tipos, presupuesto de 1–80 intentos por ventana móvil de 24 horas (50 inicial), contadores y procesamiento manual limitado. Autenticación comparte la cuota externa y conserva su propio flujo.
- Cola de eventos transaccional, por destinatario confirmado, sin backfill y sin avisos duplicados por reintento; apagar descarta pendientes y las entregas inciertas no se reenvían automáticamente. Trabajador protegido y desactivado por variable de entorno. Cron de 15 minutos, máximo tres pendientes; apagado no consulta la base ni envía correos.
- Diez ejemplos ficticios del mismo HTML/texto del envío, con seguridad según contexto, sin recursos externos y con vista móvil/escritorio desplegable. La publicación creada ofrece destacado por $2.500 COP; compra y regalo/compensación tienen controles independientes. No se enviaron correos reales ni se habilitaron pagos.
- Migración email-notifications instalada en producción: siete de siete funciones comparadas con las probadas, cinco triggers (sin Wompi aún), tablas con RLS y privilegios directos revocados al cliente. Estado inicial: apagado, tope 50, cero mensajes en la cola. No se crearon compras, sanciones ni eventos ficticios en producción.
- 297 pruebas generales aprobadas y comprobación adicional del procesador inactivo, compilación y lint de los módulos funcionales sin errores. Sin navegador local ni capturas. La revisión jurídica y la configuración de envío/recepción real siguen pendientes.


## Propuesta local del 27 de octubre: conversaciones de usuarios en el buzón

- Tercera subpestaña con ventas y rescates de los que la cuenta es participante. Consulta privada de 12 filas, sin cuerpos de mensajes ni datos de contacto; mantiene chats cerrados mientras existe el artículo. Consulta al abrir/actualizar/cambiar de página y reutiliza señales existentes, sin canales adicionales ni sondeo periódico.
- Apertura por identificador de conversación para no confundir al comprador histórico con una reserva posterior. Consultar un pendiente desde esta lista no aprueba la compra; las reglas existentes mantienen los chats pendientes/cerrados y las entregas en solo lectura. Eliminar el artículo conserva la eliminación en cascada existente y lo retira de la lista.
- Marcar avisos de la campana como leídos oculta los globos del perfil, las subpestañas y los contadores de avisos de artículos, conservando los mensajes y sus recibos. Un evento posterior vuelve a activar su aviso; las confirmaciones se conservan en el historial local disponible.
- Migración profile-chat-history instalada solamente en Supabase local. Producción no modificada. 50 pruebas dirigidas aprobadas y compilación correcta. Comprobación por terminal, sin navegador ni capturas; servidor local en 127.0.0.1:5174. Pendiente revisión del usuario, sin commit ni deploy.


## Propuesta local del 27 de octubre: checkout Wompi Sandbox

- El usuario configuró las cuatro llaves Sandbox en el archivo local ignorado por Git. Se comprobaron prefijos sin mostrar valores. Se habilitó el checkout únicamente para desarrollo, con Supabase y origen de retorno en loopback; producción conserva PAID_TOPUPS_ENABLED=false y no recibió cambios.
- Paquetes vigentes en servidor y UI: 1/$2.500, 3/$7.000 y 5/$11.000 COP. Nueva migración de precios preserva importes y referencias anteriores; un pendiente antiguo no sustituye una cotización nueva con otro precio. También conserva estados terminales para preparar una referencia nueva tras un rechazo.
- En local el usuario abre el widget oficial de Wompi, sin redirección a localhost para evitar el 403 de CloudFront. Al recibir el identificador del widget se consulta la transacción desde el servidor, contrastando propietario, referencia, moneda, importe y estado; únicamente APPROVED abona mediante la función idempotente. Un aprobado ya registrado se consulta sin volver a llamar al proveedor. No hay sondeo periódico: retorno o comprobación manual. Eventos firmados conservan el circuito de confirmación y registran rechazos sin abonos.
- La base local tiene la opción administrativa de créditos ficticios de Sandbox; se reinició solo PostgREST para cargarla. Esto no se configuró en producción. La prueba SQL de precio, abono y repetición se revirtió en su totalidad; no se crearon pagos de prueba contra Wompi desde las herramientas.
- Se verificaron 302 pruebas generales, compilación y lint de los módulos del checkout sin errores. El artefacto del navegador no contiene las claves privadas configuradas. Servidor local reiniciado en 127.0.0.1:5174; el checkout responde 401 sin sesión, como corresponde. Sin pruebas de navegador ni capturas; pendiente la prueba manual del usuario en el checkout Sandbox. Sin commit ni deploy.


## Avisos persistentes de recargas (local, 27 de octubre)

- Migración `2026-10-27-wompi-inbox-receipts.sql` aplicada solo en Supabase local: una recarga aprobada y efectivamente abonada crea un recibo privado en Avisos del sistema. Incluye créditos, importe y referencia; Sandbox se identifica como simulación. Conserva fechas de recargas anteriores.
- Verificar de nuevo no duplica el aviso ni restaura uno eliminado. La notificación se genera desde el recibo, evitando un segundo aviso genérico por el mismo abono. No requiere consultas periódicas ni depende del envío de correos. Ocho pruebas de Wompi y recibos aprobadas. Sin commit ni deploy.


## Contador de aperturas (local, 27 de octubre)

- Solo se registra al abrir ProductDetail, nunca en tarjetas. Excluye propietario y cuentas admin/master en servidor; la vista de auditoría ni siquiera solicita el registro. Invitados usan un identificador aleatorio de sesión, sin IP ni datos de contacto; usuarios identificados se deduplican entre sesiones durante 24 horas.
- Cache de sesión y memoria evita peticiones repetidas. Un RPC directo a Supabase por apertura elegible; ninguna función Vercel ni sondeo periódico. Totales separados de articulos para evitar triggers de negocio o emisiones realtime. Los totales viajan en la consulta existente mediante relación de PostgREST.
- Solo propietario y staff autorizado leen totales, junto al temporizador en sus publicaciones y en el detalle de auditoría. Valores orientativos desde la instalación, sin reconstruir visitas históricas. Tabla temporal de deduplicación con limpieza ocasional acotada y borrado en cascada al eliminar artículo.
- Migración article-views aplicada únicamente local. Dos pruebas específicas de permisos, exclusiones y deduplicación aprobadas; compilación correcta. Sin navegador, commit ni deploy.


## Publicación autorizada del 27 de octubre de 2026

- El usuario autorizó commit y deploy completos en main y el proyecto Vercel habitual. No se crean ramas, previews ni otro dominio.
- Comprobaciones finales: 307 pruebas aprobadas, compilación y git diff --check correctos; artefactos sin secretos de la configuración local. Los archivos .env locales siguen ignorados y fuera del despliegue.
- Migraciones aplicadas en una única transacción en el proyecto Supabase mibatute (sgxzjggxlswvpedrosck): base de recargas Wompi (ausente previamente), precios vigentes, historial privado de chats, avisos persistentes de recarga y estadísticas de aperturas. Verificación posterior: las cinco comprobaciones de historial, vistas, avisos, guardia legal y ausencia de abonos Sandbox resultaron verdaderas.
- La nueva tabla de recargas conserva la guardia legal existente; no se activa el consentimiento estricto de registro ni se modifica el correo o SMTP. PAID_TOPUPS_ENABLED permanece false. El checkout Sandbox queda exclusivamente local y no se suben sus llaves.
- Incluye todos los ajustes revisados en local: conversaciones del buzón, globos contrastados, correos de recarga, últimas cinco recargas, nuevas recargas, textos e iconos, alineación de controles, disposición móvil de listas y filtros y títulos de destacados por categoría.


## Entrega autorizada del 28 de octubre: controles y publicaciones

- Publicación completa en main y el proyecto habitual, autorizada tras revisión local. Incluye filtro de contactos en título/descripción, avisos en formularios/normas y reglas de palabras/frases administrables únicamente por superadmin con MFA. Sin sanciones automáticas ni OCR de fotos.
- Migraciones account-input-limits y publication-text-rules aplicadas juntas en producción: celular suministrado de 10 dígitos al registrar, compensaciones administrativas de 1–3 créditos con auditoría/idempotencia, tabla privada de reglas y guard de publicación. No modifica datos históricos ni saldos.
- Saldo con animación de 10 segundos al aumentar, respetando movimiento reducido. Estado del producto con seis rangos, guía al crear/editar, colores y explicación en detalle; nota del publicador mediante icono de ayuda.
- Compartir junto a Reportar: opciones nativas o copia/enlace seleccionable. URL limpia sin parámetros de pagos ni datos privados. Apertura del artículo compartido mediante la consulta de catálogo existente, incluso fuera de la primera página, respetando RLS y estado.
- Diagnóstico de configuración de correos restringido al superadmin, sin valores secretos ni envío durante la comprobación. Las cinco variables de producción están presentes; recepción de correo aún pendiente de confirmación. Cron y topes vigentes conservados.
- 317 pruebas aprobadas y compilación correcta. Sin pruebas en navegador local ni capturas. Wompi y recargas reales conservan el bloqueo de producción; la revisión jurídica sigue pendiente.


## Segunda entrega autorizada del 28 de octubre: tamaños, impacto y donaciones

- Tamaño opcional pequeño/mediano/grande en creación, edición, resumen y detalle; también se conserva al reordenar fotos y se muestra en la vista del admin. Sin estimaciones de peso.
- Detalle compacto: estado con ayuda a la izquierda, tamaño con ayuda a la derecha; ubicación junto a vistas privadas y días restantes. No se cambian las reglas de acceso a vistas.
- Contador al pie de Cómo funciona, sin ocupar la página principal. Cuenta cada publicación marcada como entregada una vez desde su activación; total anónimo persistente al eliminar artículos, sin datos históricos añadidos ni entregas ficticias. Aprovecha la consulta del catálogo.
- Tres ventas gratis, o cuatro mientras exista una donación disponible con foto y descripción. Excluye pausadas, reservadas, vencidas/en revisión y la propia donación si se convierte en venta. Sin acumulación por varias donaciones ni cobros retroactivos; los excedentes mantienen el consentimiento de un crédito y el destacado es independiente.
- Migraciones article-size-reuse-impact y donation-sale-bonus instaladas en producción en una única transacción. Verificadas columna, contador inicial cero, helper de cupo y privacidad de tabla/helper. No se modificaron saldos, SMTP ni datos de usuarios existentes.
- 321 pruebas aprobadas, compilación y diff correctos, sin secretos locales en el artefacto del navegador. Publicación autorizada en main y el proyecto habitual; sin navegador local ni capturas. Pagos reales siguen deshabilitados y la revisión jurídica continúa pendiente.


## Entrega autorizada del 29 de octubre: buzón y chats abiertos

- Avisos del sistema con cabecera, remitente, fecha, asunto y cuerpo en párrafos; datos como motivo, saldo y referencia en bloques discretos. Se conservan contactos protegidos, lectura, eliminación confirmada y contenido como texto plano. Cierre por teclado y navegación de foco en el diálogo.
- Conversaciones de usuarios con Solo chats abiertos seleccionado por defecto y alineado a la derecha de la explicación. Desmarcar incluye pendientes y cerrados; cada cambio vuelve a la primera página. Caché y respuestas tardías se distinguen por usuario, página y filtro; sin nuevos canales ni sondeo.
- Migración profile-chat-open-filter instalada en producción: filtra antes de paginar 12 filas, conserva participantes y bloqueo de cuentas y la API anterior de un argumento. Comprobación posterior de compatibilidad, nueva función y permisos: cuatro resultados verdaderos. No se leen ni modifican mensajes privados para esta comprobación.
- 323 pruebas aprobadas, compilación y diff correctos. Sin navegador local ni capturas. Publicación autorizada en main y el proyecto habitual; pagos reales y revisión jurídica conservan su estado anterior.

## Publicación autorizada del 30 de octubre: experiencia de app móvil

- La app instalada y la vista local `?app=1` solicitan 10 renglones por página (hasta 20 artículos normales). Los destacados conservan su fila completa; el navegador móvil y escritorio mantienen sus tamaños anteriores.
- Migración `2026-10-30-mobile-app-page-size.sql` aplicada en Supabase local y, tras autorización, en el proyecto habitual de producción. Conserva búsqueda, filtros, RLS, orden y métricas de reutilización; la ampliación requiere `mobilePageRows=10`. La huella del cuerpo en producción coincide con la migración probada: `507798ef601f8c42f07d100b5d3f8143`.
- Validación previa: 334 pruebas y compilación aprobadas, lint de módulos nuevos sin errores. Verificación anónima local: app 17 artículos, navegador móvil 7 y escritorio 12, sobre 25 resultados.
- Incluye búsqueda y subcategorías horizontales exclusivas de la app, filtros con aplicación explícita, perfil compacto, barra inferior, banner y patrocinadores, mejoras de gestos y cierre de publicaciones, avisos y conversaciones, guía de acceso desde inicio y eliminación del comparador local anterior. La vista `?app=1` se limita al servidor de desarrollo y no se incluye en la compilación publicada.
- Push omitido por instrucción expresa del responsable: sin código, trabajador, dependencia ni migración de push. Seis verificaciones de producción confirmaron función idéntica a la probada, ejecución sin privilegios elevados, permisos anónimos/autenticados conservados y ausencia de tablas de dispositivos y cola push. No se cambiaron SMTP, correos, pagos ni guardias legales.
- Autorizados commit/push en main y despliegue de producción en el proyecto Vercel habitual, sin despliegues de prueba.

## Segunda publicación autorizada del 30 de octubre: avisos y actualización móvil

- Avisos en primer plano para solicitudes, aceptaciones y mensajes; ancho completo con entrada desde arriba y movimiento reducido. Los mensajes muestran el artículo y hasta tres líneas de texto. Preferencias por cuenta/dispositivo y contador opcional del ícono donde exista soporte; no se añade push ni actividad con la app cerrada.
- Migración `2026-10-30-local-message-preview.sql` aplicada en producción tras comprobar la función anterior. Añade una vista previa acotada al mismo evento privado para el destinatario, fuera del historial de la campana; sin consultas o eventos adicionales. Transacción verificada: huella `f5d739e631ef9453c3edc15de9a233ac` idéntica a la migración local y ejecución revocada a clientes anónimos/autenticados. No se leen mensajes ni se generan datos ficticios en producción para verificarla.
- Campo de escritura del chat a 16 px únicamente en móvil para evitar zoom al abrir el teclado del iPhone. Escritorio conserva su tamaño.
- Barra naranja exclusiva de la app móvil con Actualizar ahora. Cada build publica un identificador estático; comprobaciones visibles cada diez minutos y al volver, con mínimo un minuto entre consultas. No recarga automáticamente y no consulta Supabase. La primera versión que incorpora este mecanismo requiere una recarga inicial.
- 343 pruebas, compilación y lint de los módulos nuevos aprobados, diff sin errores. Sin pruebas en navegador local ni capturas. Commit/push en main y publicación autorizados en el proyecto Vercel habitual; pagos, registro, SMTP y revisión jurídica conservan su estado anterior.
