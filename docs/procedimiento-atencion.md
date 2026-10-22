> Actualización de entrega completa: este documento conserva el historial de decisiones. Los módulos están ahora integrados en main y se publican como borrador para revisión. Consultar docs/despliegue-pruebas-funcionales.md para el estado actual. Registro de pruebas abierto en producción; recargas y borrados automáticos deshabilitados. No implica aprobación legal definitiva.

# Atención diaria de solicitudes — MiBatute

Decisión operativa aceptada por el responsable el 19 de octubre de 2026. Implementación y pruebas locales; no desplegada. No acredita que las revisiones humanas ya estén ocurriendo ni reemplaza la revisión jurídica pendiente.

## Responsable y apoyo

- Responsable principal: titular de MiBatute; identificación mantenida fuera del código distribuido al navegador. El modo de informar la identidad y los datos de contacto a los titulares queda pendiente de validación jurídica.
- Cuenta indicada para la prueba inicial: `leonortiz@hotmail.com`, por instrucción del responsable el 19 de octubre de 2026, mientras Edgar no está disponible. No sustituye los correos públicos de atención ni la designación del apoyo. El responsable aclaró que corresponde a `leozitro` en local. Se comprobó la cuenta local `leozitro@master.mibatute.com`, con rol `master` activo; no se modificaron correo, credenciales ni permisos. El panel exige iniciar sesión: la prueba manual con su sesión y MFA sigue pendiente. No se verificó el estado de la cuenta de Hotmail en producción.
- Apoyo designado por el responsable: Edgar Diaz, `contacto@mibatute.com`. El responsable confirmó que el correo funciona el 19 de octubre de 2026; no se realizó una comprobación independiente desde esta herramienta. Falta comprobar que esa cuenta tenga acceso administrativo con MFA y probar el relevo. Esta designación no crea una cuenta ni concede credenciales o permisos. El correo general de solicitudes sigue siendo `hola@mibatute.com`; el contacto de apoyo no lo sustituye.
- **Canal temporal vigente:** `edgarleonardo202@gmail.com`, designado por el responsable el 19 de octubre de 2026. Sustituye temporalmente al correo de atención `hola@mibatute.com` indicado arriba y en decisiones anteriores. Falta confirmar recepción/respuesta; `emailVerified` sigue en `false`. El buzón de apoyo de Edgar no se cambia por esta decisión.
- **Pendiente por instrucción del responsable:** `hola@mibatute.com` aún no está configurado y no se contratará por ahora. Wompi y su prueba operativa de devoluciones también quedan pendientes. No se exige comprar un buzón personalizado para continuar esta preparación.
- Frecuencia acordada: una revisión **cada día hábil**, del panel y del canal temporal `edgarleonardo202@gmail.com` cuando se compruebe operativo. Es una rutina humana; no se ha creado una automatización, envío de correo o monitor.
- Al ausentarse el responsable, el admin de apoyo toma los pendientes. Ambos pueden ver los casos, pero cada caso tiene un único encargado actual. Tomar o reasignarse un caso queda auditado. Después del relevo, la persona anterior no puede guardar seguimiento ni responder hasta volver a tomarlo.

## Rutina diaria

