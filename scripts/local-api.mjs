import emailDispatch from '../api/email-dispatch.js';
import imagekitAuth from '../api/imagekit-auth.js';
import imagekitDelete from '../api/imagekit-delete.js';
import wompiCheckout from '../api/wompi-checkout.js';
import wompiEvents from '../api/wompi-events.js';

const handlers = new Map([
  ['/api/email-dispatch', emailDispatch],
  ['/api/imagekit-auth', imagekitAuth],
  ['/api/imagekit-delete', imagekitDelete],
  ['/api/wompi-checkout', wompiCheckout],
  ['/api/wompi-events', wompiEvents],
]);

export function localApiPlugin(env) {
  return {
    name: 'mibatute-local-api',
    apply: 'serve',
    configureServer(server) {
      for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY',
        'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_URL_ENDPOINT',
        'EMAIL_NOTIFICATIONS_ENABLED', 'RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM', 'CRON_SECRET',
        'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_ENABLED', 'WOMPI_ENVIRONMENT', 'WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY',
        'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET']) {
        if (env[key] !== undefined) process.env[key] = env[key];
      }
      process.env.SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
      process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
      process.env.IMAGEKIT_URL_ENDPOINT = env.IMAGEKIT_URL_ENDPOINT || env.VITE_IMAGEKIT_URL_ENDPOINT || '';
      server.middlewares.use(async (req, res, next) => {
        const handler = handlers.get(req.url?.split('?')[0]);
        if (!handler) return next();
        res.status = code => { res.statusCode = code; return res; };
        res.json = body => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          if (req.method === 'POST') {
            let body = '';
            for await (const chunk of req) {
              body += chunk.toString();
              if (body.length > 16384) return res.status(413).json({ error: 'Solicitud demasiado grande.' });
            }
            try { req.body = body ? JSON.parse(body) : {}; }
            catch { return res.status(400).json({ error: 'JSON invalido.' }); }
          }
          await handler(req, res);
        } catch {
          if (!res.headersSent) res.status(500).json({ error: 'No se pudo completar la solicitud.' });
          else res.end();
        }
      });
    },
  };
}
