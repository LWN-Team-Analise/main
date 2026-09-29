import { animate, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef } from 'react';

const format = (n, grouped) => (grouped ? Math.round(n).toLocaleString('pt-BR') : String(Math.round(n)));

/** Counts up to `value` the first time it scrolls into view. */
export default function Counter({ value, prefix = '', suffix = '', grouped = true }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const write = (n) => {
    if (ref.current) ref.current.textContent = `${prefix}${format(n, grouped)}${suffix}`;
  };

  // The text is written imperatively so the count-up never re-renders React.
  useLayoutEffect(() => {
    write(reduce ? value : 0);
  }, []);

  useEffect(() => {
    if (!inView) return undefined;
    if (reduce) {
      write(value);
      return undefined;
    }
    const controls = animate(0, value, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: write });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return <span ref={ref} />;
}
