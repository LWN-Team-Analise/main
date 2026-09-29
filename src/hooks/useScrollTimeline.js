import { useEffect, useRef } from 'react';
import { clamp, damp } from '../lib/math';

/**
 * Drives a scroll-linked timeline for a tall "track" element whose child is
 * sticky. Calls `onFrame(progress, dt)` every animation frame while the track
 * is on screen; `progress` eases toward the real scroll position, which gives
 * the motion its cinematic inertia without hijacking the page scroll.
 */
export function useScrollTimeline(trackRef, onFrame, { enabled = true, smoothing = 6.5 } = {}) {
  const frameRef = useRef(onFrame);

  useEffect(() => {
    frameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    const track = trackRef.current;
    if (!enabled || !track) return undefined;

    let raf = 0;
    let last = 0;
    let current = null;

    const measure = () => {
      const rect = track.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      return distance > 0 ? clamp(-rect.top / distance) : 0;
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;

      const target = measure();
      // Jump straight to the right place on first paint (e.g. reload mid-page).
      if (current === null) current = target;
      else current += (target - current) * damp(smoothing, dt);
      if (Math.abs(target - current) < 0.0002) current = target;

      frameRef.current(current, dt);
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { rootMargin: '15% 0px' },
    );
    observer.observe(track);

    return () => {
      observer.disconnect();
      stop();
    };
  }, [trackRef, enabled, smoothing]);
}
