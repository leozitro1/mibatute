# Despliegue parcial para pruebas funcionales

Preparado el 19 de octubre de 2026 desde `862685d`. Objetivo autorizado: probar en la página real el registro, publicaciones, reservas, chat, notificaciones y buzón, manteniendo deshabilitadas las recargas.

## Alcance

- Conserva el registro y los términos actualmente publicados, incluyendo aceptación explícita. No instala `legal-foundation`, renovación de consentimientos ni el bloqueo de nuevas altas del borrador.
- Gmail temporal `edgarleonardo202@gmail.com` en pie, perfil, términos, patrocinadores sin enlace y nuevos avisos administrativos. Esta dirección todavía debe probarse como canal de atención; no se cambió el SMTP de Resend.
- Buzón: mensajes y respuestas nuevos de hasta 500 caracteres; conserva el texto histórico, el inicio de una conversación cada 24 horas y respuestas en el hilo existente. Pestaña Conversaciones del sistema.
- Recargas: interfaz Próximamente sin llamadas de checkout. La API de checkout responde deshabilitada tanto a GET como POST aunque existan variables de Wompi. Se conserva el código de confirmación de eventos existentes y su validación; no se añaden movimientos de dinero ni créditos automáticos de prueba.
- Estadísticas opcionales de búsquedas, visitas y patrocinadores requieren permiso y descartan colas al retirarlo. La elección se encuentra en Términos, Métricas opcionales. Los anuncios y funciones principales siguen disponibles sin estadísticas.
- No se presentan como aprobados los nuevos documentos legales. Las nuevas páginas, derechos de datos, seguimiento interno, cierre de soporte y simulación de conservación permanecen en el checkout de revisión local, fuera de esta entrega.

## Migraciones exclusivas de esta entrega

Proyecto de producción: `sgxzjggxlswvpedrosck`. Antes de cambios, se comprobó por metadatos que `support_threads` existe, `legal_releases` no existe y el trigger `capture_registration_consent` no está instalado.

Aplicar únicamente:
1. `2026-10-19-support-message-limit.sql`.
2. `2026-10-19-temporary-contact-email.sql`.

La primera deja la restricción de longitud NOT VALID para conservar mensajes antiguos; sí controla nuevos escritos. La segunda cambia el correo en las definiciones de los futuros avisos, sin modificar mensajes previos ni accesos.

No aplicar las migraciones legales locales en producción con esta entrega. No ejecutar migraciones por coincidencia de fecha ni copiar el conjunto del directorio de revisión.

## Validación

La batería general inicial pasó 213 pruebas; después se añadió la comprobación de 500 caracteres y las invariantes de registro abierto/checkout cerrado. Compilación y lint de los módulos modificados, más inspección del despliegue y comprobación de las funciones SQL antes de darlo por publicado.

La disponibilidad del formulario no prueba la entrega del correo de activación: la prueba real con una cuenta nueva la debe completar su titular, usando un correo controlado. No crear cuentas ficticias con direcciones ajenas. Identificar artículos y cuentas de prueba y no tomar esta fase como certificación legal ni lanzamiento público completo.

## Estado

Preparado; aplicar migraciones y desplegar solo después de pasar las comprobaciones finales. La URL y el commit se anotarán tras confirmar el resultado.
