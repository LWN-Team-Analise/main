import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Phone } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { company, navLinks } from '../../data/site';
import NavItem from './NavItem';
import SocialLinks from './SocialLinks';

const EASE = [0.22, 1, 0.36, 1];

export default function MobileMenu({ open, activeId, onClose }) {
  const firstLinkRef = useRef(null);

  useEffect(() => {
    if (open) firstLinkRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="mobile-menu__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            key="panel"
            id="mobile-menu"
            className="mobile-menu glass"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.985 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <nav aria-label="Navegação móvel">
              <ul className="mobile-menu__list">
                {navLinks.map((item, i) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.035, duration: 0.3, ease: EASE }}
                  >
                    <NavItem
                      ref={i === 0 ? firstLinkRef : undefined}
                      item={item}
                      className="mobile-menu__link"
                      aria-current={activeId === item.id ? 'page' : undefined}
                      onNavigate={onClose}
                    >
                      <span className="mobile-menu__index">{String(i + 1).padStart(2, '0')}</span>
                      <span className="mobile-menu__label">{item.label}</span>
                      <ArrowUpRight className="mobile-menu__arrow" size={18} aria-hidden="true" />
                    </NavItem>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <div className="mobile-menu__footer">
              <SocialLinks size={20} />
              <a className="mobile-menu__phone" href={company.phoneHref}>
                <Phone size={16} aria-hidden="true" />
                {company.phoneDisplay}
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
