import { useEffect, useRef } from 'react';
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { useStrings } from '../../i18n/strings';
import HeroText from './HeroText';
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
 * Wide screens: one viewport over the video, with the whole copy fixed in
 * place from the start — only the sections below are revealed by the scroll.
 *
 * Phones and small tablets: no video — a compact opening on the brand navy with
 * the whole copy visible from the first paint, without entrance animations.
 */
export default function Hero() {
  const wide = useMediaQuery(WIDE);
  const reducedMotion = usePrefersReducedMotion();
  const t = useStrings();

  return (
    <section id="inicio" className={`hero${wide ? '' : ' hero--compact'}`} data-theme="dark" aria-label={t.hero.label}>
      <div className="hero__stage">
        {wide && <HeroVideo play={!reducedMotion} />}
        <div className="hero__grade" aria-hidden="true" />

        <div className="hero__content">
          <HeroText />
        </div>
      </div>
    </section>
  );
}
