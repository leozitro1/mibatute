# SEO de MiBatute

Revisión: 20 de octubre de 2026.

- Idioma español de Colombia (`es-CO`). Título, descripción y datos WebSite propios, sin valoraciones inventadas ni afirmaciones de superioridad.
- Dominio canónico `https://www.mibatute.com/`; parámetros locales de diseño no crean otra URL canónica.
- `npm run build` genera metadatos iniciales por ruta, Open Graph, Twitter, robots.txt y sitemap.xml, sin llamadas a Supabase ni funciones de Vercel.
- Inicio rastreable. Los documentos legales siguen accesibles para revisión, pero llevan `noindex` y no entran en el sitemap mientras `LEGAL_READY` sea falso. Al aprobarlos, el siguiente build los incluye.
- Administración, callback y recuperación llevan `noindex` desde la respuesta inicial y también cabecera X-Robots-Tag. Esto no reemplaza autenticación/autorización.
- El encabezado principal describe el mercado; la publicidad usa encabezados secundarios y no determina el tema de la página.
- CTA «Publica gratis», también en móvil. La publicación gratuita y la ausencia de comisión por venta no significan que los servicios opcionales con créditos sean gratuitos.

## Pendientes reales

1. Verificar la propiedad del dominio en Google Search Console y enviar `https://www.mibatute.com/sitemap.xml`. Revisar inspección de URL e indexación; un sitemap no garantiza inclusión ni posiciones.
2. Los artículos aún se abren en un modal sin URL pública propia. Para posicionar cada publicación hace falta diseñar URLs permanentes y enlazadas, con contenido/metadatos del artículo disponible para rastreadores, manejo de retirados y sitemap actualizado. No se generan URLs ficticias con el catálogo parcial del navegador.
3. La portada sigue siendo una aplicación JavaScript. Google puede renderizarla; las etiquetas de compartir ya se entregan en HTML. Un prerender del catálogo público permitiría mostrar contenido inicial a más rastreadores, pero debe diseñarse con caché para evitar consultas y costes innecesarios.
4. Completar las revisiones legales y retirar/identificar los artículos de prueba antes del lanzamiento público.
