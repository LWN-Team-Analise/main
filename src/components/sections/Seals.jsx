import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import Reveal from '../ui/Reveal';
import './Seals.css';

export default function Seals() {
  const { seals } = useSite();
  const t = useStrings();
  return (
    <section className="seals" data-theme="light" aria-labelledby="selos-title">
      <div className="container seals__grid">
        <Reveal className="seals__head">
          <p className="eyebrow">
            <span className="eyebrow__index">08</span>
            {t.seals.eyebrow}
          </p>
          <h2 className="seals__title" id="selos-title">
            {t.seals.title}
          </h2>
        </Reveal>

        <ul className="seals__list">
          {seals.map((seal, i) => (
            <Reveal as="li" key={seal.image} className="seal" delay={i * 0.08}>
              <div className="seal__badge">
                <img
                  className="seal__image"
                  src={seal.image}
                  alt={seal.title}
                  width="320"
                  height="320"
                  loading="lazy"
                  decoding="async"
                />
                <span className="seal__shadow" aria-hidden="true" />
              </div>
              <h3 className="seal__title">{seal.title}</h3>
              <p className="seal__text">{seal.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
