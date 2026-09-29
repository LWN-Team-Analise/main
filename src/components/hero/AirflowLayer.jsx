import { useEffect, useImperativeHandle, useRef } from 'react';
import { createAirflow } from '../../airflow/createAirflow';

/**
 * Transparent WebGL layer that draws the HVAC airflow over the hero photo.
 * The parent drives it through `update(progress, dt)`; with `staticProgress`
 * it renders a single still frame (reduced-motion mode).
 */
export default function AirflowLayer({ ref, staticProgress, onUnavailable }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useImperativeHandle(
    ref,
    () => ({
      update(progress, dt) {
        engineRef.current?.render(progress, { dt, pointer: pointerRef.current });
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    // A fresh canvas per mount: a disposed WebGL context can't be reused.
    const canvas = document.createElement('canvas');
    canvas.className = 'hero__air-canvas';
    container.appendChild(canvas);

    let engine;
    try {
      engine = createAirflow(canvas);
    } catch {
      canvas.remove();
      onUnavailable?.();
      return undefined;
    }
    engineRef.current = engine;

    const drawStill = () => {
      if (staticProgress !== undefined) engine.render(staticProgress, { animate: false });
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      engine.resize(entry.contentRect.width, entry.contentRect.height);
      drawStill();
    });
    resizeObserver.observe(container);

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const onPointerMove = (event) => {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    if (finePointer && staticProgress === undefined) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    const onLost = (event) => {
      event.preventDefault();
      onUnavailable?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', onLost);
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
    };
  }, [staticProgress, onUnavailable]);

  return <div ref={containerRef} className="hero__air" aria-hidden="true" />;
}
