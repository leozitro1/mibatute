# Ficha de Mis rescates — propuesta local

Se elimina el ojo y la fila abre la misma ficha de artículo del mercado. El título permite abrirla por teclado. Web y móvil muestran fotos, descripción, estado, condición, tamaño, ubicación y la referencia disponible. El bloque de solicitud distingue donación enviada/aceptada/rechazada/cancelada/recibida y compra pendiente/reservada/cancelada/completada. Mantiene chat, retiro/cancelación y calificación según las reglas existentes; no presenta formularios para volver a solicitar o comprar.

Las acciones de la lista no propagan el clic de apertura. La ficha conserva foco/cierre y bloqueo de desplazamiento, reutiliza el estado y las acciones de cada fila y refleja los cambios de los eventos existentes. Al calificar cierra la ficha para mostrar el diálogo correspondiente. No se cambian reglas de reservas ni historial.

Se amplían las proyecciones actuales de rescates para obtener campos públicos del artículo en las mismas lecturas. Migración `2026-11-03-rescate-article-details.sql` aplicada únicamente en local: función de lectura con RLS y permisos conservados, sin datos de contacto adicionales. Dieciocho pruebas de estados, renderizado, permisos, aislamiento y flujos existentes aprobadas, compilación correcta. Sin navegador local ni capturas. Pendiente revisión local y autorización de commit/deploy.

## Publicación autorizada

Tras la revisión, el responsable autorizó commit y deploy del conjunto pendiente. Migración aplicada en el proyecto de producción habitual, con huella, permisos y RLS verificados. Suite completa de 378 pruebas y compilación aprobadas; ver registro general de despliegue.
