import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './BalBot.css';

// The conversation (and the content it quotes) loads on its own, off the
// critical path: prefetched once the page is idle, or on hover / focus.
const loadConversation = () => import('./BalConversation');
const BalConversation = lazy(loadConversation);

const IMAGE = '/assets/mascot/bal.webp';
const EASE = [0.22, 1, 0.36, 1];
// What BAL must never sit on top of: anything that can be tapped or clicked.
const INTERACTIVE = 'a[href], button, input, select, textarea, summary, [role="button"]';

/**
 * BAL, the LWN mascot, as a floating assistant in the bottom-right corner of
 * every page. Clicking him opens a small chat-style panel with a few topics;
 * each answer is taken from the site's own content (see balTopics.js).
 *
 * The panel is a non-modal dialog: Escape or the × closes it and returns the
 * focus to BAL; following a link to another part of the site closes it too.
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
  const reduce = useReducedMotion();
  const rootRef = useRef(null);
  const launcherRef = useRef(null);
  const panelRef = useRef(null);
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

  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.9, y: 18 },
        animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.46, ease: EASE } },
        exit: { opacity: 0, scale: 0.94, y: 12, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
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
            style={{ originX: 1, originY: 1 }}
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
                <p className="bal-panel__role">Assistente virtual da LWN Engenharia</p>
              </div>
              <button type="button" className="bal-panel__close" onClick={close} aria-label="Fechar o assistente">
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
        aria-label={open ? 'Fechar o assistente BAL' : 'Abrir o BAL, assistente virtual da LWN Engenharia'}
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={loadConversation}
        onFocus={loadConversation}
      >
        <img className="bal-launcher__figure" src={IMAGE} alt="" width="283" height="440" decoding="async" />
        <span className="bal-launcher__x" aria-hidden="true">
          <X size={13} strokeWidth={2.6} />
        </span>
        <span className="bal-launcher__hint" aria-hidden="true">
          Olá! Posso ajudar?
        </span>
      </button>
    </div>
  );
}
