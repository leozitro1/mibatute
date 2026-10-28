# Filtro de publicaciones (propuesta local del 28 de octubre de 2026)

Ubicación del panel: Superadmin → Administración de la página → Filtro de publicaciones. Solo un master con MFA y sesión de staff vigente puede agregar, editar o activar/desactivar reglas. Los cambios quedan en staff_audit. Hasta 200 palabras/frases (3–80 caracteres y hasta 8 palabras); no se ejecutan expresiones regulares escritas por el administrador.

Los formularios de crear/editar muestran el aviso y validan título y descripción. El servidor repite la comprobación en el trigger guard_publication_text, también para escrituras directas/RPC. Modificar estado, fotos o créditos sin cambiar los textos no vuelve a rechazar contenido anterior. No se sancionan cuentas ni se retiran publicaciones automáticamente. La lista adicional comienza vacía; no se importó una lista ofensiva genérica que pueda bloquear marcas como HP.

Detección propia ligera, sin dependencias nuevas ni APIs de IA: normalización Unicode, tildes, caracteres invisibles, algunos homógrafos, formatos habituales de teléfono colombiano e internacionales con prefijo, números en letras, correos con arroba/punto/at/dot, enlaces y usuarios o instrucciones claras de contacto en redes. Las palabras configurables se comparan como palabras/frases completas, con algunas variantes de letras/números y separadores. Los tests cotejan navegador y PostgreSQL e incluyen falsos positivos de marcas, precios, modelos, medidas y menciones técnicas a WhatsApp.

No es infalible: no realiza OCR ni interpreta imágenes, voz, QR o todas las formas de disimulo. Tampoco interpreta todas las intenciones de una frase. Las fotos y casos dudosos siguen requiriendo reportes/revisión humana. Quien considere erróneo un bloqueo puede pedir revisión en el buzón; no se automatizan sanciones basadas en coincidencias.

Rendimiento: una lectura del listado activo por apertura del formulario, compartida en memoria y con caché de cinco minutos; las aperturas concurrentes reutilizan la misma solicitud. Validación local por tecla sin consultas. El guard del servidor usa la escritura que ya publica/edita; no añade llamadas a Vercel ni canales realtime. Actualizar reglas no reanaliza publicaciones históricas.

Referencias investigadas: https://github.com/jo3-l/obscenity y https://github.com/gc/confusables. Se emplearon como referencia de enfoque; no se copió ni instaló su código. La detección de contactos específica del mercado se implementó y probó en el proyecto.

Migración: supabase/migrations/2026-10-28-publication-text-rules.sql, instalada únicamente en Supabase local. Producción no se modificó. Normas y Cómo funciona incluyen la regla con revisión y vías de reclamación, conservando el estado de borrador jurídico. Sin commit/deploy, pendiente revisión local del usuario.

Actualización del 28 de octubre: entrega autorizada; la migración y los permisos ya están instalados en producción. Los límites y exclusiones descritos se mantienen.
