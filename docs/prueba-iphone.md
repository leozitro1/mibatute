# Instalación de prueba en iPhone

Configuración inicial para abrir MiBatute desde la pantalla de inicio usando
el mismo frontend. No agrega service worker, caché sin conexión, dependencias,
notificaciones push ni cambios en las funciones del mercado. Requiere internet.
Se conserva el viewport existente y la barra de estado predeterminada para no
extender el contenido bajo la cámara del iPhone.

## Revisión local por terminal

Ejecutar `npm test` y `npm run build`. La carpeta `dist` debe incluir
`manifest.webmanifest` y `logo.png`. Tanto `dist/index.html` como las páginas SEO
generadas deben conservar el enlace al manifiesto y los metadatos de instalación.
Esto comprueba la compilación; no sustituye una prueba en un iPhone real.

Verificación del 29 de octubre de 2026: 324 pruebas aprobadas y compilación
correcta. Se verificaron manifiesto, dimensiones reales del logo y metadatos en
las 11 páginas compiladas. El script SEO existente no ejecuta su función principal
desde esta ruta con espacios, por lo que para comprobar esas páginas se invocó
explícitamente, sin modificar el script:

```sh
node --input-type=module -e 'import {buildSeo} from "./scripts/build-seo.mjs"; await buildSeo();'
```

La instalación, el teclado y los flujos del iPhone siguen pendientes de prueba
real. El responsable autorizó posteriormente commit y despliegue a producción
en main y el proyecto habitual, sin despliegues de vista previa.

La comprobación funcional adicional `npm run local:check` no se completó:
el script usa una publicación sin ciudad/localidad y, al corregir temporalmente
esa ubicación, la cuenta de prueba ya agotó su cupo de ventas gratuitas.
Se revirtió el ajuste del script; no se modificaron publicaciones ni créditos
para forzar el resultado. Las 324 pruebas automatizadas sí finalizaron correctamente.

## Prueba en el dispositivo (pendiente)

1. Tras revisar los cambios y autorizar por separado su publicación, disponer de
   un enlace HTTPS de prueba. La web pública no cambia mientras no se despliegue.
2. Abrir el enlace en Safari, entrar al inicio y usar Compartir → Añadir a pantalla
   de inicio. Si aparece «Abrir como app web», dejarlo activado.
3. Abrir MiBatute desde su ícono: verificar nombre, logo y ventana sin barra de URL.
4. Comprobar catálogo, filtros, acceso y cierre de sesión. La sesión instalada
   puede ser independiente de Safari; iniciar sesión de nuevo si se solicita.
5. Con cuentas y datos de prueba, comprobar subida de fotos, publicación, perfil
   y chat; revisar teclado, desplazamiento y botones superiores e inferiores.
6. Cerrar y volver a abrir; comprobar que la navegación sigue funcionando.
7. Abrir la misma dirección en Safari y en escritorio y comprobar los mismos flujos.

No usar pagos reales ni datos reales para estas comprobaciones. Un iPhone no
puede acceder al servidor del Mac usando `127.0.0.1`; tampoco basta exponer Vite
si Supabase o las imágenes siguen apuntando a direcciones locales del Mac.
No se ha habilitado acceso de red a los servicios locales.

## Reversión

Retirar de `index.html` el enlace al manifiesto y los cuatro metadatos añadidos,
y eliminar `public/manifest.webmanifest`. No hay cachés ni service workers que
limpiar. El ícono de una instalación previa se elimina desde el iPhone.
