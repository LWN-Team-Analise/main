import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1];

/** Fades and lifts its children into place the first time they enter the viewport. */
export default function Reveal({ as = 'div', delay = 0, y = 24, className, children, ...rest }) {
  const reduce = useReducedMotion();
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </Component>
  );
}
