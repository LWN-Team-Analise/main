import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { company, credit, navLinks, offices } from '../../data/site';
import NavItem from '../header/NavItem';
import SocialLinks from '../header/SocialLinks';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" data-theme="dark">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link to="/" aria-label="LWN Engenharia — página inicial">
              <img src="/assets/LogoLWNWhite.png" alt="LWN Engenharia" width="848" height="294" className="footer__logo" loading="lazy" />
            </Link>
            <p className="footer__about">
              Especialista em qualificação e certificação de salas limpas, Smoke Test, Gases Medicinais e Sistemas HVAC-R.
            </p>
            <SocialLinks tone="light" />
          </div>

          <nav className="footer__col" aria-label="Rodapé">
            <p className="footer__title">Navegação</p>
            <ul>
              {navLinks.map((item) => (
                <li key={item.id}>
                  <NavItem item={item} />
                </li>
              ))}
              <li>
                <Link to="/clientes">Todos os clientes</Link>
              </li>
            </ul>
          </nav>

          <div className="footer__col">
            <p className="footer__title">Contato</p>
            <ul>
              <li>
                <a href={company.phoneHref}>{company.phoneDisplay}</a>
              </li>
              <li>
                <a href={`mailto:${company.email}`}>{company.email}</a>
              </li>
              <li>
                <Link to="/gases">Certificação e qualificação de gases</Link>
              </li>
              <li>
                <a href={company.googleReview} target="_blank" rel="noopener noreferrer" className="footer__review">
                  <Star size={14} aria-hidden="true" />
                  Avalie-nos no Google
                </a>
              </li>
            </ul>
          </div>

          <div className="footer__col">
            <p className="footer__title">Unidades</p>
            <ul className="footer__offices">
              {offices.map((office) => (
                <li key={office.id}>
                  <a href={office.map} target="_blank" rel="noopener noreferrer">
                    <strong>{office.city}</strong>
                    <span>
                      {office.street} · {office.zip}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p>
            © {year} {company.fullName}. Todos os direitos reservados.
          </p>
          <p className="footer__credit">
            created by{' '}
            <a href={credit.href} target="_blank" rel="noopener noreferrer">
              {credit.label}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
