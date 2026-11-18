# Identificación y acuerdos de MiBatute — 4 de noviembre de 2026

El responsable indicó que operará como persona natural mientras registra la empresa.

## Cómo completar la identificación

El responsable confirmó la ciudad de notificación y la recepción de correos el 10 de noviembre de 2026. El 11 de noviembre confirmó el nombre completo y el dígito de verificación a partir del RUT. El borrador local 2026-11-11.1 recoge esa información y está pendiente de publicación.

1. Define quién opera el servicio, decide las finalidades de los datos y responde por sus servicios. Si eres tú personalmente, se informa tu nombre completo y NIT del RUT. Si es una sociedad, se informa la razón social y NIT de esa sociedad. Una marca no sustituye al titular.
2. Consulta el RUT y, si corresponde, el certificado de existencia y representación. Transcribe nombre y NIT con dígito de verificación. No publiques el RUT completo: no es necesario para este bloque.
3. Designa una dirección física válida donde el titular pueda recibir notificaciones judiciales. No uses una dirección ficticia. Si necesitas un domicilio de notificaciones diferente al residencial, determina primero cuál puedes utilizar válidamente.
4. Confirma teléfono y recepción del buzón info@mibatute.com. La propuesta usa ese mismo buzón para atención general y protección de datos, identificado con ambas funciones. No se creó otro correo ni se alteró SMTP.
5. Actualiza la configuración del responsable con los datos confirmados. El bloque común se usa en las páginas legales y el pie enlaza a la identificación. Conserva una copia de cada versión con los datos que correspondían a esa fecha.

## Qué es un DPA y cómo comprobarlo

Un DPA es el acuerdo de tratamiento entre el operador y un proveedor que procesa datos por su cuenta. Puede integrarse en los términos del servicio o requerir un formulario o firma. Encontrar una plantilla pública no demuestra qué versión vincula a una cuenta concreta. No todos los proveedores ni todas sus finalidades corresponden al mismo rol jurídico.

| Proveedor | Documento público localizado | Qué comprobar en tu cuenta o contrato |
|---|---|---|
| Supabase | [DPA, versión 1 del 1 de agosto de 2026](https://supabase.com/legal/customer-resources/data-processing-addendum) | El responsable confirmó que abrió la cuenta por internet a su nombre como persona natural. Se identifica el DPA incorporado a los términos estándar a partir de esa confirmación. Queda por archivar la constancia de la cuenta y documentar los subencargados pertinentes. La región principal informada es us-east-1, Estados Unidos. |
| Vercel | [DPA vigente desde el 31 de marzo de 2026](https://vercel.com/legal/dpa) | El responsable confirmó que abrió la cuenta por internet a su nombre. El plan Pro del equipo de MiBatute se verificó por la API de Vercel. El DPA público incluye Pro para el tratamiento de datos de clientes por cuenta del responsable. Queda por documentar las ubicaciones de las funciones, la CDN, el soporte y los subencargados pertinentes. |
| ImageKit | [Información GDPR y solicitud del DPA](https://imagekit.io/gdpr/) | El responsable confirmó que abrió la cuenta por internet a su nombre. El perfil de la cuenta muestra Virginia del Norte, Estados Unidos, como región de procesamiento. El responsable confirmó que solicitó por correo la copia aplicable del DPA. La respuesta y el detalle sobre CDN, subencargados y eliminación quedan pendientes. [Perfil de la cuenta](https://imagekit.io/dashboard/profile) |
| Resend | [DPA actualizado el 31 de diciembre de 2025](https://resend.com/legal/dpa), [lista de subencargados del 5 de noviembre de 2026](https://resend.com/legal/subprocessors) | El responsable confirmó que abrió la cuenta por internet a su nombre. Resend identifica a Plus Five Five, Inc. como entidad contratante e incorpora su DPA a los términos estándar. Su lista pública ubica a AWS en Estados Unidos para alojamiento y envío. Queda documentar qué subencargados intervienen en los correos y registros de MiBatute. |
| Cloudflare Turnstile | [DPA 6.4](https://www.cloudflare.com/cloudflare-customer-dpa/), [aviso de Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/) | Contratación en línea informada por el responsable. Cloudflare distingue el tratamiento de señales por cuenta de MiBatute para proteger el sitio del uso de señales como responsable para mejorar su detección. Falta acreditar el alcance del acuerdo para el tratamiento de datos en Colombia y documentar los destinos y subencargados pertinentes. |
| Wompi | [Política de datos colombiana](https://wompi.com/es/co/politica-de-privacidad) | Contratación en línea informada por el responsable. Las recargas pagadas están deshabilitadas en producción. Antes de habilitarlas, documentar el contrato del comercio, la entidad contratante, el rol por finalidad, los destinatarios y el acuerdo aplicable. |

Conserva por proveedor: entidad y cuenta contratante, documento y versión aplicable, fecha y evidencia de incorporación/aceptación, finalidad y datos, rol, países, subencargados, medidas de seguridad, plazos/ciclos de eliminación y canal para derechos/incidentes. No hace falta compartir contraseñas, llaves API ni documentos completos de identidad para revisar estos puntos.

Los términos estándar de Supabase incorporan el DPA publicado y contemplan que pueda regir un acuerdo separado. El responsable confirmó el registro en línea y la titularidad de la cuenta. Falta archivar una constancia de la organización o de su contratación. Supabase identifica a su entidad de Singapur como encargada principal y describe acceso desde Estados Unidos cuando se requiere para soporte u operaciones. Para documentar los destinos del proyecto, distingue la región de la base principal del acceso operativo y revisa los subencargados de los servicios utilizados. [Términos de Supabase](https://supabase.com/terms) · [Preguntas sobre residencia y transferencias](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)

La lista pública más reciente consultada es del 12 de octubre de 2026. Registra los subencargados pertinentes al proyecto cuando se confirme la cobertura de la cuenta. Si la documentación de la organización no aclara qué acuerdo se aplica, pide a Supabase que confirme la entidad contratante, la versión del DPA y su fecha de vigencia para el proyecto de MiBatute. [Lista oficial de subencargados](https://supabase.com/legal/customer-resources/subprocessor-list)

## Transferencia y transmisión

La transferencia entrega datos a otro responsable que decide finalidades. La transmisión permite que un encargado trate datos por cuenta del responsable. La autorización a Estados Unidos no habilita automáticamente todos los países de una red global. Tampoco un DPA europeo sustituye el análisis colombiano. El texto final debe identificar los destinos y el mecanismo aplicable antes de solicitar consentimiento.

Fuentes: [Ley 1581, artículos 9, 12, 14, 15 y 26](https://cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm), [Decreto 1074, reglas sobre contratos de transmisión](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf), [Ley 1480, artículos 47, 50, 51, 53 y 58, con modificaciones](https://cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm).
