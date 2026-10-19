# Preparación legal de MiBatute — borrador local del 19 de octubre de 2026

Esta es una implementación técnica y un borrador de textos, no una certificación de cumplimiento ni una opinión jurídica definitiva. No se ha desplegado. La versión pública anterior sigue activa. El responsable debe aprobar las decisiones operativas y obtener la revisión jurídica que corresponda antes de habilitar las nuevas políticas.

## Confirmado por el responsable

- Persona natural, nombre, identificación tributaria, dirección en Bogotá y teléfono de atención: aportados por el responsable e incorporados a `src/legal/config.js`, sin comprobarlos contra documentos oficiales.
- Acceso exclusivamente para mayores de 18 años, confirmado por el responsable.
- Atención: Leonardo como responsable principal; Edgar Diaz (`contacto@mibatute.com`) como apoyo designado. El responsable confirmó que el correo de apoyo funciona el 19 de octubre de 2026; no se verificó independientemente. Revisión del panel y correo cada día hábil. Procedimiento en `procedimiento-atencion.md`; falta verificar el acceso del apoyo con MFA y probar la operación real.
- **Canal temporal vigente:** `edgarleonardo202@gmail.com`, designado el 19 de octubre de 2026 para sustituir por ahora a `hola@mibatute.com`, cuya contratación/configuración queda aplazada. Se actualizaron textos y enlaces locales y se preparó una migración para futuros avisos administrativos. Falta confirmar recepción y respuesta; `LEGAL_OPERATOR.emailVerified=false`. Ni el correo de apoyo ni el SMTP de Resend verifican este buzón. No se compró ningún servicio ni se conectó Gmail.
- Los créditos comprados **no vencen**. Las devoluciones se revisan por solicitud, sin devolución automática a los 180 días y respetando los derechos legales aplicables.

## Bloqueos de publicación

1. Identificación y contacto completados con la información proporcionada. Verificar exactitud, disponibilidad real del teléfono y denominación correcta de la identificación tributaria antes de publicar.
2. Regla de mayores de 18 años confirmada. Falta documentar cómo atender incidentes relativos a menores; no se ha implantado verificación documental de edad.
3. El responsable aprobó como propuesta 90 días para chats tras terminar la operación, 180 días para soporte tras el cierre y 24 meses para solicitudes tras respuesta final. Falta validar finalidad, fundamento, eventos de inicio, implementación, supresión/anonimización, excepciones y respaldos; las demás categorías no están aprobadas. No se ha programado un borrado masivo ni se ha inventado un plazo de retención.
4. Revisar proveedores efectivos: Supabase, Vercel, ImageKit (uso confirmado) y Resend (SMTP configurado según captura); regiones, contratos de encargado, subencargados, transferencias/transmisiones internacionales y eliminación de respaldos. Wompi se revisa para pagos.

Actualización de identificación: las capturas aportadas el 19 de octubre de 2026 muestran Supabase en East US (North Virginia), `us-east-1`, ocho respaldos PHYSICAL visibles del 12 al 19 de octubre y SMTP personalizado activado con `smtp.resend.com:587`, remitente `noreply@mail.mibatute.com`. Las fotos están en ImageKit según confirmación del responsable. Esto actualiza los pendientes de identificación del inventario inicial; no prueba entrega, restauración o aprobación contractual. El correo principal `hola@mibatute.com` y Wompi siguen pendientes. Evidencia y límites en `inventario-datos-proveedores.md`.
5. Definir el rol de MiBatute según su operación real y las obligaciones del comercio electrónico/portal de contacto. Verificar si debe recabar información adicional de oferentes, sin publicarla indiscriminadamente. No basta una exoneración genérica.
6. Habilitar un procedimiento real de reembolsos y reversión: responsables, comunicación con Wompi, conciliación del saldo consumido/no consumido, impuestos/facturación y trazabilidad. No se automatizaron movimientos de dinero.
7. Responsable principal y revisión diaria ya definidos; Edgar Diaz (`contacto@mibatute.com`) ya fue designado como apoyo; falta verificar su acceso con MFA y probar el procedimiento. El sistema registra recepción y respuestas, pero **no calcula automáticamente días hábiles, feriados o vencimientos**, no envía correo automático y no ejecuta aún supresiones/exportaciones. El seguimiento local ahora permite asignación, verificación, notas internas y radicación manual de correos. Las respuestas deben documentar las acciones realmente realizadas; guardar «Respondida» no demuestra por sí mismo cumplimiento.
8. Revisión jurídica final de textos, excepciones de retracto, reversión, garantías, deberes de identificación y respuesta, registro RNBD si resulta aplicable, incidentes y obligaciones del responsable.

