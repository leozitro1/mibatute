import { createPortal } from 'react-dom';
import useMobileApp from './useMobileApp.js';

export default function ProfileIdentityPlacement({ target, children, insideCard = false }) {
  const inHeader = useMobileApp();
  return !insideCard && inHeader && target ? createPortal(children,target) : children;
}
