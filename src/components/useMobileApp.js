import { useEffect, useState } from 'react';

function mobileApp() {
  return window.matchMedia('(max-width: 1023px)').matches && (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true ||
    (import.meta.env.DEV && document.documentElement.dataset.localAppPreview === 'true')
  );
}

export default function useMobileApp() {
  const [active,setActive] = useState(mobileApp);
  useEffect(() => {
    const queries = ['(max-width: 1023px)','(display-mode: standalone)'].map(value => window.matchMedia(value));
    const update = () => setActive(mobileApp());
    queries.forEach(query => query.addEventListener('change',update));
    return () => queries.forEach(query => query.removeEventListener('change',update));
  },[]);
  return active;
}
