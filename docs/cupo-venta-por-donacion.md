# Cuarto cupo de venta por donación — propuesta local

Tres ventas activas gratis; hasta cuatro si existe al menos una donación propia disponible, no vencida y con título, descripción y foto. Se excluyen las reservadas, pausadas, entregadas y las que tengan un indicador de revisión distinto de aprobado/sin revisión. Varias donaciones no acumulan más cupos. La comprobación de foto/texto es estructural; los reportes y la revisión humana siguen siendo necesarios para detectar ofertas ficticias.

La base calcula el límite en sale_publication_status y lo aplica en el guard de inserciones/cambios/reactivaciones, usando el bloqueo existente por propietario. Se excluye la propia fila de la comprobación cuando una donación se convierte en venta. Publicación y destacado mantienen consentimiento, cobros atómicos e idempotencia; la cuarta gratis destacada consume solo el crédito de destacar.

Si se entrega, retira, pausa, reserva, vence o pone en revisión la donación, el límite para nuevas ventas vuelve a tres. Las ventas existentes siguen publicadas; no se ocultan, cobran retroactivamente ni reembolsan créditos anteriores. Para reemplazar una cuarta gratis, hace falta otra donación que cumpla las condiciones, o utilizar un crédito cuando corresponda. La cuenta de ventas activas sigue incluyendo pausadas/reservadas/en revisión según las reglas anteriores. Se conserva el máximo general de 20 publicaciones activas.

El modal de publicar y Cómo funciona explican la regla. Se aprovechan los RPC existentes, sin llamadas nuevas, sondeo ni canales realtime. El servidor recalcula al publicar aunque haya cambiado la elegibilidad desde la apertura del formulario; si hace falta un crédito, requiere confirmación y no cobra por sorpresa.

Migración 2026-10-28-donation-sale-bonus instalada solo en Supabase local, después de article-size-reuse-impact para conservar el tamaño al publicar. Producción no modificada. Sin commit ni deploy.

Entrega autorizada del 28 de octubre: migraciones instaladas en producción en una sola transacción y con permisos comprobados. Sin entregas ficticias ni relleno histórico. El contador inicia en cero en producción. Pruebas generales: 321 aprobadas; compilación correcta.
