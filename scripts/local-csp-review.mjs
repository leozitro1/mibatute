import { Buffer } from 'node:buffer';

const turnstile = 'https://challenges.cloudflare.com';
const reportPath = '/__csp-review';
const policy = `script-src 'self' ${turnstile}; frame-src 'self' ${turnstile}; report-uri ${reportPath}`;
const allowed = new Set(['script-src', 'script-src-elem', 'script-src-attr', 'frame-src']);

export function localCspReview() {
  return {
    name: 'mibatute-csp-review',
    apply: 'serve',
    configureServer(server) {
      const reported = new Set();
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== reportPath) {
          if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
            res.setHeader('Content-Security-Policy-Report-Only', policy);
          }
          return next();
        }
        if (req.method !== 'POST' || req.headers['content-type']?.split(';')[0] !== 'application/csp-report') {
          res.statusCode = 415;
          return res.end();
        }
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
          size += chunk.length;
          if (size <= 4096) chunks.push(chunk);
          else req.destroy();
        });
        req.on('end', () => {
          try {
            const directive = JSON.parse(Buffer.concat(chunks).toString())?.['csp-report']?.['effective-directive'];
            if (allowed.has(directive) && !reported.has(directive)) {
              reported.add(directive);
              server.config.logger.info(`[CSP local] ${directive}: revisa el aviso en la consola del navegador.`);
            }
          } catch { /* Ignore malformed reports without retaining input. */ }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}
