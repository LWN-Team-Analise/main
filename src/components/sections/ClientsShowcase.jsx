import { useInView } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CLIENT_CATEGORIES } from '../../data/clients';
import { ROUTE } from '../../data/serviceRoute';
import { clientsIntro } from '../../data/site';
import ClientLogo from '../clients/ClientLogo';
import Marquee from '../ui/Marquee';
import Reveal from '../ui/Reveal';
import './ClientsShowcase.css';

// Every client once (some appear in two categories on the original site),
// interleaved across categories so each row mixes sectors.
const ALL = (() => {
  const queues = CLIENT_CATEGORIES.map((c) => [...c.logos]);
  const seen = new Set();
  const out = [];
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      const id = q.shift();
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
})();
const ROWS = [ALL.filter((_, i) => i % 2 === 0), ALL.filter((_, i) => i % 2 === 1)];
const pad = (n) => String(n).padStart(2, '0');

/**
 * Clientes. A scroll track with a pinned stage: the shared globe (GeoStory)
 * starts again from the world view and flies to each state LWN serves, drawing
 * the route between them (reversed when scrolling up); `step` is where it is.
 * Copy, route and the logo wall share the stage.
 */
export default function ClientsShowcase({ ref, step }) {
  // ~90 logos: only fetch them once the section is getting close.
  const near = useInView(ref, { once: true, margin: '900px 0px' });

  const current = step.active >= 0 ? ROUTE[step.active] : null;
  const heading = current ? current.name : step.overview ? 'Rede de atendimento' : 'Brasil';

  return (
    <section ref={ref} id="clientes" className="clients" data-theme="light" aria-labelledby="clientes-title">
      <div className="clients__stage">
        <div className="clients__main">
          <Reveal className="clients__copy">
            <p className="eyebrow">
              <span className="eyebrow__index">06</span>
              Clientes
            </p>
            <h2 className="clients__title" id="clientes-title">
              {clientsIntro.title}
            </h2>
            <p className="clients__text">{clientsIntro.text}</p>
          </Reveal>

          <div className="clients__route" aria-hidden="true">
            <p className="clients__route-label">Atuação nacional</p>
            <p className="clients__route-current" key={heading}>
              <span>{current ? `${pad(step.active + 1)} / ${pad(ROUTE.length)}` : `${pad(ROUTE.length)} estados`}</span>
              {heading}
            </p>
            <ol className="globe-route">
              {ROUTE.map((stop, i) => (
                <li
                  key={stop.uf}
                  data-state={i === step.active ? 'active' : i < step.reached ? 'past' : 'next'}
                  title={stop.name}
                >
                  {stop.uf}
                </li>
              ))}
            </ol>
          </div>

          <div className="clients__foot">
            <span className="clients__count">
              <strong>{ALL.length}</strong> empresas em {CLIENT_CATEGORIES.length} setores
            </span>
            <Link to="/clientes" className="button button--dark">
              Ver todos os clientes
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Same width as the header bar: the logos never run to the screen edges. */}
        <div className="clients__wall">
          {near && (
            <>
              <Marquee speed={34} label="Logotipos de clientes da LWN Engenharia">
                {ROWS[0].map((id) => (
                  <ClientLogo key={id} id={id} area={2600} max={38} lazy={false} />
                ))}
              </Marquee>
              <Marquee speed={28} reverse className="clients__wall-second">
                {ROWS[1].map((id) => (
                  <ClientLogo key={id} id={id} area={2600} max={38} lazy={false} />
                ))}
              </Marquee>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
