import ContactButton from './ContactButton.jsx';
import { contactTextParts } from './contactText.js';

export default function ContactText({ text }) {
  return <>{contactTextParts(text).map((part, index) => part.contact
    ? <ContactButton key={index} className="underline font-semibold" subject="Consulta a MiBatute">{part.text.includes('@') ? 'Contactar a MiBatute' : part.text}</ContactButton>
    : part.text)}</>;
}
