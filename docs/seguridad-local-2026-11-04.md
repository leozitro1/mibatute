# Revisión inicial de seguridad — 4 de noviembre de 2026

Alcance: código del proyecto activo, configuración de despliegue y pruebas por terminal. Sin acceso a cuentas de proveedores, consultas a producción, cambios SQL, commit, push o despliegue. Las pruebas SQL usan PostgreSQL embebido PGlite con datos ficticios, no la base de usuarios.

## Correcciones preparadas en local

| Cambio | Qué hace y qué previene | Impacto y consumo |
| --- | --- | --- |
| `Cache-Control: no-store` en `/api/imagekit-auth` | Indica a navegadores e intermediarios que no almacenen las respuestas con firmas temporales de subida, incluidos errores. | No añade consultas. No revoca firmas que ya se hayan emitido. |
| Validación explícita de Bearer y de identificadores antes de las consultas en borrado | Rechaza solicitudes sin credencial válida en formato y listas inválidas antes de consultar Supabase o ImageKit. La validación real de sesión y de propietario se conserva. | Puede reducir llamadas por peticiones inválidas. No es un límite de frecuencia para usuarios autenticados. |
| Espera máxima de diez segundos por petición a ImageKit en borrado | Aborta una petición a ImageKit que no responde y devuelve un error. Todos los archivos siguen verificándose antes de empezar el borrado. | No añade llamadas; ante lentitud real el usuario podría necesitar reintentar. No vuelve atómica la operación entre proveedores. |
| CSP básica y `X-Frame-Options: DENY` globales | Impide incrustar MiBatute en marcos de otras páginas para engañar al usuario con clics; limita cambios de URL base y objetos incrustados. | Configuración estática, sin funciones o consultas extra. Impide también cualquier futura integración que necesite mostrar MiBatute dentro de un iframe. No restringe scripts, imágenes ni conexiones de las integraciones actuales. |
| `X-Content-Type-Options` y `Referrer-Policy` | Evita interpretar recursos con otro tipo de contenido y limita la información de ruta enviada como referencia a otros sitios. | Sin consultas adicionales. No sustituye HTTPS ni la validación de contenido. |
| Ignorar `.env.*`, salvo `.env.example` | Evita añadir por accidente nuevos archivos de entorno al repositorio mediante un `git add` habitual. | Sin impacto en la página. No elimina secretos ya versionados ni protege el historial. |

Las cabeceras globales se aplicarán mediante Vercel después de publicar; Vite local no reproduce automáticamente esa configuración. Se verifica su configuración por terminal, no su efecto real en producción.

## Controles existentes comprobados

- Las pruebas SQL rechazan el cambio de roles desde el perfil, acceso administrativo sin MFA y acceso con sesión administrativa revocada, inactiva o vencida.
- Las pruebas comprueban que datos privados de contacto no están en el perfil público y que usuarios ajenos no acceden al buzón de soporte.
- Las pruebas de créditos rechazan alteraciones directas del libro de movimientos, preservan débitos atómicos y evitan devoluciones duplicadas.
- El endpoint de borrado de imágenes valida la sesión con Supabase y verifica todas las rutas de propietario antes de borrar. Su prueba rechaza archivos de otra carpeta.
- La búsqueda de patrones seleccionados en archivos versionados no encontró claves privadas PEM, tokens de GitHub/Resend, claves secretas nuevas de Supabase ni JWT `service_role`. En los archivos de entorno locales tampoco se detectaron nombres privados o claves Supabase privilegiadas en variables `VITE_*`. Es una búsqueda limitada; no certifica el historial Git, los archivos externos al proyecto ni la configuración de Vercel.

## Pendientes concretos

1. Se completó una primera comparación de metadatos de producción y se retiró el permiso TRUNCATE tras autorización: [resultados y verificación](seguridad-produccion-2026-11-04.md). La revisión es acotada; no certifica todo el esquema.
2. Se preparó el refuerzo de subidas con firma V2, carpeta propia y controles de contenido, conservando la subida directa, y se validó contra ImageKit real antes de la publicación autorizada: [estado y resultados](seguridad-subidas-2026-11-05.md). Esto no impone una cuota por cuenta.
3. Definir límites persistentes contra abuso para firmas y APIs sensibles. Un contador en memoria de una función serverless no protege de forma fiable entre instancias. No se contrató almacenamiento ni un servicio de pago.
4. El 5 de noviembre se realizó `npm audit` y se aplicaron correcciones compatibles; el árbol resultante informó cero vulnerabilidades conocidas. Validación y alcance en el informe de subidas; actualización incluida en la entrega autorizada de esa fecha.
5. Completar CSP para scripts y conexiones tras inventariar y probar todos los orígenes. La política básica añadida no es una defensa completa contra XSS.
6. Comprobar MFA/configuración de las cuentas de proveedores y protección de registro/inicio de sesión en Supabase. El MFA del personal dentro de la aplicación no protege por sí solo Vercel, DNS o ImageKit.

## Referencias

Validación final: 401 pruebas aprobadas, cero fallos; `npm run build` correcto; ESLint limpio en APIs y pruebas modificadas; `git diff --check` correcto. La prueba SEO ahora comprueba las rutas privadas expresamente y evita aplicar `noindex` a todo el sitio al añadir cabeceras globales. Sin pruebas de navegador ni comprobación de cabeceras desplegadas.

- [Supabase: permisos y seguridad de la API](https://supabase.com/docs/guides/api/securing-your-api).
- [Vercel: cabeceras en vercel.json](https://vercel.com/docs/project-configuration/vercel-json).
- [ImageKit: subida desde JavaScript](https://imagekit.io/docs/integration/javascript).
