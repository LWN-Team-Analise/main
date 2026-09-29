import { useEffect, useRef } from 'react';
import { clamp, damp } from '../../lib/math';
import './Marquee.css';

const MAX_FLING = 2400; // px/s — the most momentum a release can carry
const WHEEL_IDLE_MS = 120; // a trackpad swipe counts as released after this long without input

/**
 * Seamless, infinite horizontal carousel that moves on its own and can be
 * grabbed. The content is rendered twice and the offset wraps by exactly one
 * copy, so the loop never shows a seam, wherever it is grabbed.
 *
 * Press and drag with the mouse, a finger or a pen (or swipe sideways on a
 * trackpad): the automatic movement stops and the content follows the pointer
 * 1:1. Let go and it keeps travelling in the direction of the drag — the
 * release speed carries on as momentum and eases into the cruising speed, now
 * in that direction. It pauses off-screen, eases down while it holds keyboard
 * focus, and with reduced motion it only moves when dragged.
 */
export default function Marquee({ children, speed = 40, reverse = false, className = '', label }) {
  const rootRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let distance = 0; // width of one copy of the content
    let offset = 0; // px; negative = moved left
    let direction = reverse ? 1 : -1;
    let velocity = reduceMotion ? 0 : direction * speed;
    let slow = 1; // keyboard-focus slowdown, eased
    let slowTarget = 1;

    // The current grab: a pointer (mouse, touch, pen) or a trackpad swipe.
    let grab = null; // { pointer, lastX, lastTime, velocity, travelled, net }
    let lastTravel = 0; // how far the last grab moved: a real drag must not end in a click
    let wheelTimer = 0;

    let raf = 0;
    let last = 0;

    const measure = () => {
      distance = track.scrollWidth / 2;
    };
    const apply = () => {
      if (!distance) return;
      let x = offset % distance;
      if (x > 0) x -= distance;
      track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      if (grab) return; // the pointer owns the position
      slow += (slowTarget - slow) * damp(4, dt);
      const cruise = reduceMotion ? 0 : direction * speed * slow;
      velocity += (cruise - velocity) * damp(2.2, dt);
      offset += velocity * dt;
      apply();
    };

    // ---------- Grab, follow, release ----------

    const begin = (pointer, x) => {
      grab = { pointer, lastX: x, lastTime: performance.now(), velocity, travelled: 0, net: 0 };
      lastTravel = 0;
      root.classList.add('is-dragging');
    };
    const follow = (dx) => {
      const now = performance.now();
      const seconds = Math.max(1, now - grab.lastTime) / 1000;
      offset += dx;
      grab.travelled += Math.abs(dx);
      grab.net += dx;
      // Smoothed pointer speed: what the carousel carries on when released.
      grab.velocity += (dx / seconds - grab.velocity) * 0.35;
      grab.lastTime = now;
      apply();
    };
    const release = () => {
      if (!grab) return;
      const g = grab;
      grab = null;
      lastTravel = g.travelled;
      root.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (g.travelled < 3) {
        velocity = g.velocity; // a tap: carry on as before
        return;
      }
      // A pointer held still before letting go carries (almost) no momentum…
      const held = performance.now() - g.lastTime;
      let fling = g.velocity;
      if (held > 60) fling *= Math.max(0, 1 - (held - 60) / 180);
      // …but the carousel always carries on in the direction it was dragged.
      const way = Math.abs(fling) > 30 ? Math.sign(fling) : Math.sign(g.net);
      if (way) direction = way;
      velocity = clamp(fling, -MAX_FLING, MAX_FLING);
    };

    // Move/up are heard on the window, so the drag keeps following the pointer
    // even when it leaves the carousel, and always ends when the button is released.
    const onMove = (event) => {
      if (!grab || event.pointerId !== grab.pointer) return;
      follow(event.clientX - grab.lastX);
      grab.lastX = event.clientX;
    };
    const onUp = (event) => {
      if (grab && event.pointerId === grab.pointer) release();
    };
    const onDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (grab) release();
      // No native image drag or text selection: the press belongs to the carousel.
      if (event.pointerType === 'mouse') event.preventDefault();
      begin(event.pointerId, event.clientX);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    // A sideways trackpad swipe drags it the same way.
    const onWheel = (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return; // vertical: the page scrolls
      event.preventDefault(); // …and the browser does not navigate back/forward
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientWidth : 1;
      if (!grab) begin('wheel', 0);
      if (grab.pointer !== 'wheel') return;
      follow(-event.deltaX * unit);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(release, WHEEL_IDLE_MS);
    };

    // A drag must not turn into a click on whatever was under the pointer.
    const onClickCapture = (event) => {
      if (lastTravel > 5) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onDragStart = (event) => event.preventDefault();
    const onFocusIn = () => {
      slowTarget = 0.12;
    };
    const onFocusOut = () => {
      slowTarget = 1;
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    for (const img of track.querySelectorAll('img')) img.draggable = false;
    measure();
    apply();
    const sizing = new ResizeObserver(() => {
      measure();
      apply();
    });
    sizing.observe(track);
    const visibility = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    visibility.observe(root);

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);

    return () => {
      stop();
      release();
      clearTimeout(wheelTimer);
      sizing.disconnect();
      visibility.disconnect();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, [speed, reverse]);

  return (
    <div ref={rootRef} className={`marquee ${className}`.trim()} role={label ? 'region' : undefined} aria-label={label}>
      <div ref={trackRef} className="marquee__track">
        <div className="marquee__group">{children}</div>
        <div className="marquee__group" aria-hidden="true" inert>
          {children}
        </div>
      </div>
    </div>
  );
}
