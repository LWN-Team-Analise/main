import { useEffect, useState } from 'react';

/**
 * Returns the id of the home-page section crossing the middle of the viewport.
 * `pathname` re-binds the observer when the user navigates between pages.
 */
export function useActiveSection(ids, pathname) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!elements.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -54% 0px' },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, pathname]);

  return active;
}
