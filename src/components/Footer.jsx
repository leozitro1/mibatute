import { Link } from 'react-router-dom';

export default function Footer({ onHowItWorks }) {
  const today = new Date();
  const date = today.toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota',
  });
  const linkClass = 'inline-flex min-h-11 items-center text-sm text-gray-600 hover:text-forest-green hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest-green';

  return (
    <footer className="mt-8 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-col items-center gap-2">
          <Link to="/" className="inline-flex w-fit items-center gap-2" aria-label="MiBatute, ir al inicio">
            <img src="/logo.png" alt="" width="32" height="32" className="h-8 w-8 object-contain" />
            <span>
              <span className="block text-lg font-extrabold text-gray-900">Mi<span className="text-forest-green">Batute</span></span>
              <span className="block text-xs text-gray-500">mi basura, tu tesoro</span>
            </span>
          </Link>
          <nav aria-label="Enlaces del pie de página" className="w-full overflow-x-auto">
            <div className="flex w-max min-w-full flex-nowrap items-center justify-center gap-6 whitespace-nowrap px-1">
            <Link className={linkClass} to="/terminos">Términos y condiciones</Link>
            <span className="inline-flex min-h-11 items-center text-sm text-gray-500" aria-disabled="true" title="Página pendiente">Normas de la comunidad</span>
            {onHowItWorks && <button type="button" className={`${linkClass} text-left`} onClick={onHowItWorks}>Cómo funciona</button>}
            <a className={linkClass} href="mailto:hola@mibatute.com">Contacto</a>
            <span className="inline-flex min-h-11 items-center text-sm text-gray-500" aria-disabled="true" title="Página pendiente">Ayuda y PQR</span>
            <span className="inline-flex min-h-11 items-center text-sm text-gray-500" aria-disabled="true" title="Página pendiente">Consejos de seguridad</span>
            </div>
          </nav>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-gray-100 pt-3 text-center text-xs text-gray-500">
          <span>© {today.getFullYear()} MiBatute. Reutilizar es cuidar.</span>
          <time dateTime={today.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}>{date}</time>
        </div>
      </div>
    </footer>
  );
}
