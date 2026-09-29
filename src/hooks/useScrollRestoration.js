import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Scrolls to `#hash` targets after navigation, or to the top on a new page. */
export function useScrollRestoration() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === 'POP' && !hash) return; // let the browser restore history scroll
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return undefined;
    }
    let frame = 0;
    let tries = 0;
    // The target may belong to a lazily rendered page: wait a few frames for it.
    const scroll = () => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (tries++ < 30) frame = requestAnimationFrame(scroll);
    };
    scroll();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key, navigationType]);
}
