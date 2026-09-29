import { commitment } from '../../data/site';
import Reveal from '../ui/Reveal';
import './Commitment.css';

export default function Commitment() {
  return (
    <section className="commitment" data-theme="dark" aria-labelledby="compromisso-title">
      <div className="container">
        <Reveal>
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__index">02</span>
            Cultura
          </p>
          <h2 className="commitment__title" id="compromisso-title">
            {commitment.title}
          </h2>
        </Reveal>

        <ol className="commitment__pillars">
          {commitment.pillars.map((pillar, i) => (
            <Reveal as="li" key={pillar} className="commitment__pillar" delay={i * 0.08}>
              <span className="commitment__index">{String(i + 1).padStart(2, '0')}</span>
              <span className="commitment__word">{pillar}</span>
            </Reveal>
          ))}
        </ol>

        <div className="commitment__body">
          {commitment.paragraphs.map((text, i) => (
            <Reveal as="p" key={i} delay={0.06 * i}>
              {text}
            </Reveal>
          ))}
          <Reveal className="commitment__tags" delay={0.12}>
            <span className="commitment__tag commitment__tag--strong">ANVISA</span>
            <span className="commitment__tag">Normas internacionais</span>
            {commitment.sectors.map((sector) => (
              <span key={sector} className="commitment__tag">
                Setor {sector.toLowerCase()}
              </span>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
