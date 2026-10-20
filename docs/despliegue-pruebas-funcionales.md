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
