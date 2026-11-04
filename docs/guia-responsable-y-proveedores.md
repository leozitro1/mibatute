# Identificación y acuerdos de MiBatute — 4 de noviembre de 2026

El usuario indicó que, mientras registra la empresa, el responsable será una persona natural: Edgar Ortiz D, RUT informado 795715624, dirección Transversal 96B 20D 70 y teléfono 6015727978. Se incorporaron esos datos tal como fueron suministrados; faltan confirmar nombre completo, NIT con dígito de verificación y ciudad de la dirección. No se recuperaron datos personales retirados de versiones anteriores ni se identificó MITRIAPP como razón social.

## Cómo completar la identificación

1. Define quién opera el servicio, decide las finalidades de los datos y responde por sus servicios. Si eres tú personalmente, se informa tu nombre completo y NIT del RUT. Si es una sociedad, se informa la razón social y NIT de esa sociedad. Una marca no sustituye al titular.
2. Consulta el RUT y, si corresponde, el certificado de existencia y representación. Transcribe nombre y NIT con dígito de verificación. No publiques el RUT completo: no es necesario para este bloque.
3. Designa una dirección física válida donde el titular pueda recibir notificaciones judiciales. No uses una dirección ficticia. Si necesitas un domicilio de notificaciones diferente al residencial, determina primero cuál puedes utilizar válidamente.
4. Confirma teléfono y recepción del buzón info@mibatute.com. La propuesta usa ese mismo buzón para atención general y protección de datos, identificado con ambas funciones. No se creó otro correo ni se alteró SMTP.
5. Completa LEGAL_OPERATOR en src/legal/config.js con datos confirmados. El bloque común los muestra en las páginas legales y el footer, sin exigir pedirlos por correo. Los valores vacíos se muestran expresamente como sin definir; no constituyen identificación válida.

## Qué es un DPA y cómo comprobarlo

Un DPA es el acuerdo de tratamiento entre el operador y un proveedor que procesa datos por su cuenta. Puede integrarse en los términos del servicio o requerir un formulario o firma. Encontrar una plantilla pública no demuestra qué versión vincula a una cuenta concreta. No todos los proveedores ni todas sus finalidades corresponden al mismo rol jurídico.

| Proveedor | Documento público localizado | Qué comprobar en tu cuenta o contrato |
|---|---|---|
| Supabase | [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) | Titular de la cuenta, términos aplicables, fecha/versiones, anexos y subencargados. Región principal conocida: Estados Unidos, us-east-1; no equivale a residencia de todos los tratamientos. |
| Vercel | [DPA](https://vercel.com/legal/dpa) | Cobertura del plan/cuenta, condiciones de incorporación, funciones/regiones, CDN, soporte y subencargados. |
| ImageKit | [Información GDPR y solicitud del DPA](https://imagekit.io/gdpr/) | Obtener el DPA aplicable, identificar cuenta y entidad contractual, región de biblioteca, CDN, subencargados y reglas de eliminación/purga. |
| Resend | [DPA](https://resend.com/legal/dpa), [subencargados](https://resend.com/legal/subprocessors) | Documento aplicable a la cuenta y fecha; ubicación del tratamiento de correos/logs y cobertura de subencargados. La lista pública consultada indica proveedores en Estados Unidos; no demuestra cuáles reciben datos de cada flujo de MiBatute. |
| Wompi | [Política de datos colombiana](https://wompi.com/es/co/politica-de-privacidad) | Contrato del comercio, entidad contratante, roles por finalidad, destinatarios/países y acuerdo aplicable cuando actúe por cuenta de MiBatute. Una política de privacidad no sustituye un contrato de transmisión. |

Conserva por proveedor: entidad y cuenta contratante, documento y versión aplicable, fecha y evidencia de incorporación/aceptación, finalidad y datos, rol, países, subencargados, medidas de seguridad, plazos/ciclos de eliminación y canal para derechos/incidentes. No hace falta compartir contraseñas, llaves API ni documentos completos de identidad para revisar estos puntos.

## Transferencia y transmisión

La transferencia entrega datos a otro responsable que decide finalidades. La transmisión permite que un encargado trate datos por cuenta del responsable. La autorización a Estados Unidos no habilita automáticamente todos los países de una red global. Tampoco un DPA europeo sustituye el análisis colombiano. El texto final debe identificar los destinos y el mecanismo aplicable antes de solicitar consentimiento.

Fuentes: [Ley 1581, artículos 9, 12, 14, 15 y 26](https://cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm), [Decreto 1074, reglas sobre contratos de transmisión](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf), [Ley 1480, artículos 47, 50, 51, 53 y 58, con modificaciones](https://cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm).
