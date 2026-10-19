# Conservación — propuesta operativa aprobada parcialmente

Preparada el 19 de octubre de 2026. El responsable aprobó como propuesta operativa: chats hasta 90 días tras finalizar la operación, soporte 180 días tras el cierre y solicitudes de datos 24 meses tras la respuesta final. Las demás categorías no se dieron por aprobadas. Falta la revisión jurídica/contable y la implementación técnica que corresponda. **No está activa y no ordena ni programa borrados.** Los tres plazos aceptados son decisiones operativas sujetas a validación, no plazos legales generales ni garantías de disponibilidad de datos.

La conservación debe justificarse por finalidad y obligaciones aplicables, con revisión al terminar esa finalidad. Referencia: SIC, principio de finalidad y temporalidad: https://www.sic.gov.co/recursos_user/boletin-juridico-feb2017/articulo/datos/el-principio-de-la-finalidad-debe-tenerse-en-cuenta.html

| Categoría | Propuesta y estado | Finalidad y condición |
|---|---|---|
| Cuenta activa | Mientras se utilice la cuenta y sea necesario para el servicio | Solo datos justificados; no conservar campos innecesarios por tenerlos disponibles |
| Cuenta cuyo cierre se solicita | Revisar el caso y, si procede, completar supresión/anonimización operativa en un objetivo interno de hasta 30 días calendario desde la decisión | Este objetivo técnico no amplía el plazo legal de respuesta ni autoriza demorar una supresión exigible; confirmar viabilidad antes de ofrecerlo al público |
| Fotografías y publicaciones retiradas | Revisar su eliminación de almacenamiento y referencias dentro de 30 días desde el cierre procedente | Excluir pruebas concretas justificadas por disputa; contemplar CDN, URLs y copias |
| Chats de artículos | Propuesta aprobada: máximo de 90 días tras finalizar la operación, si aún hacen falta para atenderla | No es un mínimo: el sistema actual puede borrarlos antes al eliminar artículos; no se cambia esa lógica ni se promete recuperación de chats ya eliminados |
| Soporte común | Propuesta aprobada: 180 días desde el cierre del caso | Eliminar del buzón no inicia una supresión automática. En local existe cierre formal; cualquier respuesta reabre el caso y el próximo cierre inicia un nuevo plazo. Falta justificar excepciones |
| Solicitudes de datos y respuestas | Propuesta aprobada: 24 meses desde la respuesta final | Conservar evidencia mínima de atención, no documentos completos de identificación. Validar necesidad, obligaciones y posibles controversias antes de fijar el plazo |
| Pruebas de autorización | Mientras exista el tratamiento autorizado y el período adicional justificable para acreditar cumplimiento | No fijar retención indefinida ni borrar la prueba mientras se mantiene el tratamiento. Falta validar el período posterior y su base jurídica |
| Pagos, comprobantes y contabilidad | Determinar con asesoría contable/jurídica, según los documentos y obligaciones de la actividad real | Para libros y papeles del comerciante, el artículo 28 de la Ley 962 prevé 10 años; comprobar aplicabilidad y reglas tributarias antes de adoptar una cifra para MiBatute. No significa conservar chats o perfiles completos 10 años |
| Logs de seguridad y auditoría | Inventariar primero y proponer el mínimo que permita investigar incidentes y acreditar acciones | Separar metadatos de cuerpos de mensajes. La retención en cada proveedor puede ser distinta |
| Respaldos y cachés | Según ciclos reales documentados del proveedor, con acceso restringido y plan de depuración | No prometer borrado instantáneo de copias. Si se restaura un respaldo, reaplicar las supresiones y no reactivar cuentas eliminadas inadvertidamente |

Fuente de la referencia mercantil, artículo 28: https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_0962_2005.htm

## Reglas comunes a aprobar

