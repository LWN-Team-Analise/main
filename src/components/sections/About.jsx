import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import Counter from '../ui/Counter';
import Reveal from '../ui/Reveal';
import './About.css';

function ParallaxFigure() {
  const ref = useRef(null);
  const t = useStrings();
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-9%', '9%']);

  return (
    <figure ref={ref} className="about__figure">
      <motion.img
        src="/assets/hero/hero-laboratorio.webp"
        alt={t.about.figureAlt}
        width="960"
        height="636"
        loading="lazy"
        style={{ y }}
      />
      <figcaption className="about__figure-tag">{t.about.since}</figcaption>
    </figure>
  );
}

export default function About() {
  const { about } = useSite();
  const t = useStrings();
  const [lead, ...rest] = about.paragraphs;

  return (
    <section id="sobre" className="about" data-theme="light" aria-labelledby="sobre-title">
      <div className="container about__grid">
        <div className="about__aside">
          <Reveal>
            <p className="eyebrow">
              <span className="eyebrow__index">01</span>
              {about.eyebrow}
            </p>
            <h2 className="about__title" id="sobre-title">
              {about.title}
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <ParallaxFigure />
          </Reveal>
        </div>

        <div className="about__body">
          <Reveal as="p" className="about__lead">
            {lead}
          </Reveal>

          <Reveal as="ol" className="timeline" delay={0.05}>
            {about.timeline.map((item) => (
              <li key={item.when} className="timeline__item">
                <span className="timeline__when">{item.when}</span>
                <span className="timeline__what">{item.what}</span>
              </li>
            ))}
          </Reveal>

          {rest.map((paragraph, i) => (
            <Reveal key={i} as="p" className="about__text" delay={0.04}>
              {paragraph}
            </Reveal>
          ))}
        </div>
      </div>

      {/* Key numbers: the closing part of "Quem somos", on the same background. */}
      <div className="stats-band">
        <div className="container">
          <Reveal as="p" className="stats__caption">
            {t.about.numbers}
          </Reveal>
          <ul className="stats" aria-label={t.about.numbers}>
            {about.stats.map((stat, i) => (
              <Reveal as="li" key={stat.value + '-' + i} className="stat" delay={0.06 * i}>
                <span className="stat__value">
                  <span className="stat__plus" aria-hidden="true">
                    +
                  </span>
                  <Counter value={stat.value} grouped={false} />
                </span>
                <span className="stat__label">
                  {stat.label[0]}
                  <br />
                  {stat.label[1]}
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