`LEGAL_READY` exige identificación completa, aprobación y todos los indicadores de `LEGAL_REVIEW`. Mientras falte algo, el registro local y la creación de nuevas recargas permanecen cerrados. Las páginas muestran Borrador. No habilitar estas banderas para evitar el aviso sin resolver sus requisitos.

## Implementado

- Páginas accesibles: `/terminos`, `/privacidad`, `/pagos`, `/cookies`, `/datos-personales`, `/normas`. Enlaces en el pie, versión y fecha reales y estáticas. Rutas legales fuera del catálogo para no consultar publicaciones al leer documentos.
- Textos que distinguen artículos entre usuarios de recargas propias. Sin exoneración absoluta de responsabilidad ni prohibición general de reembolsos. Acceso administrativo al soporte y ciertas tareas de moderación explicado sin prometer confidencialidad absoluta frente al equipo.
- Tres elecciones de registro inicialmente desmarcadas: términos, autorización necesaria de datos y declaración de mayoría de edad. No se incluye marketing por defecto.
- Evidencia en `legal_consents` con usuario, versión y fecha del servidor; captura transaccional al crear `auth.users`, no solo metadata editable. Ediciones posteriores a metadata no alteran la evidencia. Versiones publicadas inmutables y contenido completo en `legal_releases`.
- Renovación explícita para cuentas anteriores, con diálogo y RPC idempotente cuando se habilite una versión definitiva. No se inventó consentimiento histórico. La barrera de registro y de nuevas órdenes de pago está en la base; el diálogo de renovación no sustituye una auditoría de autorización en todas las RPC antiguas del mercado.
- Bloqueo de nuevas órdenes de recarga también mediante trigger, para evitar eludir la API de Vercel. Orden guarda versión y fecha de la aceptación. La confirmación de pagos/órdenes existentes no se altera.
- Métricas opcionales apagadas por defecto y control en `/cookies` para permitir/rechazar. DNT y GPC prevalecen. No se envía la cola anterior al permiso; al retirar se descarta la cola, incluso en otra pestaña o tras un fallo en vuelo. Una petición ya transmitida no se puede retirar retroactivamente. No se incluyó banner intrusivo porque las métricas no arrancan sin elección; auditar tecnologías externas antes de considerar resuelto el punto de cookies.
- Solicitudes autenticadas de consulta, corrección, supresión, revocación y reclamo, con máximo 500 caracteres, radicado, estado y respuesta. Sin el límite de soporte de 24 horas. El canal previsto para quien no tiene cuenta es el correo de atención, aún pendiente de configurar y probar; no se debe exigir registro para ejercer derechos. Pedidos largos o documentación complementaria se atienden por canal seguro y correo, no se exige un documento completo automáticamente.
- Admin y superadmin tienen sección **Solicitudes de datos** con paginación, MFA, autorización y auditoría de estados sin copiar el cuerpo privado al log. Las respuestas finales no se sobrescriben; el titular solo ve sus solicitudes. Sin polling ni nuevos canales Realtime.
- El botón del perfil ahora registra una solicitud de cierre/supresión. No llama a `self_delete_and_block` ni afirma que borrar/bloquear la cuenta equivalga a suprimir los datos. No hay cierre inmediato ni destrucción automática de información.

## Cobertura de la lista de 20 puntos

