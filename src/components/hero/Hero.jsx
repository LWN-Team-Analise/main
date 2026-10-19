import { useEffect, useRef } from 'react';
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { useStrings } from '../../i18n/strings';
import HeroText from './HeroText';
import './Hero.css';

// LWN's own footage (assets/VideoFundoSite.mp4, remuxed so it can start
// streaming right away) and its first frame, shown until the video plays.
const VIDEO = { src: '/assets/hero/lwn-hero.mp4', poster: '/assets/hero/hero-video-poster.webp' };

// From this width the video is a band across the top of the screen; below
// it, it is shown whole at its own proportions (16:9), under the header.
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
 * Wide screens: one viewport. The video takes the upper part (a little over
 * half the screen) and fades into the brand navy, where the whole copy sits —
 * in place from the start; only the sections below are revealed by the scroll.
 *
 * Phones and small tablets: the same video, whole (not cropped or stretched),
 * full width just below the header, then the copy on the brand navy — visible
 * from the first paint, without entrance animations.
 */
export default function Hero() {
  const wide = useMediaQuery(WIDE);
  const reducedMotion = usePrefersReducedMotion();
  const t = useStrings();

  return (
    <section id="inicio" className={`hero${wide ? '' : ' hero--compact'}`} data-theme="dark" aria-label={t.hero.label}>
      <div className="hero__stage">
        <div className="hero__media">
          <HeroVideo play={!reducedMotion} />
          <div className="hero__grade" aria-hidden="true" />
        </div>

        <div className="hero__content">
          <HeroText />
        </div>
      </div>
    </section>
  );
}