1. Abrir Solicitudes de datos y actualizar una vez. La vista inicial Pendientes reúne Recibida y En revisión y muestra primero la recepción más antigua; revisar ambas. Consultar el correo y su carpeta de spam; identificar solicitudes de datos, reclamaciones de pagos y riesgos de seguridad.
2. Por cada petición recibida por correo, usar **Radicar una solicitud recibida por correo**: tipo, contacto, fecha/hora originales y resumen mínimo. No cambiar la fecha de recepción por la fecha de registro. Conservar el mensaje original en una carpeta de atención con acceso restringido y su radicado. No copiar claves, tarjetas completas, documentos ni todo el historial al panel.
3. Tomar el caso. La asignación es de trabajo, no una ampliación de acceso a datos. Registrar en notas quién actuará y la fecha de control calculada según el trámite aplicable. El sistema no calcula días hábiles, feriados, suspensiones o ampliaciones: ese control sigue siendo responsabilidad humana.
4. Clasificar: consulta de datos/autorización; corrección; supresión/cierre; revocación; reclamo. Un asunto de cobro no debe confundirse con una consulta de datos. Los pagos siguen el circuito de devoluciones indicado más abajo.
5. Revisar si se requiere acreditar identidad o representación antes de divulgar datos o modificarlos. Una cuenta autenticada aporta contexto, pero no prueba automáticamente toda facultad o representación. Priorizar los medios menos invasivos. Si se necesita información adicional, explicar qué falta y por qué; no pedir copia del documento por rutina. Marcar Verificada solo después de comprobarlo, sin guardar la imagen del documento en notas.
6. Si la respuesta es exclusivamente general y no revela ni modifica datos, se puede marcar **No requerida para esta respuesta**, dejando la justificación. Esta opción no permite saltarse la comprobación cuando sí resulte necesaria.
7. Guardar seguimiento interno: método de comprobación, acciones realizadas, información afectada, excepciones justificadas y fecha de control. Máximo 500 caracteres por nota: usar un resumen y conservar evidencia adicional en el canal seguro acordado. Las notas son privadas del equipo; no llegan a la respuesta pública ni se copian a los logs de auditoría.
8. Ejecutar únicamente las acciones autorizadas y técnicamente verificadas. Antes de una supresión, separar información eliminable de la que deba conservarse, validar relaciones y respaldos, y aplicar cualquier retención por controversia de forma limitada. No cambiar saldos ni borrar datos como efecto de pulsar Guardar respuesta.
9. Responder con claridad: qué se hizo, qué no se hizo y por qué, qué información permanece y durante cuánto tiempo cuando corresponda, y cómo continuar el trámite. Para la web, guardar la respuesta en el radicado. Para correo, enviarla manualmente al destinatario comprobado desde el canal de atención, guardar su constancia y marcar la confirmación de envío. El panel no envía correos ni verifica que el destinatario lo leyó.
10. Cerrar como Respondida solo tras guardar seguimiento, resolver la verificación y comunicar la respuesta. El sistema exige esos campos; no puede demostrar que una comprobación o un envío declarados por el operador sean verdaderos. La respuesta final y sus notas no se sobrescriben; cualquier aclaración posterior se registra en un nuevo radicado vinculado al anterior en las notas.

## Plazos y escalamiento

La política distingue el plazo general de consultas (10 días hábiles) del de reclamos de datos (15 días hábiles), con sus condiciones legales de ampliación. No ampliar plazos automáticamente. Si una solicitud está incompleta o se prevé una demora, revisar la regla aplicable y comunicar lo que corresponda antes del vencimiento. La revisión diaria no suspende ni reinicia ningún término.

Escalar el mismo día de detección los incidentes de seguridad, riesgo de pérdida de información, solicitudes de autoridades, datos de menores o dudas sobre una excepción de conservación. Aplicar medidas proporcionadas, sin bloquear el acceso al canal de derechos ni exigir al usuario resolver primero una disputa comercial.

Referencia: Ley 1581 de 2012, artículos 12, 14 y 15, y reglamentación aplicable. https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm

## Devoluciones y cobros: procedimiento manual propuesto

