# Correos de actividad: configuración de producción

Diagnóstico del 28 de octubre de 2026: Superadmin tiene activados los avisos y el evento de publicación; existe un aviso pendiente, sin ningún intento. El endpoint público informa configured=false. Vercel no tiene las variables de envío. La configuración SMTP de Supabase autentica usuarios, pero no configura este trabajador de correos.

En el proyecto habitual de Vercel, para Production, configurar:

- EMAIL_NOTIFICATIONS_ENABLED=true: habilita el trabajador del servidor.
- RESEND_API_KEY: clave privada de envío para el dominio verificado, guardada como secreto.
- NOTIFICATION_EMAIL_FROM: remitente autorizado por Resend, por ejemplo MiBatute <noreply@mail.mibatute.com> si ese dominio está verificado.
- SUPABASE_SERVICE_ROLE_KEY: clave privada del proyecto Supabase de producción; nunca usar la clave local ni ponerla en variables VITE.
- CRON_SECRET: secreto privado para autenticar el programador de Vercel.

No enviar estas claves por chat ni guardarlas en Git. No copiar el buzón info como remitente sin verificarlo en Resend. Conservar el SMTP de autenticación existente.

Las variables necesitan un nuevo despliegue de producción, que requiere autorización del usuario. El cambio de código local añade Comprobar configuración de envío en Superadmin; solo comprueba nombres faltantes y disponibilidad, con autorización del superadmin y sin consumir la cola ni contactar Resend.

El cron existente procesa hasta tres avisos cada 15 minutos. En condiciones normales puede tardar hasta 15 minutos y más si hay cola o se alcanzó el tope. Los controles de Superadmin y el límite de 24 horas siguen vigentes. Los eventos pendientes vencen a las 24 horas; activar el servidor puede procesar pendientes recientes habilitados. No reactivar ni reenviar fallidos/inciertos sin revisar su estado.

Verificación de recepción pendiente: una vez configurado y publicado, acordar una nueva publicación controlada y comprobar la cola y recepción. Durante el diagnóstico no se envió ningún correo ni se modificaron ajustes o credenciales de producción.

Actualización del 28 de octubre: el usuario configuró las cinco variables privadas y redesplegó; se confirmó su presencia por nombre, sin exportar valores. El endpoint activo exige autorización. La entrega actual publica también el diagnóstico de configuración. La recepción efectiva de un correo no se ha confirmado; no se enviaron correos desde las herramientas.
