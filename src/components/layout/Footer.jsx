import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { company, credit, offices, privacyPath } from '../../data/site';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import NavItem from '../header/NavItem';
import SocialLinks from '../header/SocialLinks';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();
  const { navLinks } = useSite();
  const t = useStrings();

  return (
    <footer className="footer" data-theme="light">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            {/* The brand-coloured logo; the white one only in the dark scheme (as in the header). */}
            <Link to="/" className="footer__home" aria-label={t.header.home}>
              <img
                src="/assets/LogoLWN.png"
                alt="LWN Engenharia"
                width="848"
                height="294"
                className="footer__logo footer__logo--color"
                loading="lazy"
              />
              <img
                src="/assets/LogoLWNWhite.png"
                alt=""
                aria-hidden="true"
                width="848"
                height="294"
                className="footer__logo footer__logo--white"
                loading="lazy"
              />
            </Link>
            <p className="footer__about">{t.footer.about}</p>
            <SocialLinks tone="dark" />
          </div>

          <nav className="footer__col" aria-label={t.footer.label}>
            <p className="footer__title">{t.footer.navigation}</p>
            <ul>
              {navLinks.map((item) => (
                <li key={item.id}>
                  <NavItem item={item} />
                </li>
              ))}
              <li>
                <Link to="/clientes">{t.footer.allClients}</Link>
              </li>
            </ul>
          </nav>

          <div className="footer__col">
            <p className="footer__title">{t.footer.contact}</p>
            <ul>
              <li>
                <a href={company.phoneHref}>{company.phoneDisplay}</a>
              </li>
              <li>
                <a href={`mailto:${company.email}`}>{company.email}</a>
              </li>
              <li>
                <Link to="/gases">{t.footer.gases}</Link>
              </li>
              <li>
                <a href={company.googleReview} target="_blank" rel="noopener noreferrer" className="footer__review">
                  <Star size={14} aria-hidden="true" />
                  {t.footer.review}
                </a>
              </li>
            </ul>
          </div>

          <div className="footer__col">
            <p className="footer__title">{t.footer.offices}</p>
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
            © {year} {company.fullName}. {t.footer.rights}
          </p>
          <Link to={privacyPath} className="footer__legal">
            {t.footer.privacy}
          </Link>
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
