import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6">
          <Link to="/" className="text-sm font-bold text-gray-500 hover:text-gray-800">
            ← Volver
          </Link>
        </div>

        <h1 className="text-3xl font-black text-gray-900">Términos y Condiciones</h1>
        <p className="text-sm text-gray-500 mt-2">Última actualización: {new Date().toLocaleDateString("es-CO")}</p>

        <div className="prose prose-gray max-w-none mt-8">
          <h2>1. Aceptación</h2>
          <p>
            Al usar Mi Batute, aceptas estos términos. Si no estás de acuerdo, no uses la plataforma.
          </p>

          <h2>2. Qué es Mi Batute</h2>
          <p>
            Mi Batute es una plataforma para publicar, donar, vender o intercambiar artículos entre usuarios.
          </p>

          <h2>3. Responsabilidad</h2>
          <ul>
            <li>Mi Batute no es parte de la transacción entre usuarios.</li>
            <li>Cada usuario es responsable por la veracidad de su publicación.</li>
            <li>Recomendamos reunirse en lugares seguros.</li>
          </ul>

          <h2>4. Contenido prohibido</h2>
          <p>
            No se permite publicar artículos ilegales, peligrosos, fraudulentos o que violen derechos de terceros.
          </p>

          <h2>5. Moderación y sanciones</h2>
          <p>
            Podemos ocultar publicaciones, suspender cuentas o limitar acceso si se detectan incumplimientos o abuso.
          </p>

          <h2>6. Privacidad</h2>
          <p>
            El manejo de datos se rige por nuestra Política de Privacidad.
          </p>

          <h2>7. Cambios</h2>
          <p>
            Podemos actualizar estos términos. El uso continuo implica aceptación de los cambios.
          </p>

          <h2>8. Contacto</h2>
          <p>
            Si tienes dudas, contáctanos por los canales oficiales publicados en la plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}