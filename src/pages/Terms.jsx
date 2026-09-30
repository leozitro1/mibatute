import { Link } from "react-router-dom";

export default function Terms() {
  const lastUpdate = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Botón Volver */}
        <div className="mb-10">
          <Link
            to="/"
            className="inline-flex items-center text-base font-semibold text-emerald-700 hover:text-emerald-900 transition-colors duration-200"
          >
            ← Volver al inicio
          </Link>
        </div>

        {/* Título principal */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
          Términos y Condiciones
        </h1>
        <p className="text-lg text-gray-600 mb-12">
          Última actualización: {lastUpdate}
        </p>

        <div className="prose prose-lg prose-headings:font-bold prose-headings:text-emerald-800 prose-p:text-gray-700 prose-li:text-gray-700 max-w-none space-y-12">
          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">1. Aceptación de los Términos</h2>
            <p>
              Al acceder o utilizar <strong>www.mibatute.com</strong> (“Mi Batute”), aceptas quedar plenamente vinculado por estos Términos y Condiciones. Si no estás de acuerdo, no uses la plataforma.
            </p>
            <p>
              Debes tener al menos 18 años o la mayoría de edad legal en tu país.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">2. ¿Qué es Mi Batute?</h2>
            <p>
              Somos una plataforma gratuita de clasificados que conecta personas para <strong>donar, vender a muy bajo precio o intercambiar</strong> artículos que ya no usan pero que aún tienen valor y no quieren desechar como basura.
            </p>
            <p>
              <strong>Importante:</strong> Mi Batute <strong>NO</strong> es parte de ninguna transacción, no maneja pagos, envíos, logística ni garantiza nada sobre los artículos o usuarios. Todo acuerdo se realiza directamente entre las personas involucradas.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">3. Registro y Cuenta</h2>
            <p>
              Para publicar o contactar se requiere registro con nombre, correo, teléfono y ciudad/localidad aproximada. Mantén tu información actualizada y protege tu cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">4. Publicación de Anuncios</h2>
            <p>
              Al publicar garantizas que el artículo es tuyo (o tienes permiso), la descripción es veraz y las fotos son propias o autorizadas.
            </p>
            <p>
              <strong>Eliminación de anuncios:</strong> Una vez que el artículo ha sido concretado (entregado, donado o vendido), el publicador debe eliminar el anuncio manualmente. Podemos eliminarlo automáticamente o a solicitud si se confirma la concreción.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">5. Mensajes y Privacidad entre Usuarios</h2>
            <p>
              Los chats y mensajes enviados a través de la plataforma son <strong>privados y confidenciales</strong>. Solo los participantes de la conversación pueden verlos. Mi Batute no los publica ni comparte con terceros, salvo requerimiento legal o para moderación en casos de abuso grave.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">6. Contenido y Artículos Prohibidos</h2>
            <p>
              Está estrictamente prohibido publicar:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Armas, municiones, explosivos</li>
              <li>Drogas, sustancias ilegales o precursores</li>
              <li>Animales silvestres, exóticos o sin documentación sanitaria</li>
              <li>Órganos, medicamentos con receta, tabaco/vapeo para menores</li>
              <li>Contenido pornográfico o de explotación</li>
              <li>Productos falsificados o que violen derechos de autor</li>
              <li>Residuos peligrosos, tóxicos, baterías o electrónicos sin manejo especial</li>
              <li>Publicaciones fraudulentas, spam o estafas</li>
              <li>Mensajes de odio, amenazas o acoso</li>
            </ul>
            <p className="mt-4 font-medium text-red-700">
              Si detectamos o recibimos denuncia fundada de contenido prohibido, <strong>no solo eliminaremos el anuncio y/o suspenderemos la cuenta</strong>, sino que podremos reportar el hecho a las autoridades competentes (Policía, Fiscalía, Superintendencia de Industria y Comercio, etc.) según corresponda.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">7. Responsabilidad Limitada</h2>
            <p>
              Mi Batute no verifica anuncios ni usuarios. Recomendamos encarecidamente reunirse en lugares públicos, no adelantar dinero y verificar todo personalmente.
            </p>
            <p className="font-medium">
              En la máxima medida permitida por la ley, <strong>no somos responsables</strong> por fraudes, robos, daños, incumplimientos o cualquier problema entre usuarios.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">8. Moderación y Sanciones</h2>
            <p>
              Podemos eliminar contenido, suspender cuentas o limitar acceso sin previo aviso por incumplimientos, denuncias o sospecha razonable de abuso.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">9. Protección de Datos</h2>
            <p>
              Consulta nuestra{" "}
              <Link to="/privacidad" className="text-emerald-700 hover:underline font-medium">
                Política de Privacidad
              </Link>{" "}
              (Ley 1581 de 2012 y normas relacionadas).
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">10. Cambios en los Términos</h2>
            <p>
              Podemos actualizar estos términos. Tu uso continuado implica aceptación de los cambios.
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">11. Ley Aplicable</h2>
            <p>
              Leyes de Colombia. Controversias ante jueces de Bogotá D.C. (previa conciliación si aplica).
            </p>
          </section>

          <section>
            <h2 className="text-3xl border-b border-emerald-200 pb-3 mb-6">12. Contacto</h2>
            <p>
              Dudas o reportes: formulario en la plataforma o{" "}
              <a href="mailto:hola@mibatute.com" className="text-emerald-700 hover:underline font-medium">
                hola@mibatute.com
              </a>
            </p>
          </section>
        </div>

        {/* Footer sutil */}
        <div className="mt-20 pt-10 border-t border-gray-200 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Mi Batute – Reutilizar es cuidar
        </div>
      </div>
    </div>
  );
}