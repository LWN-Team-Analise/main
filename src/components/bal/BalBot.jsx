import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStrings } from '../../i18n/strings';
import './BalBot.css';

// The conversation (and the content it quotes) loads on its own, off the
// critical path: prefetched once the page is idle, or on hover / focus.
const loadConversation = () => import('./BalConversation');
const BalConversation = lazy(loadConversation);

const IMAGE = '/assets/mascot/bal.webp';
// BAL's hop when he is clicked: a squash, a jump and a soft landing (opening),
// or a small nod (closing). Scaled from his feet.
const HOP = {
  open: [
    { y: [0, 3, -14, 0, -4, 0], scaleX: [1, 1.1, 0.94, 1.04, 0.99, 1], scaleY: [1, 0.86, 1.08, 0.95, 1.02, 1] },
    { duration: 0.75, times: [0, 0.14, 0.4, 0.66, 0.83, 1], ease: ['easeOut', 'easeOut', 'easeIn', 'easeOut', 'easeInOut'] },
  ],
  close: [
    { y: [0, 2, -6, 0], scaleX: [1, 1.05, 0.98, 1], scaleY: [1, 0.92, 1.03, 1] },
    { duration: 0.5, times: [0, 0.2, 0.55, 1], ease: ['easeOut', 'easeOut', 'easeIn'] },
  ],
};
// What BAL must never sit on top of: anything that can be tapped or clicked.
const INTERACTIVE = 'a[href], button, input, select, textarea, summary, [role="button"]';

/**
 * BAL, the LWN mascot, as a floating assistant in the bottom-right corner of
 * every page. Clicking him opens a small chat-style panel with a few topics;
 * each answer is taken from the site's own content (see balTopics.js).
 *
 * The panel is a non-modal dialog: Escape, its × or BAL himself closes it and
 * returns the focus to BAL; following a link to another part of the site
 * closes it too.
 *
 * BAL never covers a link or button: when one is underneath him (a map button
 * in a pinned section, the footer links on a phone…) he tucks himself aside,
 * leaving only a sliver in the page margin, and comes back when the corner is
 * clear. The sliver still opens the panel; hover or keyboard focus brings him
 * back in full.
 */
export default function BalBot() {
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  const t = useStrings();
  const reduce = useReducedMotion();
  const rootRef = useRef(null);
  const launcherRef = useRef(null);
  const panelRef = useRef(null);
  const [bodyRef, animateBody] = useAnimate();
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback) => setTimeout(callback, 2500));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    const id = idle(() => loadConversation());
    return () => cancel(id);
  }, []);

  // Going to another page or section closes the panel.
  useEffect(() => {
    setOpen(false);
  }, [pathname, hash]);

  // Is there something to click under BAL's corner? Checked as the page scrolls or resizes.
  useEffect(() => {
    if (open) {
      setTucked(false);
      return undefined;
    }
    const root = rootRef.current;
    let frame = 0;
    const check = () => {
      frame = 0;
      // The corner BAL stands in when he is out: his box, less the current tuck.
      const box = root.getBoundingClientRect();
      const slide = new DOMMatrixReadOnly(getComputedStyle(root).transform).m41;
      const [x, y, w, h] = [box.left - slide, box.top, box.width, box.height];
      const covered = [0.2, 0.5, 0.8].some((fx) =>
        [0.3, 0.65, 0.95].some((fy) =>
          document
            .elementsFromPoint(x + w * fx, y + h * fy)
            .some((el) => !root.contains(el) && el.closest(INTERACTIVE) && !el.closest('.site-header')),
        ),
      );
      setTucked(covered);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [open, pathname]);

  const close = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const toggle = () => {
    if (!reduce) animateBody(bodyRef.current, ...HOP[open ? 'close' : 'open']);
    setOpen((value) => !value);
  };

  // The panel grows out of BAL on a spring (a touch of overshoot, then it
  // settles) and folds back into him when it closes.
  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.82, y: 24 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 340, damping: 26, mass: 0.9, opacity: { duration: 0.22, ease: 'easeOut' } },
        },
        exit: { opacity: 0, scale: 0.88, y: 16, transition: { duration: 0.26, ease: [0.4, 0, 0.6, 1] } },
      };

  return (
    <div ref={rootRef} className="bal" data-open={open || undefined} data-tucked={tucked || undefined}>
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            ref={panelRef}
            id="bal-panel"
            className="bal-panel"
            role="dialog"
            aria-labelledby="bal-title"
            tabIndex={-1}
            style={{ originX: 0.93, originY: 1 }}
            {...panelMotion}
          >
            <header className="bal-panel__head">
              <span className="bal-panel__avatar" aria-hidden="true">
                <img src={IMAGE} alt="" width="283" height="440" />
              </span>
              <div className="bal-panel__who">
                <p className="bal-panel__name" id="bal-title">
                  BAL
                </p>
                <p className="bal-panel__role">{t.bal.role}</p>
              </div>
              <button type="button" className="bal-panel__close" onClick={close} aria-label={t.bal.closePanel}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <Suspense fallback={<div className="bal-chat bal-chat--loading" aria-hidden="true" />}>
              <BalConversation onNavigate={() => setOpen(false)} />
            </Suspense>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        ref={launcherRef}
        type="button"
        className="bal-launcher"
        aria-expanded={open}
        aria-controls="bal-panel"
        aria-label={open ? t.bal.close : t.bal.open}
        onClick={toggle}
        onPointerEnter={loadConversation}
        onFocus={loadConversation}
      >
        <span ref={bodyRef} className="bal-launcher__body">
          <img className="bal-launcher__figure" src={IMAGE} alt="" width="283" height="440" decoding="async" />
        </span>
        <span className="bal-launcher__hint" aria-hidden="true">
          {t.bal.hint}
        </span>
      </button>
    </div>
  );
}
