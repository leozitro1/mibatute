# Fotos de perfil privadas

`2026-11-10-private-profile-photos.sql` conserva la proyección pública de perfiles, pero devuelve `NULL` en `foto_url` sin una sesión registrada. `2026-11-10-profile-photo-storage.sql` crea `profile-photos`, un bucket privado de Supabase Storage. Los perfiles guardan una referencia `storage-profile:` al objeto. Solo una sesión registrada puede obtener un enlace de lectura que vence en cinco minutos. Los enlaces firmados funcionan como credencial hasta vencer; no se guardan en la base.

El servidor verifica la identidad y la cuota existente antes de autorizar una subida a un único nombre aleatorio de la carpeta propia. No hay permisos de escritura directa para los clientes en el bucket. Storage limita las subidas a 3 MiB y a los formatos de imagen permitidos. El archivo viaja directamente a Supabase. Las fotos de artículos siguen públicas en ImageKit.

En local se mantiene el bucket privado de prueba `local-profile-photos`, definido en `supabase/local-storage.sql`. La ruta temporal de lectura de ImageKit permite la transición desde la entrega anterior, pero las nuevas autorizaciones de avatar ya no se emiten en ImageKit.

## Cambio de archivos anteriores

La prueba inicial de ImageKit V2 aceptó la subida privada y rechazó el original, la variante sin firma y el enlace vencido. La prueba posterior incluyó el alias con nombre que usa la biblioteca de la cuenta. [ImageKit permite servir archivos privados mediante transformaciones con nombre](https://imagekit.io/docs/media-delivery-basic-security#private-files). Por ese motivo se usa Supabase Storage para los avatares, sin modificar la seguridad global ni la entrega pública de artículos en ImageKit.

1. Copiar cada avatar activo al bucket privado y verificar que rechaza la URL pública y entrega la imagen con un enlace temporal.
2. Cambiar únicamente las referencias vigentes, después de comprobar que coinciden con el inventario anterior. Mantener las copias de ImageKit hasta confirmar que la nueva app está activa.
3. Despublicar las copias anteriores de la carpeta de perfiles, incluidas las versiones históricas. Purgar las variantes conocidas de CDN y verificar que dejan de entregar imágenes. No borrar los originales ni tocar la carpeta de artículos.
