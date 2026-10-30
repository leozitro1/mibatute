# Cancelación y revisión de ventas — entrega autorizada

El responsable autorizó commit y deploy completo en main y el proyecto habitual. Migración `2026-10-30-sale-safety.sql` instalada en Supabase local y producción. Pagos externos y Wompi no cambian.

- El vendedor cancela una reserva, incluso aprobada, con motivo de 8–500 caracteres. Sin pago declarado, vuelve a disponible y ese comprador no puede reservar nuevamente ese artículo. Retirarse como comprador no crea ese bloqueo. Se conserva la regla previa de devolución del crédito adicional de reserva solamente al cancelar el vendedor.
- «Ya pagué» registra una declaración del comprador de una reserva aprobada; no acredita un pago. Cancelar después abre un caso y pausa la publicación. «Pagué y necesito revisión» permite reclamar también tras una cancelación o entrega; una venta ya entregada no se reabre automáticamente.
- El comprador puede pedir revisión del bloqueo sin declarar un pago; ese caso no pausa la publicación. Un pago informado posteriormente convierte el caso en revisión de pago. Tras resolver una revisión de cancelación todavía puede presentarse un problema de pago; una nueva cancelación del vendedor después de una revisión de pago crea otro caso y conserva la decisión anterior.
- Casos compartidos en Reportes, con los contadores/campana existentes, contexto de los últimos veinte mensajes al reportar y el historial del chat mientras se conserva. MFA y permiso de reportes obligatorios; un administrador participante no resuelve su propio caso. Las acciones genéricas de cerrar/eliminar un reporte no evitan el proceso de revisión de venta.
- Administración puede retirar la pausa y recuperar el estado anterior, levantar el bloqueo en casos de cancelación, o cancelar la reserva disputada actual. No cancela la reserva de un comprador diferente. Si quedan otros casos de pago, mantiene la pausa. No confirma pagos, aplica sanciones ni devuelve dinero bancario automáticamente; al cancelar una reserva vigente puede devolver su crédito adicional de MiBatute una sola vez.
- Los participantes ven la decisión en el panel de seguridad del chat. Una revisión de pago ya resuelta requiere aportar información adicional mediante el buzón, evitando reaperturas ilimitadas de la misma reclamación. La decisión administrativa no sustituye los derechos o acciones legales que correspondan.
- Reservas y permisos privados, protegidos frente a escrituras directas. Historial diferenciado por cada reserva para que una pantalla antigua no cancele una reserva posterior. Chats y artículos no se eliminan mientras exista un caso abierto, ni durante siete días tras cancelación o entrega. Esta protección técnica no es un plazo de prescripción. No se activa limpieza automática ni se modifican los borradores jurídicos.
- Una lectura al abrir el panel y al actualizar/actuar. Se reutiliza el canal privado existente para invalidar el panel de la otra parte, sin sondeo periódico ni canales nuevos. Pausar conserva los créditos retenidos y el cupo de compra hasta resolver; las señales no contienen datos bancarios ni documentos.

## Cómo probar

1. Comprador reserva; vendedor abre la gestión y aprueba el chat. En «Seguridad de la venta», cancelar con motivo: disponible, chat cerrado y bloqueo únicamente para ese artículo.
2. Comprador abre Buzón → Conversaciones de usuarios y desmarca «Solo chats abiertos» para encontrar la reserva cancelada. Puede pedir revisión o informar un pago.
3. En otra reserva aprobada, comprador pulsa «Ya pagué». Vendedor intenta cancelar: abre revisión y pausa, sin confirmar ninguna transferencia.
4. Admin/superadmin entra a Reportes → Ver, revisa el contexto y resuelve desde el bloque de revisión de venta. Los participantes actualizan el panel o vuelven a abrirlo para consultar la decisión.

## Verificación

360 pruebas generales aprobadas, incluidas diez comprobaciones nuevas de permisos, cancelaciones, reservas antiguas, declaraciones, revisión y créditos. Compilación correcta. Lint de los módulos de seguridad, chat, gestión y reportes sin errores. Verificación adicional contra los triggers reales de la base local: cancelar, bloquear y declarar un pago posterior crea un caso con pausa; toda esa prueba se revirtió mediante ROLLBACK. No se modificaron casos/saldos de producción ni se enviaron mensajes o pagos de prueba en producción. Sin navegador local ni capturas; la revisión visual queda al responsable.

## Comprobación de producción

Las doce funciones de seguridad y créditos coinciden con las probadas localmente (MD5 de prosrc). Siete verificaciones correctas: funciones idénticas, cinco tablas con RLS, acceso directo revocado, ejecución anónima bloqueada, RPC autenticada disponible, función administrativa anterior privada y cinco triggers nuevos activos. La ejecución usó la opción del panel que activa RLS explícitamente; se comprobó la protección después. No se crearon cancelaciones, casos ni movimientos ficticios en producción.

También se corrige el arranque público sin sesión: el estado inicial nulo de una solicitud de permisos intentaba leer `gate` cuando el identificador del visitante era undefined. Error observado en la consola del sitio público y reproducido en una prueba de renderizado por terminal antes de corregirlo. Las siete pruebas de avisos/renderizado pasan con visitantes, cuentas y ambos diseños. No añade solicitudes a Supabase ni Vercel. Se mantiene el acceso habitual a postulaciones desde la campana y el contador 1/10 solicitudes de las tarjetas.
