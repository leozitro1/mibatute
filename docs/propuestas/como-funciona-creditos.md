# Propuesta local: Cómo funciona y créditos

20 de octubre de 2026. Solicitada para revisar antes de cambiar reglas o publicar.

## Texto propuesto

- Donar: publicar y entregar gratis; el receptor no paga un precio por el artículo. El transporte se acuerda aparte.
- Vender: hasta 3 publicaciones activas simultáneas gratis, sin comisión por venta. Con 3 activas, cada publicación adicional requiere 1 crédito.
- Supuesto para revisar: cerrar una venta libera un espacio gratuito. No se cobra por renovar un espacio libre.
- Destacar: 1 crédito, independiente del crédito de una publicación adicional.
- Recibir donaciones: 2 postulaciones gratuitas en una ventana móvil de 24 horas. Una adicional requiere 1 crédito y no garantiza elección ni prioridad.
- Se propone conservar el máximo actual de 3 solicitudes pendientes, incluidas las adicionales, para que el pago no elimine esa protección.
- Precio de referencia: 1 crédito = $2.500 COP. Se retiran del texto los paquetes anteriores, sin inventar descuentos nuevos.

## Diferencias con la aplicación actual

La página es una propuesta y muestra un aviso explícito. No cambia las RPC, las tablas, el saldo, el formulario de publicación, el checkout ni los textos operativos de otras pantallas. No debe publicarse como una descripción vigente hasta alinear esas piezas.

- Donaciones: la RPC actual calcula 1 gratuita cada 6 horas y hasta 3 pendientes; falta implementar y probar las 2 gratuitas por ventana móvil de 24 horas.
- Ventas: falta implementar y probar el límite de 3 activas gratis y el cobro atómico de la publicación adicional; definir con precisión qué estados ocupan/liberan espacio, reactivaciones y publicaciones adicionales pagadas.
- La página anterior tenía $2.000, $5.000 y $10.000 por paquetes distintos. El checkout acepta paquetes de 2, 5 y 10 créditos; falta revisar y alinear su precio, confirmaciones, recibos y validación de importes antes de activar recargas. No se ajusta dinero solo cambiando textos.
- Destacar ya cobra 1 crédito; verificar que las pantallas muestren el nuevo valor de referencia al implementar el conjunto.
- Precisar con el responsable el tratamiento del crédito de una postulación cancelada/rechazada/no elegida. Actualmente existen retenciones y devoluciones; la propuesta no las elimina ni inventa una política nueva.
- Definir duración del destacado antes de incluir un plazo en la información pública.
- Mantener deshabilitados Wompi y recargas hasta autorización posterior. No atribuir a Wompi una comisión concreta sin verificar el contrato aplicable.

## Segunda revisión de contenido

- Ventaja expresada con precisión: alternativa a Mercado Libre sin porcentaje por venta en MiBatute. No se afirma que todas las opciones de Mercado Libre cobren lo mismo ni se publican porcentajes de un tercero.
- Privacidad: no se promete anonimato ni que nunca se compartan datos. La contraparte ve datos de perfil y ubicación pública del artículo; la persona decide si comparte datos de contacto en el chat. La plataforma no añade un teléfono, correo o dirección personal como método de contacto automático. Falta auditar el contenido de las respuestas públicas/RLS antes de afirmar una garantía técnica más amplia.
- Paquetes sugeridos: 1 crédito $2.500; 3 créditos $7.000 (ahorro $500, aprox. 6,67%); 5 créditos $11.000 (ahorro $1.500, 12%). Son descuentos comerciales propuestos, no una validación de rentabilidad ni una tarifa Wompi. El importe unitario del paquete de 3 se muestra aproximado.
- Botones de compra deshabilitados y marcados Próximamente. No hay conexión al checkout.
- Comparación prudente: «menos que muchos cafés de cafetería», no menos que todos los cafés. Referencia pública consultada: https://juanvaldez.com/tampc/tc-precio-especial-amigos/ (contiene valores por encima de $2.500; precios/condiciones variables). Contexto de costos de Mercado Libre: https://vendedores.mercadolibre.com.co/nota/como-funcionan-los-costos-de-mercado-libre?guideKeyId=GE53&moduleKeyId=MO332.

## Implementación de las reglas en local

Se aplicaron las migraciones `2026-10-20-donation-daily-quota.sql` y `2026-10-20-publication-credits.sql` únicamente a Supabase local. Las diferencias funcionales de ventas/postulaciones descritas arriba corresponden al estado anterior y ahora están implementadas para prueba local. Producción sigue con sus reglas previas.

- Dos postulaciones gratuitas en las últimas 24 horas. Las recibidas/rechazadas/canceladas conservan el recibo y no restauran una gratuidad antes de tiempo. Sigue el límite de 3 pendientes. Se conservan las retenciones/devoluciones existentes para las adicionales.
- Hasta 3 ventas activas gratuitas. Pausadas, en revisión y reservadas cuentan; entregadas y vencidas no, excepto reservas que aún deben finalizar. Se conserva el tope general previo de 20 publicaciones activas.
- Publicación adicional con confirmación explícita de 1 crédito, descuento y creación en una transacción; idempotencia por UUID para no cobrar doble al reintentar. Las imágenes se suben antes del débito para evitar cargos por una subida fallida.
- El destacado usa otro crédito y una autorización privada de un solo uso para impedir marcarlo gratis por una escritura directa.
- Las ventas anteriores no reciben cargos retroactivos. Eliminar una venta adicional que se publicó correctamente no devuelve el crédito de publicación.
- El formulario consulta su estado al abrir, sin temporizadores ni polling. La creación reemplaza varias escrituras de imágenes principales por una transacción.
- Los paquetes/precios de Wompi no se han alterado ni se han habilitado pagos; esa integración continúa pendiente.

## Autorización de publicación

Tras revisar la propuesta y comprobar las reglas en local, el responsable pidió commit y deploy el 20 de octubre de 2026. Las dos migraciones se aplicaron a producción en una sola transacción y se verificaron sus ocho funciones y permisos. Las secciones anteriores conservan el historial de decisiones y pendientes; la indicación de «solo local» describe la etapa de pruebas anterior. La compra de paquetes continúa pendiente y deshabilitada.
