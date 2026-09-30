import { ArrowUpRight, MapPin } from 'lucide-react';
import { offices } from '../../data/site';
import { useStrings } from '../../i18n/strings';
import Reveal from '../ui/Reveal';
import './Locations.css';

const officeState = (i, step) => (i === step.active ? 'active' : i < step.reached ? 'past' : 'next');

/**
 * "Onde encontrar o Grupo LWN". A scroll track with the copy pinned on the
 * left; the shared globe (GeoStory) flies world → Brazil → each office while
 * `step` marks the office it has reached.
 */
export default function Locations({ ref, step }) {
  const t = useStrings();
  return (
    <section ref={ref} className="locations" data-theme="light" aria-labelledby="unidades-title">
      <div className="locations__stage">
        <div className="locations__main">
          <Reveal className="locations__copy">
            <p className="eyebrow">
              <span className="eyebrow__index">05</span>
              {t.locations.eyebrow}
            </p>
            <h2 className="locations__title" id="unidades-title">
              {t.locations.title}
            </h2>
            <p className="locations__text">{t.locations.text}</p>
          </Reveal>

          <ol className="locations__list">
            {offices.map((office, i) => (
              <li key={office.id} className="office" data-state={officeState(i, step)}>
                <span className="office__index">{String(i + 1).padStart(2, '0')}</span>
                <div className="office__body">
                  <h3 className="office__city">{office.city}</h3>
                  <address className="office__address">
                    {office.street}
                    <br />
                    {office.region} · {office.zip}
                  </address>
                </div>
                <a
                  className="office__map"
                  href={office.map}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.locations.mapLabel(office.city)}
                >
                  <MapPin size={15} aria-hidden="true" />
                  <span className="office__map-label">{t.locations.map}</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
