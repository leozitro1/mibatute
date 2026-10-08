import { useLayoutEffect } from 'react';

export default function useDetailScroll(isOpen) {
  useLayoutEffect(() => {
    if (!isOpen) return;
    const { body, documentElement } = document;
    const x = window.scrollX;
    const y = window.scrollY;
    const previous = {
      position: body.style.position, top: body.style.top, left: body.style.left,
      width: body.style.width, paddingRight: body.style.paddingRight,
    };
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = `-${x}px`;
    body.style.width = '100%';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      Object.assign(body.style, previous);
      const behavior = documentElement.style.scrollBehavior;
      documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(x, y);
      documentElement.style.scrollBehavior = behavior;
    };
  }, [isOpen]);
}
