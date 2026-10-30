# Avisos locales y contador del ícono

Publicación autorizada por el responsable, sin push. La migración de vistas
previas `2026-10-30-local-message-preview.sql` está aplicada en local y producción.

- Solo en la app móvil instalada o en la previsualización local `?app=1`.
- Campana → Avisos en este dispositivo: activar/desactivar avisos breves,
  probar un aviso local y activar/desactivar el contador del ícono.
- Los avisos breves están habilitados inicialmente; el contador requiere una
  activación expresa por dispositivo y cuenta. Preferencias locales, sin RPC.
- iPhone requiere permiso de notificaciones para mostrar el contador. Se pide
  únicamente al tocar Activar contador. Se usa Badging API directamente;
  no se registra un trabajador, una suscripción o un remitente push.
- Otros navegadores pueden no admitir el contador; los avisos dentro de la app
  siguen disponibles. Un permiso concedido no garantiza que el usuario tenga
  habilitados los globos en sus ajustes del sistema.

## Datos y comportamiento

Reutiliza el mismo estado privado de la campana y el bus local del socket actual.
La implementación no añade `fetch`, RPC, canales, consultas periódicas, tablas,
funciones Vercel, librerías ni dependencias. Abrir la campana desde un aviso breve
usa su estado actual sin solicitar otro historial.

Solo considera mensajes, solicitudes de compra/donación y aceptaciones de venta
o donación. El contador representa grupos pendientes de esos tipos, no personas
ni un recuento exacto de textos privados sin leer. Se actualiza al cambiar los
avisos existentes y se limpia al cerrar sesión o desactivarlo. Las operaciones
nativas se serializan para que un envío pendiente no sobrescriba el borrado.

Los avisos breves duran ocho segundos y permiten cerrar/abrir la campana.
Muestran el artículo y, para mensajes, una vista previa de hasta 220 caracteres
y tres líneas. La migración añade hasta 240 caracteres al mismo envío privado
existente para el destinatario del mensaje, fuera de `notice`: el cuerpo no se
añade al historial local de la campana ni al contador. Sin nuevas consultas,
canales, eventos o tablas. El texto se renderiza como texto, sin interpretar HTML.
El banner ocupa todo el ancho y entra desde arriba, respetando el área segura
y la preferencia de reducir movimiento. Solo nace de eventos
recibidos en vivo: no reproducen el historial de inicio, relecturas o eventos
vistos en segundo plano; omiten mensajes del chat abierto y agrupan ráfagas.
El botón Probar aviso no crea mensajes, avisos persistentes ni contadores.

Con la app cerrada o suspendida, no llegan avisos nuevos por este mecanismo.
El ícono puede conservar el último valor conocido hasta volver a abrirla.
No se simulan notificaciones del sistema ni se mantiene una conexión artificial
en segundo plano. La prueba de visualización del globo en un iPhone real queda
pendiente; el modo de previsualización no reproduce los permisos del teléfono.

Validación final: 343 pruebas generales aprobadas; 13 pruebas dirigidas tras añadir
vistas previas, incluida la migración SQL. Verifican
conteo, filtros, duplicados, privacidad, permisos, cambio de cuenta y escrituras
nativas en curso, longitud y aislamiento del texto al destinatario.
Compilación correcta, lint de los módulos nuevos sin errores y
sin diagnósticos adicionales en MarketplaceApp o Navbar respecto a su base.

## Aviso de nueva versión

Solo en la app móvil: barra naranja de ancho completo encima del encabezado,
con el botón Actualizar ahora. Recarga únicamente al tocarlo; no fuerza recargas
ni borra el estado mientras el usuario trabaja. Conviene enviar/guardar antes.
Cada compilación publica `app-version.json` con el mismo identificador incluido
en el JavaScript. Se comprueba al abrir, al volver a la app y cada diez minutos
en primer plano; mínimo un minuto entre comprobaciones, sin consultas offline
o en segundo plano. Es un archivo estático con `cache: no-store`, sin Supabase,
funciones Vercel ni notificaciones push. Fallos de red o respuestas inválidas
no muestran avisos. Una vez detectado un cambio no se sigue consultando.

La detección requiere haber cargado una versión que ya incluya este mecanismo;
una app abierta antes de su primera publicación necesitará recargarse una vez.
Previsualización local del diseño: `http://127.0.0.1:5174/?app=1&update=1`.
En desarrollo solo ese parámetro muestra la barra, sin simular un despliegue.
Tres pruebas verifican identificadores, consultas limitadas, retorno a primer
plano, desconexión, errores y limpieza; compilación comprobada con el mismo
identificador en el archivo y el bundle.

## Referencias revisadas

- [Badging API, repositorio W3C](https://github.com/w3c/badging).
- [Badging para apps de inicio, WebKit](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/).
- [Sonner, avisos para React](https://github.com/emilkowalski/sonner).

Sonner se revisó como referencia para avisos breves. La integración usa nuestros
componentes y la API nativa, sin instalar el paquete ni adoptar otro servicio.
