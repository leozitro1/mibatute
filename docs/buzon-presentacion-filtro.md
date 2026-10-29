# Propuesta local: presentación del buzón y filtro de chats

Avisos del sistema: nueva ventana con remitente, fecha, asunto y cuerpo separado en párrafos; motivo, saldo y referencia en bloques suaves. Se mantiene el texto como texto plano, el contacto protegido, las acciones de lectura y eliminación con confirmación. Cierre por Escape y navegación por teclado dentro de la ventana. Sin cambios en los mensajes almacenados ni solicitudes adicionales.

Conversaciones de usuarios: casilla Solo chats abiertos activada por defecto, junto a la explicación y alineada a la derecha. Al desmarcar aparecen también pendientes y cerrados. Abiertos significa chat con estado open y artículo no entregado; las reglas de acceso y solo lectura del chat no cambian. Cada cambio del filtro reinicia la paginación.

El filtro se aplica en PostgreSQL antes de paginar 12 filas, conserva participantes y bloqueo de cuentas, sin cuerpos ni contactos privados. Se mantiene la función anterior de un argumento para clientes existentes; la nueva recibe p_page y p_open_only explícitos. Usa las señales realtime existentes y no añade sondeos ni canales.

Migración 2026-10-28-profile-chat-open-filter instalada solo en Supabase local. Pruebas SQL de privacidad, filtros, paginación, compatibilidad y cuentas bloqueadas aprobadas; pruebas de presentación y compilación correctas. Sin navegador local ni capturas, sin commit ni deploy.

Entrega autorizada del 29 de octubre de 2026: filtro instalado en producción con la API anterior conservada y acceso anónimo bloqueado. 323 pruebas generales y compilación aprobadas. Publicación completa en main y el proyecto habitual, sin modificar mensajes almacenados ni reglas de pagos.
