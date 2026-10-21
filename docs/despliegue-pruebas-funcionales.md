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
