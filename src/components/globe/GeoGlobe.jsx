import { useEffect, useRef } from 'react';
import { ROUTE } from '../../data/serviceRoute';
import { offices } from '../../data/site';
import { useColorScheme } from '../../hooks/useColorScheme';
import { clamp, damp } from '../../lib/math';
import { createGlobe } from './globeEngine';
import './GeoGlobe.css';

// Scroll quiet for this long (and the camera settled) counts as idle.
const IDLE_AFTER_MS = 350;
// Stiffness of the spring that follows the scroll (rad/s): lower = more glide.
const FOLLOW = 4.8;

// The place names, in the engine's order: the offices, then the client states.
const LABELS = [...offices.map((o) => o.city), ...ROUTE.map((r) => r.name)];

/**
 * The single globe behind "Onde encontrar o Grupo LWN" and "Nossos Clientes".
 *
 * One rAF loop, running while the pair of sections is on screen, turns the
 * scroll position into the journey position T (0..3): one unit through the
 * offices track, one across the bridge between the two tracks, one through
 * the clients track. The scroll is followed by a critically damped spring —
 * it accelerates and settles smoothly and never overshoots — so the camera
 * glides continuously with the scroll, in both directions. The time since the
 * last scroll feeds the idle turn of the Earth.
 *
 * The place names are page text laid over the canvas (crisp at any pixel
 * density), moved every frame to sit beside their markers.
 *
 * `onStep({ phase, offices, clients })` fires only when the copy should change
 * (another place in focus), so the sections never re-render every frame.
 */
export default function GeoGlobe({ wrapRef, locationsRef, clientsRef, onStep, className = '' }) {
  const canvasRef = useRef(null);
  const labelsRef = useRef(null);
  const globeRef = useRef(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const scheme = useColorScheme();
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const labelEls = [...labelsRef.current.children];
    const labelState = labelEls.map(() => '');
    const room = labelEls.map(() => 1); // eased 0..1: is there room for this name?
    const globe = createGlobe(canvas);
    globeRef.current = globe;
    globe.setScheme(schemeRef.current);
    globe.resize();
    if (import.meta.env.DEV) canvas.globe = globe;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    let follow = null; // the spring's position (px into the wrapper)
    let velocity = 0;
    let idle = 0;
    let lastScroll = 0;
    let stepKey = '';

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;

      const vh = window.innerHeight;
      const y = -wrap.getBoundingClientRect().top;
      const locationsH = locationsRef.current?.offsetHeight ?? 0;
      const clientsH = clientsRef.current?.offsetHeight ?? 0;

      if (follow === null) {
        follow = y;
        velocity = 0;
      } else {
        // Critically damped spring, sub-stepped for stability on slow frames.
        for (let t = 0; t < dt; t += 1 / 120) {
          const h = Math.min(1 / 120, dt - t);
          velocity += (FOLLOW * FOLLOW * (y - follow) - 2 * FOLLOW * velocity) * h;
          follow += velocity * h;
        }
        if (Math.abs(y - follow) < 0.3 && Math.abs(velocity) < 2) {
          follow = y;
          velocity = 0;
        }
      }

      const settled = now - lastScroll > IDLE_AFTER_MS && Math.abs(velocity) < 4;
      const target = reduceMotion ? 0 : settled ? 1 : 0;
      idle += (target - idle) * damp(target ? 1.2 : 6, dt);

      const T =
        clamp(follow / Math.max(1, locationsH - vh)) +
        clamp((follow - (locationsH - vh)) / vh) +
        clamp((follow - locationsH) / Math.max(1, clientsH - vh));

      const info = globe.render({ T, idle, dt, time: now });
      if (!info) return;
      if (import.meta.env.DEV) canvas.lastFrame = { T, ...info };

      // Each name follows its marker: the place in focus in full, the places
      // already visited quieter. A name that would overlap another fades out
      // until there is room again.
      info.labels.forEach((label, i) => {
        const el = labelEls[i];
        if (!el) return;
        if (!label.alpha) room[i] = label.clear ? 1 : 0;
        else room[i] += ((label.clear ? 1 : 0) - room[i]) * damp(12, dt);
        const opacity = label.alpha * room[i] * (0.62 + 0.38 * label.emph);
        const x = label.x + label.side * label.gap;
        const next =
          opacity > 0.005
            ? `${x.toFixed(1)},${label.y.toFixed(1)},${label.side},${opacity.toFixed(3)},${label.emph.toFixed(2)}`
            : '';
        if (next === labelState[i]) return;
        labelState[i] = next;
        if (!next) {
          el.style.visibility = 'hidden';
          return;
        }
        el.style.visibility = 'visible';
        el.style.opacity = opacity.toFixed(3);
        el.style.setProperty('--emph', label.emph.toFixed(2));
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${label.y.toFixed(1)}px, 0) translate(${label.side > 0 ? '0' : '-100%'}, -50%)`;
      });
      const key = `${info.phase}|${info.offices.active}|${info.offices.reached}|${info.clients.active}|${info.clients.reached}|${info.clients.overview}`;
      if (key !== stepKey) {
        stepKey = key;
        onStepRef.current?.({ phase: info.phase, offices: info.offices, clients: info.clients });
      }
    };

    const start = () => {
      if (raf) return;
      last = 0;
      follow = null;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onScroll = () => {
      lastScroll = performance.now();
    };

    const visibility = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), {
      rootMargin: '10% 0px',
    });
    visibility.observe(wrap);
    const sizing = new ResizeObserver(() => globe.resize());
    sizing.observe(canvas);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      stop();
      visibility.disconnect();
      sizing.disconnect();
      window.removeEventListener('scroll', onScroll);
      globeRef.current = null;
    };
  }, [wrapRef, locationsRef, clientsRef]);

  useEffect(() => {
    globeRef.current?.setScheme(scheme);
  }, [scheme]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`geo-globe ${className}`.trim()}
        role="img"
        aria-label="Globo interativo: as unidades da LWN em São Paulo, Barueri e Anápolis e os estados atendidos — São Paulo, Goiás, Rio de Janeiro, Minas Gerais, Paraná e Pernambuco."
      />
      <div ref={labelsRef} className="geo-globe__labels" aria-hidden="true">
        {LABELS.map((name, i) => (
          <span key={i} className="geo-label">
            {name}
          </span>
        ))}
      </div>
    </>
  );
}
