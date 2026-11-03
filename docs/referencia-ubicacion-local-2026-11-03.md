# Referencia general de ubicación — revisión local

Campo opcional «Barrio o cerca de:», de una línea y máximo 100 caracteres, debajo de Localidad al crear/editar. Se muestra en la revisión de publicación, detalle público, detalle desde el chat y vista administrativa. Reutiliza las consultas existentes y el mismo índice GIN de búsqueda; se agrega ciudad/localidad/referencia al documento indexado. Las búsquedas del perfil también aceptan esos datos.

`location_reference` se guarda en articulos, vacío para anuncios anteriores. Misma transacción de publicación y de edición con reordenamiento de fotos, sin cambiar cobros, límites ni permisos. Validación de longitud y contacto en cliente y servidor; espacios normalizados y contenido mostrado como texto. Campo a 16 px en móviles conservando zoom manual. No usa geocodificación, mapas, listas de barrios ni nuevos servicios externos.

Migración `2026-11-03-article-location-reference.sql` aplicada solo en Supabase local PostgreSQL 17. Usa SET EXPRESSION para recalcular el documento generado y su índice sin eliminar columnas ni cambiar la API de búsqueda. Verificar PostgreSQL 17 o superior antes de su futura aplicación en producción. Las funciones de publicación, edición con fotos y vista administrativa conservan su firma y permisos; guardia de texto ampliada al nuevo campo.

374 pruebas aprobadas, compilación correcta y verificaciones por terminal. Sin navegador local ni capturas. El error de lint existente en articleValidation.js:7 está también en HEAD y no se modificó esa expresión; los otros módulos revisados no añaden diagnósticos. Sin commit ni deploy; pendiente revisión del responsable.

## Publicación autorizada

El responsable autorizó commit y deploy después de la revisión. La etiqueta «Barrio o cerca de:» se conserva solo en el formulario: en el anuncio, resumen y chat se muestra la referencia sin prefijo. Migración aplicada en producción con PostgreSQL 17.6 y verificaciones de funciones, permisos, límite, índice y RLS correctas; ver el registro general de despliegue.
