import { useCallback, useRef, useState } from 'react';
import { PHOTO, PUSH_IN } from '../../airflow/config';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { useScrollTimeline } from '../../hooks/useScrollTimeline';
import { lerp } from '../../lib/math';
import AirflowLayer from './AirflowLayer';
import HeroText from './HeroText';
import ScrollCue from './ScrollCue';
import './Hero.css';

// In reduced-motion mode the air is shown as a single still frame.
const STILL_PROGRESS = 0.62;

/**
 * Full-viewport cleanroom hero. The section is a tall scroll track with a
 * sticky stage: scrolling through it drives the HVAC airflow, a slow camera
 * push-in on the photo and the text reveal from one smoothed timeline.
 */
export default function Hero() {
  const trackRef = useRef(null);
  const mediaRef = useRef(null);
  const airRef = useRef(null);
  const textRef = useRef(null);
  const cueRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [airAvailable, setAirAvailable] = useState(true);
  const handleUnavailable = useCallback(() => setAirAvailable(false), []);

  const onFrame = useCallback((progress, dt) => {
    airRef.current?.update(progress, dt);
    textRef.current?.update(progress);
    cueRef.current?.update(progress);
    if (mediaRef.current) {
      mediaRef.current.style.transform = `scale(${lerp(PUSH_IN.from, PUSH_IN.to, progress).toFixed(4)})`;
    }
  }, []);

  useScrollTimeline(trackRef, onFrame, { enabled: !reducedMotion });

  const animated = !reducedMotion;

  return (
    <section
      id="inicio"
      ref={trackRef}
      className={`hero${animated ? '' : ' hero--static'}`}
      data-theme="dark"
      aria-label="Apresentação"
    >
      <div className="hero__stage">
        {/* Phones held upright: a soft, dark continuation of the photo under the copy (Hero.css). */}
        <div className="hero__backdrop" style={{ backgroundImage: `url(${PHOTO.url})` }} aria-hidden="true" />
        <div className="hero__media" ref={mediaRef}>
          <img
            className="hero__photo"
            src={PHOTO.url}
            alt="Sala limpa em operação: técnicos com vestimentas de sala limpa, dutos de HVAC no teto e fluxo de ar descendo sobre os equipamentos."
            width={PHOTO.width}
            height={PHOTO.height}
            fetchPriority="high"
            decoding="async"
          />
          {/* Tones the very bright room down under the air, so the airflow reads. */}
          <div className="hero__shade" aria-hidden="true" />
          {airAvailable && (
            <AirflowLayer
              ref={airRef}
              staticProgress={animated ? undefined : STILL_PROGRESS}
              onUnavailable={handleUnavailable}
            />
          )}
        </div>

        <div className="hero__grade" aria-hidden="true" />

        <div className="hero__content">
          <HeroText ref={textRef} isStatic={!animated} />
        </div>

        {animated && <ScrollCue ref={cueRef} />}
      </div>
    </section>
  );
}
