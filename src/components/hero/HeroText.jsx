import { ArrowRight } from 'lucide-react';
import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import { range, smoothstep } from '../../lib/math';
import { TEXT } from './timeline';
import './HeroText.css';

/** The hero copy prepared for rendering: description words, and the headline with its two service families emphasised. */
function useCopy(hero) {
  return useMemo(() => {
    const words = hero.description.flatMap(({ text, strong }) =>
      text.split(' ').map((word) => ({ word, strong: Boolean(strong) })),
    );
    const pattern = new RegExp(`(${hero.emphasis.join('|')})`);
    const headline = hero.headline
      .split(pattern)
      .map((part) => (hero.emphasis.includes(part) ? <em key={part}>{part}</em> : part));
    return { words, full: hero.description.map((part) => part.text).join(' '), headline };
  }, [hero]);
}

// Blur is applied in a few fixed steps, and only to the line that is resolving:
// every distinct blur radius costs the browser a shader variant, and a blur on
// every word dropped the hero to ~25 fps on integrated GPUs.
const blurFor = (value) => {
  if (value <= 0 || value >= 1) return '';
  if (value < 0.35) return 'blur(5px)';
  if (value < 0.7) return 'blur(2.5px)';
  return 'blur(1px)';
};

/**
 * Groups the description words into the lines the browser actually laid out
 * (only needed for the line-by-line reveal; `enabled` is false when static).
 */
function useLines(paragraphRef, enabled) {
  const [lines, setLines] = useState(null);

  useLayoutEffect(() => {
    if (!enabled || lines) return;
    const words = paragraphRef.current?.querySelectorAll('[data-word]');
    if (!words?.length) return;
    const grouped = [];
    let top = null;
    words.forEach((el, i) => {
      if (top === null || Math.abs(el.offsetTop - top) > 4) {
        grouped.push([]);
        top = el.offsetTop;
      }
      grouped[grouped.length - 1].push(i);
    });
    setLines(grouped);
  }, [enabled, lines, paragraphRef]);

  // Re-measure when the column width changes, and once the web font has loaded
  // (its wider glyphs can move words to another line).
  useEffect(() => {
    const el = paragraphRef.current;
    if (!enabled || !el) return undefined;
    let alive = true;
    document.fonts?.ready.then(() => alive && setLines(null));
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.offsetWidth - width) > 1) {
        width = el.offsetWidth;
        setLines(null);
      }
    });
    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [enabled, paragraphRef]);

  return lines;
}

/**
 * Headline + description. On wide screens the description is revealed by the
 * scroll: `update(progress)` is called by the hero every frame and the lines
 * resolve one after another. `isStatic` shows everything at once (phones,
 * reduced motion).
 */
export default function HeroText({ ref, isStatic = false }) {
  const { hero } = useSite();
  const t = useStrings();
  const { words, full, headline } = useCopy(hero);
  const renderWord = (i) => (
    <Fragment key={i}>
      <span data-word className={words[i].strong ? 'hero-text__strong' : undefined}>
        {words[i].word}
      </span>{' '}
    </Fragment>
  );
  const paragraphRef = useRef(null);
  const lineRefs = useRef([]);
  const actionsRef = useRef(null);
  const cache = useRef({ lines: [], actions: -1 });
  const lines = useLines(paragraphRef, !isStatic);

  useImperativeHandle(
    ref,
    () => ({
      update(progress) {
        const { start, end, window: span } = TEXT.description;
        const count = lineRefs.current.length;
        lineRefs.current.forEach((el, i) => {
          if (!el) return;
          const at = count > 1 ? start + (end - start - span) * (i / (count - 1)) : start;
          const value = Math.round(smoothstep(range(progress, at, at + span)) * 200) / 200;
          if (cache.current.lines[i] === value) return;
          cache.current.lines[i] = value;
          el.style.setProperty('--reveal', value);
          el.style.filter = blurFor(value);
        });

        const actions = Math.round(smoothstep(range(progress, TEXT.actions.start, TEXT.actions.end)) * 200) / 200;
        if (actions !== cache.current.actions && actionsRef.current) {
          cache.current.actions = actions;
          actionsRef.current.style.setProperty('--reveal', actions);
          actionsRef.current.toggleAttribute('inert', actions < 0.5);
        }
      },
    }),
    [],
  );

  // New line elements start unrevealed; the next frame applies their state.
  useLayoutEffect(() => {
    lineRefs.current.length = lines ? lines.length : 0;
    cache.current.lines = [];
  }, [lines]);

  return (
    <div className={`hero-text${isStatic ? ' hero-text--static' : ''}`}>
      <div className="hero-text__primary">
        <p className="hero-text__eyebrow">
          <span className="hero-text__eyebrow-mark" aria-hidden="true" />
          {hero.eyebrow}
        </p>
        <h1 className="hero-text__headline">{headline}</h1>
      </div>

      <div className="hero-text__secondary">
        <p className="hero-text__description" ref={paragraphRef}>
          <span className="sr-only">{full}</span>
          <span aria-hidden="true">
            {lines
              ? lines.map((indices, li) => (
                  <span
                    key={li}
                    className="hero-text__line"
                    ref={(el) => {
                      lineRefs.current[li] = el;
                    }}
                  >
                    {indices.map(renderWord)}
                  </span>
                ))
              : words.map((_, i) => renderWord(i))}
          </span>
        </p>

        <div ref={actionsRef} className="hero-text__actions" inert={!isStatic}>
          <Link to={{ pathname: '/', hash: '#contato' }} className="hero-text__button hero-text__button--primary">
            {t.hero.quote}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to={{ pathname: '/', hash: '#servicos' }} className="hero-text__button hero-text__button--ghost">
            {t.hero.services}
          </Link>
        </div>
      </div>
    </div>
  );
}
