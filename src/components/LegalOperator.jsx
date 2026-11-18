import ContactButton from './ContactButton.jsx';

export default function LegalOperator() {
  return <section id="responsable" className="legal-operator" aria-labelledby="legal-operator-title">
    <h2 id="legal-operator-title" className="mb-3 text-[15px] font-semibold text-[#2d4935]">Responsable de MiBatute</h2>
    <p className="mb-3 text-sm">Puedes solicitar la información de identificación y contacto del responsable a través de nuestro canal de atención.</p>
    <ContactButton subject="Solicitud de información del responsable de MiBatute"
      className="min-h-11 rounded-lg bg-forest-green px-4 text-sm font-semibold text-white">
      Solicitar información del responsable
    </ContactButton>
  </section>;
}
