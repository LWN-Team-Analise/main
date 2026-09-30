import { FaFacebook, FaInstagram, FaLinkedin, FaWhatsapp, FaYoutube } from 'react-icons/fa6';
import { socialLinks } from '../../data/site';
import { useStrings } from '../../i18n/strings';
import './SocialLinks.css';

const ICONS = {
  linkedin: FaLinkedin,
  instagram: FaInstagram,
  facebook: FaFacebook,
  youtube: FaYoutube,
  whatsapp: FaWhatsapp,
};

export default function SocialLinks({ className = '', size = 20, tone = 'dark' }) {
  const t = useStrings();
  return (
    <ul className={`social-links social-links--${tone} ${className}`.trim()}>
      {socialLinks.map(({ id, label, href }) => {
        const Icon = ICONS[id];
        return (
          <li key={id}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="social-links__link"
              aria-label={`${label} ${t.site.newTab}`}
              title={label}
            >
              <Icon size={size} aria-hidden="true" focusable="false" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
