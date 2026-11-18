# Transición de vendedores y atención de reclamos

Propuesta para revisión del 10 de noviembre de 2026. El registro está en vista previa local; esta propuesta no fija una fecha de activación ni cambia anuncios de producción.

## Cómo incorporar a quienes ya venden

1. **Antes de activar:** contar vendedores pendientes y ofertas por estado con la [consulta de inventario](../scripts/count-seller-registration-backlog.sql). Preparar Privacidad, confirmar el procedimiento de reclamos y probar el flujo con datos ficticios. Acordar la fecha de activación con el responsable tras la revisión jurídica; la Ley 1480 no se cita como fuente de un período de gracia.
2. **Aviso previo:** mostrar a quienes ya venden un aviso en Mi perfil con fecha y acceso directo al formulario. Permitir confirmar datos existentes, sin importar cédulas de la verificación voluntaria ni solicitar documentos por correo o chat. La primera venta, las conversiones de donación a venta y las reactivaciones seguirán el mismo control desde la activación.
3. **Al activar:** retirar temporalmente del catálogo las ofertas disponibles cuyo vendedor siga sin registro e impedir nuevas reservas sobre ellas. La pausa propuesta se deriva del estado del registro: no borra anuncios, no cambia créditos ni fuerza al vendedor a republicar. Al completar el registro, el anuncio vuelve a ser elegible solo si cumple las demás reglas, incluidos vencimiento, moderación y sanciones.
4. **Reservas y ventas ya iniciadas:** conservar acceso de los participantes, chat y acciones de entrega o cancelación. Si se cancela una reserva de un vendedor pendiente, el artículo queda fuera del catálogo hasta que se complete el registro. Las donaciones y las compras de una cuenta sin perfil de vendedor siguen funcionando.

Texto de aviso para revisar: «Completa tu registro de vendedor en Mi perfil antes del [fecha acordada] para mantener visibles tus ventas. Tus datos se guardan en privado. Puedes terminar o cancelar las reservas que ya tienes aunque aún no hayas completado el registro».

La vista previa local ya incluye el aviso y la pausa de catálogo, enlaces públicos y reservas nuevas de anuncios anteriores. Los anuncios conservan su estado; la pausa se calcula al consultar el catálogo y al intentar reservar. Al guardar el registro, el aviso desaparece y las ofertas elegibles vuelven al actualizar el catálogo. Sin fecha configurada no se ocultan ofertas anteriores.

La migración `2026-11-10-seller-registration-transition.sql` está instalada solo en `supabase_db_mibatute`. La [vista previa local](http://127.0.0.1:5174/) usa una fecha de demostración futura. En una transacción revertida, el catálogo local de Bogotá pasó de 28 a 14 anuncios y volvió a 28 al revertir. Las pruebas dirigidas cubren enlaces, destacados, privacidad de participantes, reservas nuevas rechazadas sin débito, entregas y cancelaciones en curso y restauración de visibilidad. La fecha real y el despliegue siguen pendientes.

## Cómo atender una solicitud de identificación

El [artículo 53 de la Ley 1480](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm) contempla la consulta de la identificación del oferente por quien compró para presentar una queja o reclamo, y el suministro a la autoridad competente cuando lo solicite. La entrega debe respetar el acceso restringido y las personas habilitadas para recibir la información según los [artículos 4 y 13 de la Ley 1581](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).

1. Usa el buzón de soporte o el correo oficial. Pide la referencia del anuncio, la fecha aproximada y la finalidad de la solicitud. Confirma la identidad y verifica la compra con evidencia pertinente, aunque el acuerdo y el pago se hayan hecho fuera de MiBatute. Pide únicamente lo necesario y permite ocultar datos de pago o de terceros. Para solicitudes sobre los propios datos, usa Solicitudes de datos.
2. Si corresponde, facilita al comprador verificado la identificación del oferente por un canal privado autorizado. Para requerimientos de una autoridad, verifica entidad, competencia, radicado y alcance por un canal oficial. Deja en el mismo hilo o correo una constancia mínima de la decisión y, si hubo entrega, del destinatario, la fecha, el medio y las categorías. Mantén los valores del registro fuera de las respuestas ordinarias del buzón y de la constancia.
3. Si el reporte muestra una infracción, aplica las herramientas habituales para retirar el anuncio o restringir la cuenta. Comprador y vendedor resuelven directamente el pago, la entrega y las devoluciones. El equipo atiende la solicitud de identificación y la moderación en los canales existentes.

Respuesta inicial para revisar: «Recibimos tu solicitud. Indícanos el artículo, la fecha aproximada y el motivo del reclamo. Si necesitamos constancia adicional de la compra, te indicaremos cómo aportarla de forma privada. No envíes contraseñas ni números completos de tarjetas».

En la vista previa local, un superadmin con segundo factor reciente puede consultar el registro actual del vendedor a partir de una publicación de venta, después de confirmar que comprobó la identidad y la evidencia. El panel usa el último mensaje del solicitante como referencia del hilo. La evidencia se verifica manualmente y la consulta puede hacerse sin una reserva, un pago registrado o una entrega marcada en la app. Si el anuncio ya no está disponible para la consulta interna, se verifica el vínculo mediante la evidencia aportada y las fuentes autorizadas disponibles. La consulta devuelve el registro actual, cuya vigencia puede ser posterior a la compra.

Cada consulta exitosa registra quién consultó, cuándo, el hilo, el anuncio, el mensaje y las categorías. El panel oculta los datos al salir del hilo, cambiar de pestaña o pasar 45 segundos. La migración `2026-11-10-seller-claim-access.sql` deja la función apagada por defecto y solo se usa en la base local.

El 11 de noviembre de 2026 se probaron la consulta interna con datos ficticios y, por separado, dos entregas en el buzón local, una al comprador simulado y otra a la autoridad simulada. Cada mensaje llegó solo a su destinatario y se retiró después de la prueba. La verificación de identidad, evidencia y competencia sigue a cargo del operador para cada solicitud. El uso en producción está pendiente de revisión y autorización.
