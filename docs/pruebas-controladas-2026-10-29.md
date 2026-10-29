# Revisión para pruebas controladas — 29 de octubre de 2026

## Cambio preparado en local

Identificación de MITRIAPP como nombre que puede aparecer en Wompi: aviso antes del pago y en la confirmación dentro de Recargar créditos, sección de Pagos y devoluciones y correo de compra de créditos (también su vista previa). Nombre informado por el responsable, sin presentarlo como razón social ni atribuirle una relación societaria no comprobada. Preparado inicialmente sin commit/deploy y sin activar pagos ni enviar correos. Posteriormente el responsable autorizó commit y deploy en main y el proyecto habitual junto con la instalación de MiBatute en iPhone, sin vistas previas.

## Evidencia actual

- Sitio público y página de pagos responden HTTP 200. Registro habilitado para pruebas en el código; los documentos y sus aceptaciones siguen identificados como borrador, no como aprobación jurídica.
- El endpoint de recargas responde configured=false. En Vercel Production no figuran WOMPI_ENABLED, WOMPI_ENVIRONMENT ni las cuatro claves/secrets de Wompi. Se revisaron solo nombres de variables, sin exportar credenciales. Sandbox permanece exclusivamente local.
- Las cinco variables del trabajador de correos están presentes. Consulta agregada de producción: correo general y publicación activados, límite 50, tres mensajes en estado sent, sin otros estados en la cola al revisar. Sent acredita respuesta de aceptación del proveedor registrada por el trabajador; no demuestra recepción en bandeja ni ausencia de spam. No se leyeron destinatarios ni contenido privado, no se modificó la cola ni se enviaron mensajes.
- No hay versión legal definitiva habilitada en la base. La guardia legal de recargas está instalada. El código mantiene LEGAL_READY=false y PAID_TOPUPS_ENABLED=false. Tener claves de Wompi no basta para habilitar compras.

## Próxima prueba con personas conocidas, sin cobros

Usar dos cuentas distintas y mayores de edad. Comprobar registro y confirmación de correo, una venta y una donación, postulación/solicitud, aprobación y chat, mensajes/notificaciones/buzón, entrega marcada y límite 3/4 ventas. Confirmar privacidad entre cuentas y solo lectura al cerrar. Verificar en las bandejas el correo de publicación, además del registro sent del sistema. Son pruebas manuales pendientes; las pruebas automatizadas no las sustituyen. Para créditos opcionales, una compensación administrativa registrada de hasta tres por operación permite probar sin simular compras reales.

## Antes de aceptar dinero real

1. Confirmar cómo corresponde MITRIAPP al titular responsable, qué nombre muestra el checkout y qué identificación/condiciones definitivas deben estar disponibles. Cerrar revisión de condiciones, información tributaria/facturación y procedimiento de devoluciones, sin marcar aprobaciones por defecto.
2. Con autorización específica posterior, configurar las llaves y secretos de producción en el servidor, URL de eventos https://www.mibatute.com/api/wompi-events y retorno al sitio habitual. No copiar llaves de prueba a producción ni usar tarjetas reales en Sandbox.
3. Mantener primero pruebas Sandbox en local de aprobado, rechazo, pendiente y verificación repetida sin doble abono. La URL local no recibe eventos públicos; falta comprobar recepción efectiva del webhook y recuperación de un pago que no vuelve al sitio.
4. Cuando se habilite producción de forma expresa y estén cumplidas las condiciones/consentimientos, el responsable hará una compra pequeña controlada con dinero real; contrastar transacción en Wompi, créditos e historial/buzón/correo y repetición sin abonos duplicados. Nunca realizar el cobro desde las herramientas sin autorización específica.

El respaldo adicional de imágenes continúa aplazado por decisión del responsable; no se implementó ni se reabre como requisito para esta prueba puntual. No se certifica el lanzamiento público general ni la revisión jurídica.

Validación del cambio: pruebas de plantillas y Wompi aprobadas (12), compilación y lint de los módulos modificados correctos. Sin navegador local ni capturas.

Documentación oficial contrastada: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/ y https://docs.wompi.co/docs/colombia/eventos/. Wompi distingue llaves/API de Sandbox y producción y pide configurar la URL de eventos por ambiente; el retorno del navegador no sustituye esa comprobación.
