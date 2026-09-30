import { useCallback, useEffect, useRef } from 'react';
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { useScrollTimeline } from '../../hooks/useScrollTimeline';
import { useLanguage } from '../../i18n/language';
import { useStrings } from '../../i18n/strings';
import HeroText from './HeroText';
import ScrollCue from './ScrollCue';
import './Hero.css';

// LWN's own footage (assets/VideoFundoSite.mp4, remuxed so it can start
// streaming right away) and its first frame, shown until the video plays.
const VIDEO = { src: '/assets/hero/lwn-hero.mp4', poster: '/assets/hero/hero-video-poster.webp' };

// Below this width there is no video at all (it is not even downloaded).
const WIDE = '(min-width: 900px)';

/**
 * The background video: plays on its own, muted, in a loop — it never depends
 * on the scroll — and pauses only while the hero is off screen. With reduced
 * motion it stays on its first frame.
 */
function HeroVideo({ play }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    // Set the property too: some browsers only allow muted autoplay when it is.
    video.muted = true;
    if (!play) return undefined;
    const visibility = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    visibility.observe(video);
    return () => visibility.disconnect();
  }, [play]);

  return (
    <video
      ref={ref}
      className="hero__video"
      src={VIDEO.src}
      poster={VIDEO.poster}
      autoPlay={play}
      muted
      loop
      playsInline
      preload={play ? 'auto' : 'none'}
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

/**
 * Homepage hero.
 *
 * Wide screens: a full-viewport stage over the video. The section is a tall
 * scroll track with a sticky stage; the scroll reveals the description line by
 * line (the video itself plays regardless of the scroll).
 *
 * Phones and small tablets: no video — a compact opening on the brand navy with
 * the whole copy visible from the first paint, without entrance animations.
 */
export default function Hero() {
  const trackRef = useRef(null);
  const textRef = useRef(null);
  const cueRef = useRef(null);
  const wide = useMediaQuery(WIDE);
  const reducedMotion = usePrefersReducedMotion();
  const language = useLanguage();
  const t = useStrings();
  const animated = wide && !reducedMotion;

  const onFrame = useCallback((progress) => {
    textRef.current?.update(progress);
    cueRef.current?.update(progress);
  }, []);

  useScrollTimeline(trackRef, onFrame, { enabled: animated });

  const variant = !wide ? ' hero--compact' : animated ? '' : ' hero--static';

  return (
    <section id="inicio" ref={trackRef} className={`hero${variant}`} data-theme="dark" aria-label={t.hero.label}>
      <div className="hero__stage">
        {wide && <HeroVideo play={!reducedMotion} />}
        <div className="hero__grade" aria-hidden="true" />

        <div className="hero__content">
          {/* Re-measured from scratch in another language (its lines differ). */}
          <HeroText key={language} ref={textRef} isStatic={!animated} />
        </div>

        {animated && <ScrollCue ref={cueRef} />}
      </div>
    </section>
  );
}
