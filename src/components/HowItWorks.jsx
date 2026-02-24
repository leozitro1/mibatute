import { Upload, MousePointerClick, Handshake, Recycle } from 'lucide-react';

export default function HowItWorks({ onBack }) {
  const steps = [
    {
      icon: <Upload className="text-forest-green" size={32} />,
      title: "1. Publica tu artículo",
      desc: "Sube fotos de ese artículo que ya no usas. Puede ser para donar o vender. Aquí todo tiene una segunda vida."
    },
    {
      icon: <MousePointerClick className="text-forest-green" size={32} />,
      title: "2. Recibe solicitudes u ofertas",
      desc: "En donación se permite 1 solicitud cada 6 horas. En venta, 2 ofertas cada 6 horas. Así evitamos acaparamiento y damos igualdad de oportunidades."
    },
    {
      icon: <Handshake className="text-forest-green" size={32} />,
      title: "3. Decide con libertad",
      desc: "Tú eliges a quién entregar o vender tu artículo. Revisas perfiles y decides con tranquilidad."
    }
  ];

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button onClick={onBack} className="mb-8 text-forest-green font-bold flex items-center gap-2 hover:underline">
        ← Regresar a la búsqueda
      </button>

      <div className="text-center mb-16">
        <h1 className="text-4xl font-black text-gray-800 mb-4">
          Economía Circular en tu <span className="text-forest-green">Barrio</span>
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          En MiBatute conectamos personas que tienen artículos en desuso con quienes pueden darles una segunda vida.
          No cobramos por vender ni por donar. Construimos comunidad.
        </p>
      </div>

      {/* PASOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {steps.map((step, index) => (
          <div key={index} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm text-center space-y-4">
            <div className="bg-smoke-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {step.icon}
            </div>
            <h3 className="font-black text-gray-800">{step.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* MODALIDADES */}
      <div className="bg-forest-green rounded-[3rem] p-8 md:p-16 text-white overflow-hidden relative">
        <Recycle className="absolute -right-10 -bottom-10 text-white/10" size={300} />

        <div className="relative z-10">
          <h2 className="text-3xl font-black mb-10 text-center">Nuestras Modalidades</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20">
              <div className="bg-green-400 w-3 h-3 rounded-full mb-4 animate-pulse"></div>
              <h4 className="font-black text-xl mb-2">Donación</h4>
              <p className="text-sm text-green-50/80">
                Puedes hacer 1 solicitud cada 6 horas. Esto evita el acaparamiento y garantiza que todos tengan la misma oportunidad.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20">
              <div className="bg-blue-400 w-3 h-3 rounded-full mb-4"></div>
              <h4 className="font-black text-xl mb-2">Venta</h4>
              <p className="text-sm text-blue-50/80">
                Puedes realizar 2 ofertas cada 6 horas. Si deseas más oportunidades, puedes adquirir cupos adicionales.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CUPOS DE OFERTA */}
      <div className="mt-20 max-w-3xl mx-auto bg-white border border-gray-100 rounded-3xl p-8 shadow-sm text-center">
        <h3 className="text-2xl font-black text-gray-800 mb-6">
          ¿Quieres más oportunidades?
        </h3>

        <p className="text-gray-600 mb-6">
          No cobramos por vender ni por donar.  
          Para financiar la plataforma y mantenerla justa para todos,
          puedes comprar <span className="font-bold text-forest-green">Cupos de Oferta</span>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="border border-gray-200 rounded-2xl p-4">
            <p className="font-black text-lg">1 Oferta</p>
            <p className="text-forest-green font-black text-xl">$2.000 COP</p>
          </div>

          <div className="border border-gray-200 rounded-2xl p-4">
            <p className="font-black text-lg">3 Ofertas</p>
            <p className="text-forest-green font-black text-xl">$5.000 COP</p>
          </div>

          <div className="border border-gray-200 rounded-2xl p-4">
            <p className="font-black text-lg">7 Ofertas</p>
            <p className="text-forest-green font-black text-xl">$10.000 COP</p>
          </div>
        </div>

        <p className="text-gray-500 text-sm">
          2.000 pesos es menos que un café en la calle.  
          No pierdas una oportunidad por solo 2 mil pesos.
        </p>

        <p className="mt-4 text-xs text-gray-400 font-medium">
          Gracias por apoyar una economía circular justa, local y comunitaria.
        </p>
      </div>

      {/* FAQ */}
      <div className="mt-20 max-w-2xl mx-auto space-y-6">
        <h3 className="text-2xl font-black text-gray-800 text-center mb-8">
          Preguntas frecuentes
        </h3>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <h4 className="font-bold text-gray-800 mb-2 italic">
            ¿Por qué hay límite cada 6 horas?
          </h4>
          <p className="text-sm text-gray-500">
            Queremos evitar el acaparamiento. Al limitar las solicitudes y ofertas,
            aseguramos que todos tengan las mismas oportunidades.
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <h4 className="font-bold text-gray-800 mb-2 italic">
            ¿Se cobra comisión por vender o donar?
          </h4>
          <p className="text-sm text-gray-500">
            No cobramos comisiones. Solo ofrecemos cupos opcionales para quienes
            deseen más oportunidades y quieran apoyar el crecimiento de la plataforma.
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <h4 className="font-bold text-gray-800 mb-2 italic">
            ¿Ustedes hacen el transporte?
          </h4>
          <p className="text-sm text-gray-500">
            El transporte corre por cuenta del receptor o comprador.
            Fomentamos intercambios locales para reducir distancias.
          </p>
        </div>
      </div>
    </div>
  );
}