1. Recibir referencia, fecha, monto y descripción del problema por soporte o correo. No pedir claves, OTP ni número completo de tarjeta. Identificar si la petición implica un plazo legal urgente y orientar al usuario para que no espere al soporte si debe también avisar al emisor del instrumento.
2. Verificar la cuenta y contrastar orden, estado de Wompi, abono e historial de créditos. Un pago pendiente no se trata como aprobado; un movimiento administrativo de créditos no prueba que se haya devuelto dinero.
3. El responsable revisa la causa, el derecho aplicable y los efectos sobre el saldo. Los créditos comprados no vencen. No rechazar en bloque una devolución por la sola existencia de consumo ni prometer un reembolso antes de verificarlo.
4. Si procede un reembolso, ejecutarlo por el procedimiento autorizado del proveedor, con la revisión financiera que corresponda, y registrar referencia e importe. Este borrador no ejecuta devoluciones, no crea una integración de reembolsos y no autoriza movimientos de dinero.
5. Conciliar una sola vez el dinero y los créditos afectados. Documentar quién hizo cada acción; preservar comprobantes necesarios. Comprobar el resultado y comunicarlo sin prometer tiempos que no controle MiBatute.

Falta cerrar con Wompi y asesoría jurídica/contable el circuito, las autorizaciones, comprobantes, excepciones y tiempos. `refundWorkflow` permanece pendiente.

## Antes de considerar operativo el procedimiento

- Realizar primero la prueba con `leonortiz@hotmail.com`, usando su acceso administrativo normal y MFA. El acceso y relevo de Edgar Diaz (`contacto@mibatute.com`) quedan pendientes hasta que esté disponible.
- Probar un caso web y uno por correo de principio a fin, incluyendo la comunicación efectiva al titular. No basta la prueba de guardar un radicado.
- Preparar y aprobar instrucciones verificables de exportación, corrección, supresión y tratamiento de respaldos. Hoy no están automatizadas y no deben improvisarse sobre producción.
- Llevar un control real de vencimientos; evaluar una agenda o campos de fecha antes de depender del seguimiento humano. Este cambio no incluye recordatorios automáticos.
- Revisar permisos de la carpeta de correo y conservación de sus adjuntos.
- Mantener sin activar el paquete legal hasta cerrar los pendientes aplicables. La decisión sobre responsables y revisión diaria ya quedó aceptada; esto no aprueba por sí solo la matriz de conservación ni la opinión jurídica.


## Comprobación de acceso local

El responsable confirmó haber iniciado sesión como leozitro. La base local muestra una sesión de esa cuenta con segundo factor (`aal2`). La ventana controlable por la herramienta sigue mostrando el formulario de acceso; no se compartió ni copió la sesión. Esto verifica la autenticación local, pero no equivale a completar la prueba manual de Solicitudes de datos.


## Guardado y respuesta final en el panel

El estado En revisión puede conservar una respuesta provisional; guardarla no cierra el caso. La interfaz distingue «Guardar respuesta en revisión» de «Guardar respuesta final», conserva visible la respuesta guardada y confirma cada guardado junto al botón. Al elegir Respuesta final muestra los requisitos pendientes junto al formulario: verificación guardada resuelta, notas suficientes, cambios internos guardados y, para correo, constancia de envío manual. Los errores del servidor se muestran junto a la acción y el borrador se conserva para reintentar. Estas indicaciones no sustituyen la comprobación del servidor ni marcan automáticamente una identidad como verificada.


## Prueba manual local completada: solicitud web

El 19 de octubre de 2026, con la sesión de leozitro y MFA completados por el responsable, se comprobó el caso ficticio `756fb8ca-a8e4-4401-bd59-ccac625e52c5`. El panel mostró la respuesta provisional guardada y la verificación Pendiente. Al elegir Respuesta final, explicó el requisito pendiente y deshabilitó el botón. Se guardó «No requerida para esta respuesta» con la justificación de prueba general ya registrada; apareció «Seguimiento interno guardado». Luego se guardó la respuesta final, apareció su confirmación y el caso salió de Pendientes. Al filtrar Respondida se recuperaron el mismo radicado y respuesta, sin formulario de edición final.

En `/datos-personales`, la sesión del usuario de prueba mostró el mismo radicado como Respondida y el texto final. No mostró las notas internas, el encargado ni la verificación privada. No se eliminaron datos, no se enviaron correos ni se movió dinero. La prueba por correo, el relevo de Edgar y la revisión jurídica permanecen pendientes.
