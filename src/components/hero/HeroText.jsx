import { ArrowRight } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import './HeroText.css';

/** The headline with its two service families emphasised. */
function useHeadline(hero) {
  return useMemo(() => {
    const pattern = new RegExp(`(${hero.emphasis.join('|')})`);
    return hero.headline
      .split(pattern)
      .map((part) => (hero.emphasis.includes(part) ? <em key={part}>{part}</em> : part));
  }, [hero]);
}

/**
 * Headline, description and calls to action — all on screen from the start
 * (the scroll reveals only the sections that follow the hero).
 */
export default function HeroText() {
  const { hero } = useSite();
  const t = useStrings();
  const headline = useHeadline(hero);

  return (
    <div className="hero-text">
      <div className="hero-text__primary">
        <p className="hero-text__eyebrow">
          <span className="hero-text__eyebrow-mark" aria-hidden="true" />
          {hero.eyebrow}
        </p>
        <h1 className="hero-text__headline">{headline}</h1>
      </div>

      <div className="hero-text__secondary">
        <p className="hero-text__description">
          {hero.description.map(({ text, strong }, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              {strong ? <strong className="hero-text__strong">{text}</strong> : text}
            </Fragment>
          ))}
        </p>

        <div className="hero-text__actions">
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
