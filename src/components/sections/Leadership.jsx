import { FaLinkedinIn } from 'react-icons/fa6';
import { leaderPhoto } from '../../data/site';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import Reveal from '../ui/Reveal';
import './Leadership.css';

export default function Leadership() {
  const { leaders } = useSite();
  const t = useStrings();
  return (
    <section className="leaders" data-theme="light" aria-labelledby="lideres-title">
      <div className="container">
        <ul className="leaders__grid">
          <li className="leaders__intro">
            <Reveal>
              <p className="eyebrow">
                <span className="eyebrow__index">03</span>
                {t.leaders.eyebrow}
              </p>
              <h2 className="leaders__title" id="lideres-title">
                {t.leaders.title}
              </h2>
            </Reveal>
          </li>

          {leaders.map((leader, i) => (
            <Reveal as="li" key={leader.name} className="leader" delay={(i % 4) * 0.07}>
              <div className="leader__photo">
                <img
                  src={leaderPhoto(leader.photo, 720)}
                  srcSet={`${leaderPhoto(leader.photo, 360)} 360w, ${leaderPhoto(leader.photo, 720)} 720w`}
                  sizes="(max-width: 599px) 50vw, (max-width: 1099px) 33vw, 290px"
                  alt={t.leaders.photoAlt(leader.name, leader.role)}
                  width="720"
                  height="720"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="leader__meta">
                <div>
                  <h3 className="leader__name">{leader.name}</h3>
                  <p className="leader__role">{leader.role}</p>
                </div>
                {leader.linkedin && (
                  <a
                    className="leader__link"
                    href={leader.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.leaders.linkedin(leader.name)}
                  >
                    <FaLinkedinIn size={15} aria-hidden="true" />
                  </a>
                )}
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
