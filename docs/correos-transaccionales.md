# Correos de actividad: propuesta local

Preparado y autorizado para publicar el 23 de octubre de 2026. No se han enviado correos reales.

## Controles

Solo superadmin, con MFA y sesión administrativa vigente, puede abrir Administración de la página, cambiar el interruptor general, los ocho tipos y el presupuesto. Todos comienzan apagados. El tope inicial es 50 intentos por ventana móvil de 24 horas; admite 1–80. Autenticación usa su circuito previo y comparte los límites diarios y mensuales de Resend: este contador no garantiza disponibilidad para esos correos si otras aplicaciones o Auth consumen la cuenta.

Publicación creada avisa a su propietario. Solicitud avisa al vendedor cuando un chat de venta entra en pendiente o al donante por una postulación nueva. Venta significa marcada como entregada y avisa por separado a vendedor y comprador; no acredita cobro ni entrega verificada. Revisión y eliminación se basan en el aviso administrativo existente. Suspensión temporal informa la fecha de finalización en hora de Colombia. Solo destinatarios con correo confirmado; no se incluyen datos personales de la contraparte ni motivos privados en el correo: el usuario los consulta en su buzón.

Una cola transaccional registra solamente eventos ocurridos con las opciones activas; no vuelve a recorrer el historial. Las acciones revertidas tampoco generan avisos. Claves de evento evitan repetir el mismo evento en la transacción y cada mensaje lleva una clave idempotente para Resend. La interfaz y los avisos internos conservan sus funciones aunque se apaguen los correos.

Se descartan pendientes de opciones apagadas, con más de 24 horas, o sin destinatario confirmado. No se reenvían automáticamente fallos o entregas inciertas. Un proceso interrumpido queda por comprobar tras dos minutos; sus intentos siguen contando. El contador muestra aceptados por Resend, sin afirmar entrega en bandeja. Los errores 429/401/403 pausan el interruptor global y descartan pendientes; corregir el problema antes de reactivarlo. Un envío ya iniciado puede completarse tras apagar una opción.

## Activación posterior, previa autorización

1. Revisar en local y aprobar los tipos, textos y presupuesto. Migración: `2026-10-23-email-notifications.sql`, instalada en local y producción; siete funciones verificadas por huella, cinco triggers activos, RLS habilitado y acceso directo de clientes revocado. Wompi no está instalado; su trigger queda pendiente.
2. Configurar solo en servidor `RESEND_API_KEY` (clave con permiso de envío), `NOTIFICATION_EMAIL_FROM` (remitente de dominio verificado), `SUPABASE_SERVICE_ROLE_KEY`, URL y clave pública de Supabase. No poner claves privadas en variables VITE ni enviarlas al navegador. No cambia el SMTP de autenticación.
3. Configurar `CRON_SECRET` para proteger el procesador y, únicamente cuando se autorice enviar, `EMAIL_NOTIFICATIONS_ENABLED=true`. Sin esta bandera no se contacta a Resend. Los interruptores de base siguen siendo obligatorios.
4. La propuesta de Vercel cron procesa hasta tres pendientes cada 15 minutos, sin consultar desde el navegador de los usuarios. Son 96 invocaciones diarias, incluso si no hay pendientes; con la bandera apagada no consulta la base. También hay una acción manual para procesar hasta tres pendientes, exclusiva de superadmin. No se garantiza entrega instantánea.
5. Hacer una prueba real autorizada con cuentas conocidas; comprobar recepción, dominio, remitente y spam. Antes de producción, acordar conservación/limpieza de la cola y gestión de rebotes/bajas operativas; los registros actuales quedan restringidos al servidor. Esto no habilita campañas comerciales.

Las pruebas automatizadas usan PostgreSQL aislado y un proveedor simulado; no envían correos ni cambian la producción. El responsable autorizó commit, push a main y deploy al dominio habitual el 23 de octubre de 2026.

## Diseño y vista previa local

Administración de la página incluye diez ejemplos ficticios, con selector de correo y vistas de 375 px/escritorio. El iframe restringido no ejecuta scripts ni permite abrir los enlaces; la plantilla no solicita imágenes, fuentes o píxeles externos. No consulta usuarios ni consume Resend. La versión de texto también puede leerse.

El trabajador y la vista previa comparten `src/email/templates.js`: HTML con estilos básicos en línea, tablas de presentación, ancho máximo de 600 px, adaptación móvil, asunto, contexto, llamada a entrar en la cuenta y consejo de seguridad específico. No incrusta texto de usuarios como HTML y solo enlaza al dominio canónico. El botón abre el inicio del sitio; luego se inicia sesión y se consulta el apartado correspondiente.

Los diseños son para correos de actividad; no cambian las plantillas de autenticación de Supabase. Se comprobó compilación, lint y siete pruebas de plantillas/cola con proveedor simulado. No se comprobó todavía el aspecto en clientes de correo reales y no hubo navegador local ni capturas. Las diferencias entre Gmail/Outlook y recepción/spam se revisarán con una prueba real autorizada.

## Avisos de créditos y promoción del destacado

La creación incluye un recuadro opcional de destacado a 1 crédito, con precio individual compartido de $2.500 COP, sin garantía de resultados. Por petición del responsable, el correo no muestra el aviso de recargas deshabilitadas; los controles de pagos y envíos conservan su estado. La compra de créditos informa cantidad, importe real y referencia, exclusivamente cuando una recarga de producción pasa a aprobada y tiene el movimiento de abono correspondiente. Sandbox y pagos pendientes no envían ese aviso.

El aviso de regalo/compensación corresponde a movimientos positivos con concepto compensacion_administrativa, regalo o bonificacion; no convierte devoluciones o liberaciones de reservas en regalos. No se otorgan créditos nuevos por activar correos. Ambos tipos comienzan apagados, respetan el presupuesto compartido y tienen vista previa ficticia. Las pruebas comprobaron estos casos junto con autorización, duplicados y plantillas (38 aprobadas); la compilación pasó. No se activaron pagos, envíos reales, commit o deploy.

Si Wompi todavía no está instalado en una base local, se omite únicamente su trigger de recargas; el resto se instala normalmente. Al instalar Wompi se debe reaplicar esta migración y comprobar el trigger antes de activar correos de compras. No se instaló el circuito de pagos para preparar este diseño.

## Publicación autorizada el 23 de octubre

Los controles quedan apagados, con tope inicial de 50 e inbox de envíos vacío. Producción aún no tiene la bandera, el remitente ni las credenciales del nuevo envío; activar un interruptor no basta para contactar a Resend. El cron inactivo responde sin consultas ni envíos, y las acciones manuales conservan la verificación de superadmin/MFA. No se tocó el SMTP de autenticación. La vista previa ahora es desplegable y cerrada por defecto.
