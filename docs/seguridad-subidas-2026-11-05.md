# Refuerzo de subidas — 5 de noviembre de 2026

Estado: validado en local y contra ImageKit real mediante un despliegue aislado, sin asignarle el dominio público. El responsable autorizó continuar con las pruebas y, si funcionaban, hacer commit y publicar en el proyecto habitual.

## Cambios preparados

- `/api/imagekit-auth` pasa de GET a POST y valida metadatos antes de consultar Supabase. Una solicitud inválida no genera consultas a proveedores.
- La sesión se sigue verificando con `auth.getUser`, una vez por autorización. El propietario de la carpeta debe coincidir con el usuario verificado; no se acepta una ruta arbitraria ni subcarpetas.
- Se firma un JWT HS256 conforme al contrato de ImageKit Upload V2: `kid` público en cabecera, parámetros como strings, `iat`/`exp` numéricos. Duración de cinco minutos y nombre aleatorio generado por el servidor.
- La firma cubre carpeta, nombre, nombre único obligatorio, prohibición de sobrescritura y comprobaciones de MIME real/tamaño que debe ejecutar ImageKit. Modificar esos parámetros invalida la firma.
- Se mantienen los límites de tamaño existentes: 8 MiB para el archivo optimizado de un artículo y 3 MiB para una foto de perfil. Se permiten JPEG, PNG, WebP y GIF; SVG y otros tipos quedan rechazados en las nuevas subidas.
- El navegador envía el archivo directamente a ImageKit V2 con los parámetros devueltos por el servidor. El JWT del usuario de Supabase nunca se envía a ImageKit.
- No se emite la firma heredada V1 ni se recurre a ella si V2 falla. Las pestañas con código antiguo tendrán que recargarse después de un futuro despliegue.
- Las imágenes y referencias anteriores conservan sus URLs. No se borran ni migran archivos existentes.

## Consumo

Se conserva una autorización y una subida directa por imagen, con la misma validación de sesión existente. No se añaden consultas SQL, paso de archivos por Vercel, contadores en base de datos, tareas periódicas, SDK o servicios de pago. No se habilitan extensiones de IA ni transformaciones nuevas. Las respuestas de autorización conservan `Cache-Control: no-store`.

La entrega de firmas V2 por sí sola **no impone una cuota diaria ni un rate limit persistente por cuenta**. Posteriormente se implementó y probó ese control, incluyendo bloqueos, y se autorizó su publicación: [límites y estado de publicación](limites-subidas-local-2026-11-05.md). Su migración ya está aplicada y verificada en producción; la API de esta entrega activa el control al desplegarse.

## Dependencias

`npm audit --package-lock-only` detectó 14 dependencias con avisos conocidos (10 altos, 3 moderados y 1 bajo), principalmente de herramientas de desarrollo y compilación. No es prueba de que esos avisos fueran explotables en la página publicada.

Se ejecutó `npm audit fix --ignore-scripts`, sin `--force`: solo se modificó `package-lock.json`, manteniendo los rangos de `package.json` y sin ejecutar scripts de instalación. El análisis posterior incluido en esa operación informó **cero vulnerabilidades conocidas** para el árbol resultante. Esto no garantiza ausencia de vulnerabilidades desconocidas o no cubiertas por npm.

## Validación y límite real

- **404 pruebas aprobadas**, compilación correcta, ESLint de los archivos modificados sin errores y `git diff --check` correcto.
- Pruebas de autorización: sin sesión, token inválido, carpeta ajena, ruta manipulada, tamaño incorrecto y SVG; verificación independiente de la firma mediante Web Crypto y rechazo criptográfico de cambios en carpeta, controles, sobrescritura y vencimiento.
- Pruebas del transporte con proveedor simulado: parámetros exactos, subida directa, JWT de Supabase limitado al endpoint propio, errores sin reintentos ni fallback V1.
- La documentación oficial identifica Upload V2 como **beta**. Se comprobó su aceptación real en esta cuenta con los casos descritos abajo; la condición beta sigue siendo una dependencia externa a considerar.
- Se intentó una prueba acotada con una imagen sintética; Vercel indicó que los secretos de producción no se pueden exportar y el comando no llegó a ejecutar la prueba. **No se subió ni se eliminó ningún archivo en ImageKit; no se consultaron usuarios de producción.** No se copiaron claves a archivos ni se solicitaron por chat.

## Prueba real posterior, autorizada por el responsable

Vercel confirmó que las credenciales de ImageKit solo están asignadas a producción. Se creó un despliegue con `--prod --skip-domain`, protegido por autenticación de Vercel y una clave temporal adicional de diagnóstico, con `crons=[]`. No se cambiaron los entornos de las claves ni se exportaron. El dominio público siguió apuntando al despliegue anterior durante la prueba.

El endpoint temporal solo ejecutaba comprobaciones fijas: no aceptaba rutas ni archivos del llamante y no devolvía firmas, claves o JWT. Utilizó el mismo firmador `server/imagekitUploadToken.js` que consume la API de la aplicación. La identidad de carpeta fue un UUID sintético; no se crearon cuentas ni se consultaron usuarios de Supabase.

| Comprobación | Respuesta real de ImageKit |
| --- | --- |
| PNG sintético de 1×1 y 69 bytes, con parámetros válidos | 200 |
| Reutilizar el token aceptado | 400: token ya utilizado |
| Modificar carpeta después de firmar | 400: payload distinto del firmado |
| Vaciar los controles después de firmar | 400: payload distinto del firmado |
| Enviar texto con nombre y MIME declarados de PNG | 400: checks validation |
| Enviar el PNG de 69 bytes con máximo firmado de 1 byte | 400: checks validation |
| Eliminar exclusivamente la carpeta aleatoria nueva y su imagen de prueba | 204 |

La prueba del límite usó un máximo deliberadamente pequeño para no transferir archivos de varios megabytes. Las pruebas locales comprueban que la API normal firma los límites de 3/8 MiB; esta prueba real confirma que el proveedor impone el límite firmado sobre los bytes recibidos.

Se retiraron el endpoint temporal del código y el despliegue de diagnóstico antes de publicar. El secreto temporal no forma parte de la configuración habitual ni de la entrega. El consumo de prueba fue puntual: una construcción aislada, seis peticiones de subida y una limpieza. No se añadieron tareas periódicas, proveedores o nuevas consultas durante el uso normal.

Referencias: [Upload V2: formato del JWT y parámetros firmados](https://imagekit.io/docs/api-reference/upload-file/upload-file-v2), [controles del contenido](https://imagekit.io/docs/api-reference/upload-file/upload-file#upload-api-checks). Las políticas avanzadas de carpetas son Enterprise; no se activaron ni se requieren para el código preparado.
