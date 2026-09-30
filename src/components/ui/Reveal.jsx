import { motion, useReducedMotion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';

const EASE = [0.22, 1, 0.36, 1];
// On phones and small tablets, what is already on screen when a page opens is
// simply there: only content further down fades in as it is scrolled to.
const COMPACT = '(max-width: 899px)';

/** Fades and lifts its children into place the first time they enter the viewport. */
export default function Reveal({ as = 'div', delay = 0, y = 24, className, children, ...rest }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [inPlace, setInPlace] = useState(false);
  const Component = motion[as];

  // Measured before the first paint, so an element that starts in view never
  // shows its hidden state (the re-render below happens before the browser paints).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia(COMPACT).matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) setInPlace(true);
  }, []);

  const still = reduce || inPlace;
  return (
    <Component
      key={inPlace ? 'in-place' : 'reveal'}
      ref={ref}
      className={className}
      initial={still ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Component>
  );
}
