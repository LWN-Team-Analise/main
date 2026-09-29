import { useCallback, useEffect, useRef, useState } from 'react';
import { useScrollTimeline } from '../../hooks/useScrollTimeline';
import { canDecodeFrames, createFrameSequence } from '../../lib/frameSequence';

/**
 * A video whose playhead follows the scroll position of `trackRef`: 0 at the
 * top of the track, the last frame at its end. It never plays on its own.
 *
 * Frames come from lib/frameSequence (decoded once in a worker, painted on a
 * canvas with a cross-fade between neighbours), driven by the eased progress
 * of useScrollTimeline, so the motion stays continuous in both directions.
 * Browsers without WebCodecs fall back to seeking a muted, control-less <video>.
 *
 * `preload`: 'eager' starts decoding on mount (the hero); 'idle' waits for the
 * browser to be idle, so a video further down is ready before it is reached.
 */
export default function ScrollVideo({ src, trackRef, className, onProgress, smoothing = 7, preload = 'eager' }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const sequenceRef = useRef(null);
  const progressRef = useRef(0);
  const [mode, setMode] = useState(() => (canDecodeFrames() ? 'frames' : 'video'));

  useEffect(() => {
    if (mode !== 'frames') return undefined;
    const canvas = canvasRef.current;
    const sequence = createFrameSequence(canvas, src, { onUnsupported: () => setMode('video') });
    sequenceRef.current = sequence;
    if (import.meta.env.DEV) canvas.sequence = sequence;
    sequence.setProgress(progressRef.current);

    let idle = 0;
    if (preload === 'eager') sequence.load();
    else if (window.requestIdleCallback) idle = window.requestIdleCallback(() => sequence.load(), { timeout: 2500 });
    else idle = window.setTimeout(() => sequence.load(), 1200);

    // Decoded frames are only kept while the section is near the viewport.
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? sequence.activate() : sequence.deactivate()),
      { rootMargin: '120% 0px' },
    );
    observer.observe(trackRef.current);

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => sequence.resize(), 250);
    };
    window.addEventListener('resize', onResize);

    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
      sequence.destroy();
      sequenceRef.current = null;
    };
  }, [mode, src, trackRef, preload]);

  const seekVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration || video.seeking) return;
    const time = progressRef.current * Math.max(video.duration - 0.05, 0);
    if (Math.abs(video.currentTime - time) > 0.02) video.currentTime = time;
  }, []);

  const onFrame = useCallback(
    (progress) => {
      progressRef.current = progress;
      onProgress?.(progress);
      if (sequenceRef.current) sequenceRef.current.setProgress(progress);
      else seekVideo();
    },
    [onProgress, seekVideo],
  );

  useScrollTimeline(trackRef, onFrame, { smoothing });

  if (mode === 'frames') {
    return <canvas ref={canvasRef} className={`scroll-video ${className ?? ''}`.trim()} aria-hidden="true" />;
  }

  return (
    <video
      ref={videoRef}
      className={`scroll-video ${className ?? ''}`.trim()}
      src={src}
      data-ready="true"
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      aria-hidden="true"
      onLoadedMetadata={seekVideo}
      onSeeked={seekVideo}
    />
  );
}
