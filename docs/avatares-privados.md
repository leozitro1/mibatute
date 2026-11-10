# Fotos de perfil privadas

La migración `2026-11-10-private-profile-photos.sql` mantiene los nombres y el resto de la proyección pública, pero devuelve `NULL` en `foto_url` sin una sesión registrada. Las fotos de artículos conservan su entrega pública. Las fotos nuevas de perfil se firman para subir como privadas; para visualizarlas, la API valida una sesión registrada y devuelve un enlace de ImageKit que vence en cinco minutos. El enlace temporal funciona como credencial hasta vencer, por lo que no se debe registrar ni guardar en la base de datos.

En desarrollo, `supabase/local-storage.sql` configura el bucket privado de avatares. Solo cuentas registradas pueden leerlo o emitir enlaces temporales; la escritura se limita a la carpeta propia. La ruta de imágenes de artículos sigue usando el bucket público.

## Secuencia de publicación y migración de fotos anteriores

1. Con autorización de publicación, probar primero una imagen sintética en un despliegue protegido con la configuración real. Confirmar que ImageKit acepta la subida V2 con `isPrivateFile`, rechaza la URL directa y las variantes sin firma, y entrega la imagen con firma válida. Revisar las transformaciones con nombre del proyecto, incluida la miniatura del proveedor: [ImageKit documenta que pueden permitir acceso sin firma](https://imagekit.io/docs/media-delivery-basic-security#private-files). Si alguna variante devuelve la imagen, no dar por terminada la protección. No activar restricciones globales que afecten fotos de artículos.
2. Aplicar la migración SQL y desplegar la app de forma coordinada. La vista mantiene su contrato para las sesiones existentes. Verificar con dos sesiones de prueba: sin sesión `foto_url` nulo y firma rechazada; con sesión avatar visible; foto de artículo pública en ambos casos. Verificar también el cambio de foto desde el perfil y la ficha del equipo.
3. Inventariar los archivos históricos del prefijo `/mibatute/perfiles/` y cruzarlos con las referencias actuales. Para cada foto pública que pertenezca a la cuenta, copiar a un nombre nuevo dentro de la misma carpeta como archivo privado. Verificar el archivo nuevo antes de cambiar `usuarios.foto_url`; actualizar solo si todavía coincide con el valor inventariado, para no sobrescribir una foto recién cambiada. Conservar el vínculo anterior para revertir mientras se valida la copia.
4. Una vez verificadas las copias, retirar los originales públicos autorizados y purgar sus URL de CDN, incluidas las variantes de tamaño. Comprobar que los enlaces anteriores dejan de entregar bytes. Revisar también fotos públicas antiguas que ya no estén referenciadas, sin tocar la carpeta de artículos. Los archivos de proveedores externos no se pueden revocar desde MiBatute; deben reemplazarse por una copia privada o retirarse con su proveedor.

Hasta completar el paso 4, los enlaces antiguos que ya se compartieron pueden seguir funcionando. La migración SQL por sí sola no invalida esos enlaces.

## Validación del proveedor

En un despliegue aislado, sin asociar el dominio público, ImageKit real aceptó una subida V2 privada de una imagen sintética. Respondió 200 con una firma válida, 403 al acceder al original o a la variante sin firma, 403 con una firma vencida y 400 para la variante `media_library_thumbnail` sin firma. Se retiró el archivo de prueba (204). Pasaron las 453 pruebas de la aplicación.