| Punto | Estado y pendiente |
|---|---|
| Privacidad | Borrador e inventario inicial; faltan conservación, proveedores y revisión |
| Términos | Reescritos y versionados; pendientes de aprobación |
| Reembolsos | Política sin renuncia de derechos; falta operación real y revisión |
| Cookies | Página y preferencia funcional; falta inventario externo completo |
| Banner | No se activa seguimiento opcional antes de elegir; evaluar según inventario |
| Consentimientos | Evidencia y controles implementados; falta activación de versión definitiva |
| Datos innecesarios | Sin IP/documentos nuevos; pendiente justificar teléfono/dirección y auditar datos históricos |
| SDK terceros | Dependencias revisadas de forma inicial; falta auditoría de red/contratos/regiones |
| Patrones oscuros | Sin casillas premarcadas ni consentimiento comercial obligatorio; revisar todos los flujos |
| Tarifas ocultas | Paquetes y total visibles; falta confirmar tratamiento tributario y comprobantes |
| Reseñas falsas | Normas y sistema existente; retirar datos ficticios antes del lanzamiento |
| Afirmaciones engañosas | Términos corregidos; falta revisión completa de todas las etiquetas y mensajes |
| Texto alternativo | Páginas nuevas son texto; auditar imágenes y formularios del resto del sitio |
| Contraste | Estilo legible y foco visible en páginas nuevas; auditoría WCAG completa pendiente |
| Teclado | Navegación semántica y formularios nuevos; auditoría general pendiente |
| Datos del responsable | Completados según información aportada; verificación pendiente |
| Menores | Regla 18+ confirmada; procedimiento de incidentes pendiente |
| Baja de correos | No se agregó marketing; si se incorpora, requiere permiso y baja efectiva |
| Imágenes | Normas de autorización; comprobar licencias de assets, anuncios y patrocinadores |
| Supresión | Radicado/atención implementados; ejecución y matriz de conservación pendientes |

## Migración, prueba y activación

1. Conservar el orden de migraciones existentes. La de límite de 500 caracteres del buzón sigue pendiente de producción. Esta entrega agrega `2026-10-19-legal-foundation.sql`; junto con `2026-10-19-data-rights-workflow.sql`, se aplican solo en local.
2. `legal-foundation` deja la versión `2026-10-19.1` deshabilitada. No aplica consentimientos a usuarios antiguos ni recorta mensajes históricos. El trigger de altas requiere una versión habilitada: aplicar esta migración en producción sin activar la versión definitiva cerraría temporalmente nuevas altas y órdenes de recarga.
3. Cerrar los bloqueos anteriores. Guardar la aprobación y fijar una versión nueva si cambia un texto ya publicado. Completar configuración y marcar las revisiones solo al realizarlas.
4. `node scripts/prepare-legal-release.mjs /tmp/mibatute-legal-release.sql` genera SQL para revisión, **sin ejecutarlo**. Se niega a generarlo si el paquete sigue incompleto. El JSON versionado contiene textos e identificación y su huella SHA-256. Revisar el archivo, no subir datos de identificación a servicios diferentes de los autorizados.
5. Revisar y aplicar la publicación y migraciones de forma coordinada con el frontend. La aprobación de este borrador local no es autorización automática para desplegar ni para mover dinero.
6. Ejecutar pruebas y verificar con cuentas ficticias: límites, aislamiento, MFA, radicados, reintentos, aceptación, renovación, bloqueo de compra sin aceptación, rechazo/retirada de métricas y móvil. La prueba SQL automatizada usa definiciones reales de autorización del personal. No se ha ingresado manualmente con MFA del personal.
7. Probar los procedimientos operativos con un ejercicio de solicitud de datos y un ejercicio de reembolso antes de anunciar cumplimiento.

## Fuentes oficiales consultadas

