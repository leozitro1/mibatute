# Avisos de administración

La campana, el menú y Pendientes comparten el resumen `staff_attention_summary`. Los puntos en las filas identifican publicaciones por revisar, reportes/solicitudes de datos sin resolver y conversaciones sin leer.

- Reportes y solicitudes: estados `open` y `reviewing`; abrirlos no los resuelve.
- Publicaciones: estados de revisión `pending`, `en_revision` y `reviewing`.
- Buzón: lectura individual de cada administrador, incluso si otro ya leyó la conversación. No es un contador de conversaciones sin respuesta.
- El total no incluye cuentas del equipo ni suma dos veces el apartado Pendientes.
- El servidor exige permisos, segundo factor y sesión de gestión vigente; no envía cuerpos de mensajes ni datos personales por los eventos.

## Consumo

Se reutiliza un único canal privado `mb:support:staff` para todo el panel. El buzón integrado no abre otro canal. Una consulta obtiene todos los contadores; los eventos se agrupan durante 350 ms. No hay sondeo periódico. Las pestañas ocultas acumulan cambios y consultan al volver a estar visibles. Una reconexión sincroniza los contadores y la sección visible. Los errores conservan el último resultado y muestran una advertencia; no hay bucle de reintentos de consultas.

## Instalación y validación

Aplicar `supabase/migrations/2026-10-20-staff-attention.sql` antes del frontend. Es repetible y añade tres índices parciales, dos funciones y seis triggers; conserva las políticas del canal privado existentes.

Validación local: migración aplicada a Supabase local; 271 pruebas aprobadas en la entrega completa, incluidos permisos/MFA/sesiones, lectura por administrador, contenido mínimo de eventos, agrupación, pestañas ocultas y reconexión. Compilación y lint de archivos modificados aprobados. Campana probada con datos de muestra en escritorio y móvil, y después con la sesión real local del administrador: apertura del panel, conteos y navegación. Se corrigió y cubrió el uso del temporizador nativo del navegador.

La migración se aplicó en producción el 21 de octubre de 2026, como parte de la entrega completa documentada en `despliegue-pruebas-funcionales.md`.
