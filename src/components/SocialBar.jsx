import { Instagram, Facebook } from 'lucide-react';

function TikTokIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M14 3h3c.2 2.6 1.7 4.2 4 4.5v3a8.6 8.6 0 0 1-4-1.3v7.3a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3Z" />
  </svg>;
}

function XIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
    <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l7.9-9L2.5 2H9l4.4 6.7L18.9 2ZM17.9 20h1.7L8 3.9H6.2L17.9 20Z" />
  </svg>;
}

// Visual preview only; no external profiles or requests.
const networks = [
  { name: 'Instagram', Icon: Instagram },
  { name: 'Facebook', Icon: Facebook },
  { name: 'TikTok', Icon: TikTokIcon },
  { name: 'X', Icon: XIcon },
];

export default function SocialBar() {
  return <section className="catalog-social-bar" aria-label="Redes sociales de MiBatute">
    <p>Síguenos en redes</p>
    <div className="catalog-social-icons">
      {networks.map(({ name, Icon }) => <button key={name} type="button" disabled aria-label={name} title={name}>
        <Icon size={20} strokeWidth={1.65} aria-hidden="true" />
      </button>)}
    </div>
  </section>;
}
