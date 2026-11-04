# Propuesta local: verificación manual de cuentas

Preparada el 4 de noviembre de 2026 y autorizada para publicación tras la revisión local. Los apartados siguientes documentan las pruebas locales.

- En el perfil, debajo de Editar perfil: Verificación de cuenta → Verificar cuenta.
- Se solicitan nombre completo como aparece en la cédula, número sin puntos y fecha de expedición. Requiere autorización separada y correo confirmado; el registro permanece independiente.
- Enviar crea una solicitud pendiente. No entrega una insignia.
- En el panel del equipo: Verificación de cuentas. Disponible para superadmin y administradores con permiso Usuarios y sesión MFA activa.
- El equipo compara el nombre del perfil y el legal y deja una comprobación o motivo de 10 a 500 caracteres visible para el usuario. Puede aprobar, rechazar o retirar una aprobación. El usuario puede corregir una solicitud rechazada.
- La ficha pública del artículo muestra Cuenta verificada solo tras aprobar. Recargar la ficha/perfil permite ver el nuevo estado. Las cuentas anteriores comienzan sin insignia.
- No se permite revisar la cuenta propia, aprobar dos cuentas con la misma cédula ni sobrescribir una decisión usando una revisión antigua. Se audita la decisión sin copiar los datos de identidad al historial general.
- La cédula, nombre legal y fecha se guardan en una tabla privada con RLS y sin acceso directo del cliente. Solo el titular y el personal autorizado acceden mediante funciones específicas.

## Comprobación para revisión

1. Entrar con una cuenta local confirmada y abrir el formulario desde el perfil.
2. Enviar datos ficticios y comprobar En revisión, sin insignia en los artículos.
3. Desde otra cuenta administrativa local, abrir Verificación de cuentas y registrar una decisión.
4. Recargar el perfil y el artículo: aprobación muestra la insignia; rechazo permite corregir y reenviar. Retirar la aprobación quita la insignia.

Validación por terminal: 384 pruebas aprobadas, incluidas seis de este flujo; compilación correcta y lint de módulos nuevos sin errores. API local comprobada con la cuenta ficticia de comprador: estado inicial, bloqueo de lectura directa, rechazo sin autorización e insignia ausente. Sin navegador ni capturas.

## Pendiente antes de publicación

Definir cómo se comprobarán realmente los datos y la correspondencia con el solicitante, y revisar la autorización y los plazos de conservación. Introducir cédula y fecha no demuestra titularidad. La propuesta no consulta la Registraduría ni hace comprobación biométrica. La política permanece en borrador; no se han aprobado condiciones jurídicas definitivas ni activado borrados.

Migración instalada exclusivamente en Supabase local: `2026-11-04-account-verification.sql`.

## Propuesta de avisos e insignias

La migración adicional `2026-11-04-account-verification-notices.sql` está instalada solo en local. Al aprobar una nueva solicitud se crea un aviso privado «Tu cuenta fue verificada» en el buzón y la lista de notificaciones. Si los correos de actividad y la opción Cuenta verificada están activos, se registra un correo en la cola existente, con su límite y controles de entrega. Reintentar una decisión no duplica los avisos. No se envían avisos retroactivos por las aprobaciones anteriores a esta migración.

La insignia con icono aparece en la cabecera del perfil, en el detalle del artículo y junto al título de las tarjetas del mercado. El listado recibe únicamente un booleano desde la proyección pública de propietarios, reutilizando su consulta; no realiza una petición de verificación por tarjeta. Al regresar a la pestaña o abrir el aviso del buzón se actualiza el estado del perfil. Para actualizar un listado ya cargado, recargar el mercado.

El ejemplo de correo está en Dirección → Administración de la página → Vista previa de los correos → Tu cuenta fue verificada. No incluye cédula, fecha de expedición ni las notas de revisión. El envío real sigue deshabilitado en desarrollo; la vista previa no envía mensajes.

