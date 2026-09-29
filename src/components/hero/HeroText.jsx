import { ArrowRight } from 'lucide-react';
import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TEXT } from '../../airflow/config';
import { hero } from '../../data/site';
import { range, smoothstep } from '../../lib/math';
import './HeroText.css';

const WORDS = hero.description.flatMap(({ text, strong }) =>
  text.split(' ').map((word) => ({ word, strong: Boolean(strong) })),
);
const FULL_DESCRIPTION = hero.description.map((part) => part.text).join(' ');

// Emphasise the two service families inside the headline.
const HEADLINE = hero.headline
  .split(/(Salas Limpas|Gases Industriais)/)
  .map((part) => (part === 'Salas Limpas' || part === 'Gases Industriais' ? <em key={part}>{part}</em> : part));

// Blur is applied in a few fixed steps, and only to the line that is resolving:
// every distinct blur radius costs the browser a shader variant, and a blur on
// every word dropped the hero to ~25 fps on integrated GPUs.
const blurFor = (value) => {
  if (value <= 0 || value >= 1) return '';
  if (value < 0.35) return 'blur(5px)';
  if (value < 0.7) return 'blur(2.5px)';
  return 'blur(1px)';
};

/** Groups the description words into the lines the browser actually laid out. */
function useLines(paragraphRef) {
  const [lines, setLines] = useState(null);

  useLayoutEffect(() => {
    if (lines) return;
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
  }, [lines, paragraphRef]);

  // Re-measure when the column width changes.
  useEffect(() => {
    const el = paragraphRef.current;
    if (!el) return undefined;
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.offsetWidth - width) > 1) {
        width = el.offsetWidth;
        setLines(null);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [paragraphRef]);

  return lines;
}

const renderWord = (i) => (
  <Fragment key={i}>
    <span data-word className={WORDS[i].strong ? 'hero-text__strong' : undefined}>
      {WORDS[i].word}
    </span>{' '}
  </Fragment>
);

/**
 * Headline + scroll-revealed description. `update(progress)` is called by the
 * hero every frame; lines resolve one after another as the air descends.
 */
export default function HeroText({ ref, isStatic = false }) {
  const paragraphRef = useRef(null);
  const lineRefs = useRef([]);
  const actionsRef = useRef(null);
  const cache = useRef({ lines: [], actions: -1 });
  const lines = useLines(paragraphRef);

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
        <h1 className="hero-text__headline">{HEADLINE}</h1>
      </div>

      <div className="hero-text__secondary">
        <p className="hero-text__description" ref={paragraphRef}>
          <span className="sr-only">{FULL_DESCRIPTION}</span>
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
              : WORDS.map((_, i) => renderWord(i))}
          </span>
        </p>

        <div ref={actionsRef} className="hero-text__actions" inert={!isStatic}>
          <Link to={{ pathname: '/', hash: '#contato' }} className="hero-text__button hero-text__button--primary">
            Solicite um orçamento
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to={{ pathname: '/', hash: '#servicos' }} className="hero-text__button hero-text__button--ghost">
            Nossos serviços
          </Link>
        </div>
      </div>
    </div>
  );
}
