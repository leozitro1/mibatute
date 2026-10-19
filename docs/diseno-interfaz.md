# Diseño de la interfaz pública

La revisión del 19 de octubre de 2026 extiende el estilo del catálogo y perfil a los flujos de usuario. Los cambios siguen en local hasta aprobar commit y despliegue.

## Cobertura

- Detalle del artículo: galería, condición, precio, descripción, vendedor y formulario de solicitud.
- Publicación y edición: campos compartidos, fotos, recorte y acciones.
- Calificaciones desde perfil y detalle: tipografía, estrellas con etiquetas accesibles y botones.
- Reservas: confirmación y avisos; se conservan los mensajes de compromiso y créditos.
- Gestión de ventas y postulaciones: diálogos y acciones existentes.
- Chat: cabecera, artículo, mensajes propios/recibidos, recogida, editor y denuncia.
- Perfil: aviso completo del buzón, vista previa y confirmación de eliminación de cuenta.
- Acceso, registro, recuperación de contraseña, recarga y confirmación de salida.
- Menú de notificaciones y página Cómo funciona.

## Implementación

`MarketplaceSurfaces.css` comparte los estilos de `.marketplace-surface`, `.marketplace-modal` y `.marketplace-chat`. Los componentes conservan las validaciones, estados, consultas y eventos existentes. No se añaden librerías, fuentes remotas ni llamadas de datos.

Se conservan los colores semánticos de errores, advertencias, estados y acciones destructivas. El chat mantiene mensajes, recogida y editor en sus regiones de desplazamiento independientes.

## Comprobación

- Compilación y suite de pruebas del proyecto.
- Revisión local de detalle, publicación, edición, confirmación de reserva, chat, formulario de recogida y denuncia en pantalla estrecha, sin publicar, reservar, enviar mensajes ni reportes.
- Las calificaciones y sus estados se revisan en el código compartido: no se fabrican entregas ni se envían calificaciones para activar el diálogo.
- Recargas y acceso conservan sus integraciones; no se realizan pagos ni cambios de contraseña.

El panel de personal tiene su propio sistema de estilos. Los componentes antiguos `SellerDashboard` y `SellerManagement` no están importados en los flujos actuales y no se modifican.
