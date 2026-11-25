import { useEffect, useRef } from 'react';

export default function AutoCloseDetails({ children, className }) {
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <details className={className} onToggle={event => {
    window.clearTimeout(timer.current);
    const details = event.currentTarget;
    if (details.open) timer.current = window.setTimeout(() => { details.open = false; }, 3000);
  }}>{children}</details>;
}
