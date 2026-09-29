import { useEffect, useState } from 'react';

/**
 * Reports whether the section currently behind the floating header is dark or
 * light (via `data-theme` on sections), so the glass and its content can adapt.
 */
export function useHeaderTheme(probeY = 40, deps = []) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const x = window.innerWidth / 2;
      const stack = document.elementsFromPoint(x, probeY);
      const target = stack.find((el) => !el.closest('.site-header'));
      setTheme(target?.closest('[data-theme]')?.getAttribute('data-theme') ?? 'light');
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeY, ...deps]);

  return theme;
}
