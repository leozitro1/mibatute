import { createPortal } from 'react-dom';
import useMobileApp from './useMobileApp.js';

export default function ProfileIdentityPlacement({ target, children }) {
  const inHeader = useMobileApp();
  return inHeader && target ? createPortal(children,target) : children;
}
