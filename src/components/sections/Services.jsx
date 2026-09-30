import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import Reveal from '../ui/Reveal';
import SectionHeading from '../ui/SectionHeading';
import './Services.css';

function ServiceGroup({ group, index }) {
  const t = useStrings();
  return (
    <article className="service" aria-labelledby={`servico-${group.id}`}>
      <Reveal className="service__head">
        <span className="service__index">{String(index + 1).padStart(2, '0')}</span>
        <h3 className="service__title" id={`servico-${group.id}`}>
          {group.title}
        </h3>
        <p className="service__summary">{group.summary}</p>

        {group.norms && (
          <ul className="service__norms" aria-label={t.services.norms}>
            {group.norms.map((norm) => (
              <li key={norm}>{norm}</li>
            ))}
          </ul>
        )}
        {group.link && (
          <Link className="service__link" to={group.link.route}>
            {group.link.label}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </Reveal>

      <div className="service__body">
        {group.gases && (
          <Reveal className="service__gases" delay={0.05}>
            <p className="service__caption">{t.services.gases}</p>
            <ul>
              {group.gases.map((gas) => (
                <li key={gas}>{gas}</li>
              ))}
            </ul>
          </Reveal>
        )}

        <ol className="service__items">
          {group.items.map((item, i) => (
            <Reveal as="li" key={i} className="service__item" delay={0.04 * i}>
              <span className="service__item-index">
                {String(index + 1).padStart(2, '0')}.{i + 1}
              </span>
              <div>
                <h4 className="service__item-title">{item.title}</h4>
                {item.text && <p className="service__item-text">{item.text}</p>}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </article>
  );
}

export default function Services() {
  const { services } = useSite();
  const t = useStrings();
  return (
    <section id="servicos" className="services" data-theme="light" aria-labelledby="servicos-title">
      <div className="container">
        <SectionHeading
          id="servicos-title"
          index="04"
          eyebrow={t.services.eyebrow}
          title={t.services.title}
          lead={services.intro}
        />

        <div className="services__list">
          {services.groups.map((group, i) => (
            <ServiceGroup key={group.id} group={group} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
