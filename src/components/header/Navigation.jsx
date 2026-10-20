import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { corePath } from '../../data/site';
import { useSite } from '../../i18n/content';
import { useStrings } from '../../i18n/strings';
import NavItem from './NavItem';

export default function Navigation({ activeId, className = '' }) {
  const { navLinks } = useSite();
  const t = useStrings();
  return (
    <nav className={`nav ${className}`.trim()} aria-label={t.header.mainNav}>
      <ul className="nav__list">
        {navLinks.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <NavItem item={item} className="nav__link" aria-current={active ? 'page' : undefined}>
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="nav__indicator"
                    transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                  />
                )}
                <span className="nav__label">{item.label}</span>
              </NavItem>
            </li>
          );
        })}
        {/* The employees' area: another app on this domain, so a full page load. */}
        <li className="nav__team-item">
          <a href={corePath} className="nav__team">
            <Users size={16} aria-hidden="true" />
            {t.header.team}
          </a>
        </li>
      </ul>
    </nav>
  );
}
