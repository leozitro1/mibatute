import { useEffect, useState } from 'react';

export default function useVisibleSponsor(ref) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let inView = false;
    const update = () => setVisible(inView && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref]);

  return visible;
}
