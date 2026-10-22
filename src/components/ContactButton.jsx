import { CONTACT_EMAIL } from '../config/availability.js';

export default function ContactButton({ children = 'Contactar a MiBatute', subject = '', onClick, ...props }) {
  return <button {...props} type="button" onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) window.location.assign(`mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`);
  }}>{children}</button>;
}