1. Cada excepción necesita categoría, motivo, información mínima, responsable y fecha de revisión. Una disputa no habilita conservar toda la cuenta indefinidamente.
2. Un plazo máximo no obliga a mantener datos que ya no hagan falta ni permite desatender una solicitud legítima anterior.
3. Los créditos comprados no vencen: su saldo no debe desaparecer por una depuración automática. El cierre de la cuenta requiere resolver el saldo y documentar el tratamiento que corresponda.
4. Separar ocultamiento visual, cierre de cuenta, anonimización y supresión. Verificar cada resultado y comunicar su alcance real.
5. Aprobar primero el inventario y los plazos; después diseñar una depuración con simulación, revisión, límites por lote y evidencia. Esta propuesta no incluye tareas programadas ni permisos de borrado.
6. No publicar estas cifras como política definitiva hasta validar fundamento, capacidad técnica y excepciones. `LEGAL_REVIEW.retention` continúa en `false`.


## Revisión técnica del código actual

- **Chats:** `delete_article_deep` elimina mensajes y chats con la publicación. La protección de ventas entregadas solo impide ciertas eliminaciones durante siete días desde la entrega; no es una tarea automática de conservación de 90 días. También hay rutas de retirada de solicitudes que pueden eliminar chats. Por eso «hasta 90 días» no se puede convertir en una garantía de recuperación durante 90 días. No se ha modificado esta lógica ni recuperado información borrada.
- **Soporte:** en local admin y superadmin pueden cerrar/reabrir el caso. `closed_at` usa el reloj del servidor; cualquier mensaje nuevo limpia el cierre. Si aparece un mensaje mientras se revisa, el cierre con una secuencia anterior se rechaza. El siguiente cierre inicia de nuevo los 180 días. `user_hidden_at` no equivale a cierre ni a supresión.
- **Solicitudes de datos:** `responded_at` también cambia al guardar una respuesta En revisión. Para contar 24 meses solo debe usarse cuando el estado sea Respondida/final, nunca desde un aviso provisional. Las notas de verificación y el contacto externo forman parte del alcance a revisar.
- **Disputas, solicitudes vigentes y respaldos:** todavía falta registrar las excepciones y coordinar la eliminación en copias. No se creó una tarea de depuración ni se cambió información histórica.

La aceptación quedó registrada en `LEGAL_RETENTION_PROPOSAL`. `LEGAL_REVIEW.retention` permanece en `false` porque significa validación completa para publicación, no aceptación inicial de la propuesta. Los eventos de cierre y la simulación están preparados en local, sin borrado. La base jurídica, las excepciones y las otras categorías siguen pendientes.


## Simulación local de solo lectura

En Solicitudes de datos del panel del personal, desplegar «Simulación de conservación» y pulsar «Consultar simulación». No se consulta al abrir la sección ni periódicamente. `preview_retention` exige sesión de personal con MFA y devuelve conteos y hasta 20 referencias en la interfaz (máximo 50 desde la función), sin mensajes ni contactos privados. Los registros sin fecha válida se cuentan aparte y quedan excluidos de los candidatos.

La consulta no elimina datos, no programa tareas y no verifica disputas, excepciones, obligaciones legales ni copias de respaldo. Sus resultados requieren revisión manual. Está pendiente de publicar junto con `2026-10-19-support-closure-preview.sql`; no cambia `LEGAL_REVIEW.retention` ni habilita registros o recargas.


## Alcances adicionales encontrados en el inventario

Antes de diseñar una supresión hay que contemplar las copias de mensajes en `chat_reports.messages_snapshot`, referencias en historiales de publicaciones/calificaciones, datos duplicados en Auth y perfil, imágenes originales y caché, y marcas/caché locales del navegador. Ver `inventario-datos-proveedores.md`. Las depuraciones de métricas existentes se ejecutan en consultas administrativas con límites por lote; no son garantías de una caducidad automática diaria. Ninguno de estos hallazgos autoriza borrar datos ni da por aprobados sus plazos.
