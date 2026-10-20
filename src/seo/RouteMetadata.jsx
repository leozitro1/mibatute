import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metadataFor, SITE_URL, organization } from './metadata.js';

export default function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = metadataFor(pathname);
    document.documentElement.lang = 'es-CO';
    document.title = page.title;
    const setMeta = (attribute, key, content) => {
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.append(element); }
      element.content = content;
    };
    setMeta('name', 'description', page.description);
    setMeta('name', 'robots', page.index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
    for (const [key, value] of Object.entries({ title: page.title, description: page.description, url: `${SITE_URL}${page.path}` })) setMeta('property', `og:${key}`, value);
    setMeta('name', 'twitter:title', page.title);
    setMeta('name', 'twitter:description', page.description);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = `${SITE_URL}${page.path}`;
    document.getElementById('site-structured-data')?.remove();
    if (pathname === '/') {
      const structured = document.createElement('script');
      structured.id = 'site-structured-data'; structured.type = 'application/ld+json';
      structured.textContent = JSON.stringify(organization); document.head.append(structured);
    }
  }, [pathname]);
  return null;
}
