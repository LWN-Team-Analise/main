import { ArrowUpRight, MapPin } from 'lucide-react';
import { offices } from '../../data/site';
import Reveal from '../ui/Reveal';
import './Locations.css';

const officeState = (i, step) => (i === step.active ? 'active' : i < step.reached ? 'past' : 'next');

/**
 * "Onde encontrar o Grupo LWN". A scroll track with the copy pinned on the
 * left; the shared globe (GeoStory) flies world → Brazil → each office while
 * `step` marks the office it has reached.
 */
export default function Locations({ ref, step }) {
  return (
    <section ref={ref} className="locations" data-theme="light" aria-labelledby="unidades-title">
      <div className="locations__stage">
        <div className="locations__main">
          <Reveal className="locations__copy">
            <p className="eyebrow">
              <span className="eyebrow__index">05</span>
              Presença
            </p>
            <h2 className="locations__title" id="unidades-title">
              Onde encontrar o Grupo LWN
            </h2>
            <p className="locations__text">
              Com bases estratégicas em São Paulo, Barueri e Anápolis, atendemos com excelência em qualquer lugar do
              Brasil.
            </p>
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
                  aria-label={`Ver ${office.city} no Google Maps (abre em nova aba)`}
                >
                  <MapPin size={15} aria-hidden="true" />
                  <span className="office__map-label">Mapa</span>
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
