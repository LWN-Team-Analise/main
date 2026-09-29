import { motion } from 'framer-motion';
import { navLinks } from '../../data/site';
import NavItem from './NavItem';

export default function Navigation({ activeId, className = '' }) {
  return (
    <nav className={`nav ${className}`.trim()} aria-label="Navegação principal">
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
      </ul>
    </nav>
  );
}
