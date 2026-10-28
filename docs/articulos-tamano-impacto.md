# Propuesta local: tamaño e impacto de reutilización

Tamaño opcional pequeño/mediano/grande al crear y editar, con ayuda de recogida sin asignar kilos. Se guarda en el mismo envío, también al reordenar fotos, se muestra en revisión, detalle y vista del admin. Las publicaciones anteriores conservan tamaño sin especificar.

Contador público de publicaciones marcadas como entregadas, tanto ventas como donaciones. Cuenta una vez por artículo a partir de la instalación de la migración; sin relleno histórico, toneladas ni estimaciones de basura evitada. Un lote sigue contando como una publicación. No verifica físicamente las entregas: el sitio lo explica con la fecha de inicio del contador.

El acumulado anónimo se conserva aunque se borren artículos. Un marcador protegido en cada artículo impide duplicar al editar o reabrir; no se almacenan participantes, precios ni datos de contacto en la tabla del acumulado. Las funciones exponen únicamente el número y su fecha de inicio. Una devolución posterior no descuenta este historial de entregas marcadas.

El contador aparece al pie de Cómo funciona y recibe el dato con la consulta de catálogo existente: sin solicitudes adicionales, sondeos ni canales realtime. El incremento forma parte de la transacción de entrega y se revierte si falla. No se cuentan aperturas, reservas ni postulaciones.

Migración 2026-10-28-article-size-reuse-impact instalada únicamente en Supabase local; producción no modificada. Sin commit ni deploy, pendiente de revisión local del usuario. El contador local inicia en cero; no se crearon entregas ficticias en la base local.

Entrega autorizada del 28 de octubre: migraciones instaladas en producción en una sola transacción y con permisos comprobados. Sin entregas ficticias ni relleno histórico. El contador inicia en cero en producción. Pruebas generales: 321 aprobadas; compilación correcta.