Validación adicional: 386 pruebas aprobadas y compilación correcta. Una prueba transaccional en Supabase local confirmó insignia pública, correo único en cola y aviso disponible en `notification_activity_feed`; los datos ficticios se revirtieron. Sin navegador, capturas, envíos reales ni publicación.

## Historial compartido de verificaciones

En Dirección y Operaciones → Verificación de cuentas → Historial de decisiones se consultan las aprobaciones, rechazos y retiros, con fecha, cuenta y administrador. Cada solicitud también tiene Ver historial de esta cuenta. La lista se pagina de 20 en 20 y distingue la decisión histórica del estado actual.

Se reutiliza la auditoría existente: corregir o volver a revisar una solicitud no reemplaza sus decisiones anteriores. No se copian cédulas, fechas de expedición ni notas privadas a esta vista. Se muestran las decisiones que quedaron registradas; no se inventan registros anteriores. Solo acceden el superadmin y el equipo con permiso Usuarios, MFA y sesión administrativa activa.

Migración `2026-11-04-account-verification-history.sql`, instalada solo en local. Ocho pruebas del flujo de verificación, compilación y lint del módulo de revisión aprobados por terminal.

## Filtro y retirada desde Usuarios

En Dirección y Operaciones → Usuarios está disponible Verificación: Todos, Usuarios verificados o Usuarios no verificados. Se combina con búsqueda, ubicación, estado y reportes antes de contar y paginar. La lista indica el estado de verificación sin cargar datos del documento. Una cuenta con una aprobación conserva esa clasificación administrativa aunque esté bloqueada; permite localizarla y retirar la aprobación si corresponde. La insignia pública sigue respetando el bloqueo.

En las cuentas aprobadas, la acción Retirar verificación abre una confirmación con motivo obligatorio de 10 a 500 caracteres, visible para el titular. Se utiliza la función de revisión existente y la revisión de la fila: un cambio concurrente exige actualizar. El administrador no puede retirar su propia verificación. La acción retira la insignia sin bloquear la cuenta y mantiene la aprobación y la retirada en el historial.

Migración `2026-11-04-staff-user-verification-filter.sql`, solo en local. Nueve pruebas del flujo verifican permisos, combinación de filtros, paginación y retirada con historial; lint del panel y compilación correctos.

## Filtro del mercado por cuentas verificadas

El control Solo activas se sustituyó por Solo cuentas verificadas en web y móvil, incluidos los filtros aplicados y su restablecimiento. Desactivado muestra las cuentas que cumplan los demás filtros; activado limita los artículos y destacados a propietarios con verificación aprobada y cuenta habilitada. Ya no se ofrece el filtro por disponibilidad en esta interfaz.

Migración `2026-11-04-home-verified-accounts.sql`, aplicada solo en local. La restricción se ejecuta antes de contar, ordenar y paginar, preservando las reglas de búsqueda, tamaños de página y RLS existentes. El cliente conserva la compatibilidad de la API anterior sin activar el filtro eliminado. Prueba de API local aprobada y pruebas de búsqueda, destacados, paginación y retirada de verificación; sin navegador ni publicación.


## Publicación autorizada del 4 de noviembre

Las seis migraciones de verificación, avisos, historial, filtro administrativo, filtro público y cuadrícula móvil se aplicaron al proyecto de producción habitual en una sola transacción. Diez cuerpos de función coinciden con los probados en local; RLS y permisos privados verificados. Se preservaron los controles anteriores de correo y el registro habilitado. No se trasladaron cuentas ni verificaciones locales, no se crearon solicitudes ficticias ni se enviaron correos de prueba a usuarios reales.

El frontend se publica desde main en el proyecto Vercel habitual, incluyendo todas las mejoras revisadas en esta conversación. Las cuentas existentes comienzan sin verificación de identidad. El código del restablecimiento de contraseña se limita a fixtures locales; no se alteraron credenciales de producción. La revisión jurídica permanece en borrador y los pagos reales continúan deshabilitados.