- Ley 1581 de 2012, en especial artículos 8, 9, 12, 14 y 15: https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm
- Decreto 1074 de 2015, protección de datos personales: https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm
- Ley 1480 de 2011, texto compilado con modificaciones de la Ley 2439 de 2024, artículos 47, 50, 51 y 53: https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1480_2011.htm
- SIC, portales de contacto: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/redes-sociales-como-portales-de-contacto
- SIC, supresión y límites por obligaciones legales/contractuales: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/derecho-la-tranquilidad-y-supresion-de-datos-personales

Estas fuentes orientan el borrador. Debe comprobarse su aplicación al modelo real, las modificaciones y reglamentaciones vigentes y la situación del responsable con asesoría jurídica colombiana.


## Seguimiento operativo acordado

El responsable aceptó liderar la atención, con un admin de apoyo y revisión cada día hábil. El nuevo seguimiento exige encargado actual y documentación de verificación/acciones antes de una respuesta final; un correo requiere confirmar su comunicación manual. El relevo tiene control de versión y auditoría. Las notas y contactos externos son privados del equipo. No se configuraron automatizaciones ni se enviaron correos.

Ver `procedimiento-atencion.md` y `propuesta-conservacion.md`. La segunda contiene tres plazos aceptados como propuesta operativa; sigue pendiente de validación jurídica y técnica, sin borrados programados. Los indicadores de revisión legal no se marcan como completados por haber escrito estos documentos.


## Último avance local: cierre y simulación

`2026-10-19-support-closure-preview.sql` añade cierre/reapertura del soporte y una consulta manual de conservación para el personal. Una nueva respuesta reabre el caso. La simulación muestra conteos y referencias sin borrar ni habilitar depuración automática. No resuelve por sí sola las excepciones, los respaldos ni los demás bloqueos de publicación.


## Cuenta para la prueba inicial

El responsable indicó usar `leonortiz@hotmail.com` mientras Edgar no está disponible. Aclaró que corresponde a `leozitro` en local; se verificó `leozitro@master.mibatute.com` con rol `master` activo. La consulta anterior buscaba únicamente el correo Hotmail y no identificaba esta cuenta local. No se verificó su estado en producción, no se modificaron roles ni se sustituyeron los correos públicos. La prueba manual requiere su sesión administrativa habitual con MFA; el relevo de Edgar permanece pendiente.


## Validación manual del guardado web

Completada en local con leozitro y MFA real: seguimiento guardado, requisito de verificación visible, respuesta final confirmada, persistencia al filtrar Respondida y lectura desde el usuario ficticio sin notas internas. Caso `756fb8ca-a8e4-4401-bd59-ccac625e52c5`; no acredita aún la operación por correo, el relevo ni exportaciones, supresiones o reembolsos. No cambia las banderas de preparación legal ni autoriza publicar.


## Pendientes aplazados por el responsable

El 19 de octubre de 2026 se decidió dejar pendientes la configuración y prueba del correo principal `hola@mibatute.com` y la implementación/puesta en marcha operativa de Wompi, incluyendo el ejercicio de devoluciones. El código de pagos existente no demuestra que el proveedor esté configurado ni operativo. No se habilitan pagos, no se marca `refundWorkflow` como completado ni se despliega por esta decisión. El paquete legal sigue en borrador. Se puede continuar con inventario de proveedores, datos, conservación y revisión técnica independiente de estos dos puntos.


## Inventario técnico de proveedores y datos

Revisión inicial documentada en `inventario-datos-proveedores.md`: metadatos de 43 tablas y tres vistas públicas locales, buckets, datos de Auth, rutas de imágenes/pagos, almacenamiento del navegador, copias en reportes/historiales y pendientes por proveedor. No se leyeron contenidos privados para el inventario ni se comprobó igualdad con producción. Se corrigió en local la omisión del consentimiento en estadísticas de patrocinadores; también se descartan sus colas al retirar la preferencia. Los anuncios siguen funcionando sin estadísticas. Regiones, contratos, proveedor SMTP, respaldos y políticas completas de conservación siguen pendientes. `LEGAL_REVIEW.processors` permanece en `false`.
