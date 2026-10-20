import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { metadataFor, SITE_URL, LEGAL_PATHS, PRIVATE_PATHS, organization } from '../src/seo/metadata.js';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderHead(page) {
  const title = escapeHtml(page.title), description = escapeHtml(page.description), url = escapeHtml(`${SITE_URL}${page.path}`);
  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="${page.index ? 'index, follow, max-image-preview:large' : 'noindex, follow'}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="MiBatute" />
    <meta property="og:locale" content="es_CO" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE_URL}/logo.png" />
    <meta property="og:image:alt" content="MiBatute" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE_URL}/logo.png" />
    ${page.path === '/' ? `<script id="site-structured-data" type="application/ld+json">${JSON.stringify(organization).replace(/</g, '\\u003c')}</script>` : ''}`;
}
export async function buildSeo(directory = new URL('../dist/', import.meta.url)) {
  const template = await readFile(new URL('index.html', directory), 'utf8');
  const render = path => template.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, `<!-- seo:start -->${renderHead(metadataFor(path))}<!-- seo:end -->`);
  await writeFile(new URL('index.html', directory), render('/'));
  await mkdir(new URL('seo/', directory), { recursive: true });
  for (const path of [...LEGAL_PATHS, ...PRIVATE_PATHS]) await writeFile(new URL(`seo/${path.slice(1).replaceAll('/', '-')}.html`, directory), render(path));
  const paths = ['/', ...LEGAL_PATHS.filter(path => metadataFor(path).index)];
  await writeFile(new URL('sitemap.xml', directory), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${SITE_URL}${path}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(new URL('robots.txt', directory), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}
if (process.argv[1] === new URL(import.meta.url).pathname) await buildSeo();
