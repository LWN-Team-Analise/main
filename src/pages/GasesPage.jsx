import { ArrowDown, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../components/ui/Reveal';
import ScrollVideo from '../components/ui/ScrollVideo';
import SectionHeading from '../components/ui/SectionHeading';
import { company } from '../data/site';
import { gasesPage as page } from '../data/gases';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { clamp, range, smoothstep } from '../lib/math';
import './GasesPage.css';

function Hero() {
  const trackRef = useRef(null);
  const stageRef = useRef(null);
  // Exposes the scroll progress to CSS (--p) for the copy and the progress rail.
  const onProgress = useCallback((p) => stageRef.current?.style.setProperty('--p', p.toFixed(4)), []);

  return (
    <header ref={trackRef} className="gases-hero" data-theme="light">
      <div ref={stageRef} className="gases-hero__stage">
        <ScrollVideo src="/assets/smoke.mp4" trackRef={trackRef} onProgress={onProgress} className="gases-hero__video" />
        <div className="gases-hero__shade" aria-hidden="true" />

        <div className="container gases-hero__content">
          <Link to={{ pathname: '/', hash: '#servicos' }} className="back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar
          </Link>
          <p className="eyebrow">
            <span className="eyebrow__index">Gases</span>
            {page.eyebrow}
          </p>
          <h1 className="gases-hero__title">{page.title}</h1>
          <p className="gases-hero__lead">{page.lead}</p>
          <div className="gases-hero__actions">
            <Link to={{ pathname: '/', hash: '#contato' }} className="button button--dark">
              Quero certificar agora
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <ul className="gases-hero__norms" aria-label="Referências normativas">
              {page.norms.map((norm) => (
                <li key={norm}>{norm}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="gases-hero__rail" aria-hidden="true">
          <span className="gases-hero__cue">
            <ArrowDown size={14} />
            Role para revelar
          </span>
        </div>
      </div>
    </header>
  );
}

function Why() {
  const { why } = page;
  return (
    <section className="gases-why" data-theme="light" aria-labelledby="gases-why-title">
      <div className="container gases-why__grid">
        <SectionHeading id="gases-why-title" index="01" eyebrow="O porquê" title={why.title} />
        <div className="gases-why__body">
          {why.paragraphs.map((p) => (
            <Reveal as="p" key={p.slice(0, 24)}>
              {p}
            </Reveal>
          ))}
          <ul className="gases-why__goals">
            {why.goals.map((goal, i) => (
              <Reveal as="li" key={goal} delay={0.05 * i}>
                <Check size={18} aria-hidden="true" />
                {goal}
              </Reveal>
            ))}
          </ul>
          <Reveal as="p" className="gases-why__closing">
            {why.closing}
          </Reveal>
          <Reveal className="gases-why__gases">
            <p className="service__caption">Gases qualificados</p>
            <ul>
              {page.gases.map((gas) => (
                <li key={gas}>{gas}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Analyses() {
  return (
    <section className="gases-analyses" data-theme="light" aria-labelledby="gases-analyses-title">
      <div className="container">
        <SectionHeading
          id="gases-analyses-title"
          index="02"
          eyebrow="Ensaios"
          title="Análises completas para cada ponto da sua rede de gases."
        />
        <ol className="gases-analyses__grid">
          {page.analyses.map((a, i) => (
            <Reveal as="li" key={a.title} className="analysis" delay={0.04 * (i % 3)}>
              <span className="analysis__index">02.{i + 1}</span>
              <h3 className="analysis__title">{a.title}</h3>
              {a.text && <p className="analysis__text">{a.text}</p>}
              {a.items && (
                <ul className="analysis__items">
                  {a.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Scroll storytelling for video2. The story is a run of "slides" — the intro,
// then one per sector — each owning an equal slice of the scroll. Every slide's
// entrance and exit is tied to the same eased progress that scrubs the video,
// so copy and picture move together, forwards and backwards.
const SECTORS = page.sectors.list;
const SLIDES = SECTORS.length + 1;
const pad = (n) => String(n).padStart(2, '0');
const storyState = (i, active) => (i < active ? 'past' : i === active ? 'active' : 'next');

/**
 * How far a slide has entered (in) and left (out) at progress `p`, both 0..1.
 * A slide finishes leaving just before its boundary and the next one starts
 * entering just after it, so two slides never share the frame.
 */
function slideVisibility(k, p) {
  const start = k / SLIDES;
  const end = (k + 1) / SLIDES;
  const enter = k === 0 ? 1 : smoothstep(range(p, start + 0.004, start + 0.042));
  const leave = k === SLIDES - 1 ? 0 : smoothstep(range(p, end - 0.042, end - 0.004));
  return [enter, leave];
}

function Sectors() {
  const trackRef = useRef(null);
  const stageRef = useRef(null);
  const slideRefs = useRef([]);
  const cache = useRef([]);
  const activeRef = useRef(-1);
  const [active, setActive] = useState(-1);

  const onProgress = useCallback((p) => {
    stageRef.current?.style.setProperty('--p', p.toFixed(4));
    slideRefs.current.forEach((el, k) => {
      if (!el) return;
      const [enter, leave] = slideVisibility(k, p);
      const key = `${enter.toFixed(3)}|${leave.toFixed(3)}`;
      if (cache.current[k] === key) return;
      cache.current[k] = key;
      el.style.setProperty('--in', enter.toFixed(3));
      el.style.setProperty('--out', leave.toFixed(3));
      el.toggleAttribute('data-hidden', enter === 0 || leave === 1);
    });
    const index = Math.min(SECTORS.length - 1, Math.floor(p * SLIDES) - 1);
    if (index !== activeRef.current) {
      activeRef.current = index;
      setActive(index);
    }
  }, []);

  const slide = (k) => (el) => {
    slideRefs.current[k] = el;
  };

  return (
    <section
      ref={trackRef}
      className="gases-story"
      data-theme="light"
      aria-labelledby="gases-sectors-title"
      style={{ '--slides': SLIDES }}
    >
      <div ref={stageRef} className="gases-story__stage">
        <ScrollVideo
          src="/assets/video2.mp4"
          trackRef={trackRef}
          onProgress={onProgress}
          preload="idle"
          smoothing={6}
          className="gases-story__video"
        />
        <div className="gases-story__shade" aria-hidden="true" />

        <div className="gases-story__frame">
          {/* Stays in the corner once the intro has made way for the sectors. */}
          <div className="gases-story__kicker" aria-hidden="true">
            <p className="eyebrow">
              <span className="eyebrow__index">03</span>
              Setores atendidos
            </p>
            <p className="gases-story__kicker-title">{page.sectors.title}</p>
          </div>

          <div className="gases-story__slides">
            <div ref={slide(0)} className="story-slide story-slide--intro">
              <p className="eyebrow story-slide__eyebrow">
                <span className="eyebrow__index">03</span>
                Setores
              </p>
              <h2 className="story-slide__title" id="gases-sectors-title">
                {page.sectors.title}
              </h2>
              <p className="story-slide__text">{page.sectors.lead}</p>
            </div>

            {SECTORS.map((s, i) => (
              <div key={s.title} ref={slide(i + 1)} className="story-slide">
                <p className="story-slide__index">
                  <span className="story-slide__number">{pad(i + 1)}</span>
                  <span className="story-slide__of">/ {pad(SECTORS.length)}</span>
                </p>
                <h3 className="story-slide__title">{s.title}</h3>
                <p className="story-slide__text">{s.text}</p>
              </div>
            ))}
          </div>

          <ol className="gases-story__index" aria-hidden="true">
            {SECTORS.map((s, i) => (
              <li key={s.title} data-state={storyState(i, active)}>
                <span>{pad(i + 1)}</span>
                {s.title}
              </li>
            ))}
          </ol>

          <ol className="gases-story__progress" aria-hidden="true">
            {SECTORS.map((s, i) => (
              <li key={s.title} style={{ '--i': i + 1 }}>
                <span />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Differentials() {
  const { differentials, cta } = page;
  return (
    <section className="gases-diff" data-theme="light" aria-labelledby="gases-diff-title">
      <div className="container gases-why__grid">
        <SectionHeading id="gases-diff-title" index="04" eyebrow="Por que a LWN" title={differentials.title} />
        <div className="gases-why__body">
          {differentials.paragraphs.map((p) => (
            <Reveal as="p" key={p.slice(0, 24)}>
              {p}
            </Reveal>
          ))}
          <Reveal>
            <Link to={{ pathname: '/', hash: '#sobre' }} className="service__link">
              Saiba mais sobre a LWN
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </div>

      <div className="container">
        <Reveal className="gases-cta">
          <div>
            <h2>{cta.title}</h2>
            <p>{cta.text}</p>
            <p className="gases-cta__contact">
              <a href={company.phoneHref}>{company.phoneDisplay}</a>
              <span aria-hidden="true">·</span>
              <a href={`mailto:${company.email}`}>{company.email}</a>
            </p>
          </div>
          <Link to={{ pathname: '/', hash: '#contato' }} className="button button--light">
            Solicite sua certificação
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/** Vertical reading-progress rail pinned to the right edge; fills top to bottom with the page scroll. */
function PageProgress() {
  const ref = useRef(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? clamp(window.scrollY / max) : 0;
      ref.current?.style.setProperty('--progress', progress.toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <div ref={ref} className="page-progress" aria-hidden="true">
      <span className="page-progress__fill" />
      <span className="page-progress__head" />
    </div>
  );
}

export default function GasesPage() {
  useDocumentTitle('Certificação e qualificação de gases');

  return (
    <div className="gases-page">
      <PageProgress />
      <Hero />
      <Why />
      <Analyses />
      <Sectors />
      <Differentials />
    </div>
  );
}
