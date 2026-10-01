import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { navLinks } from '../../data/site';
import { useStrings } from '../../i18n/strings';
import { useActiveSection } from '../../hooks/useActiveSection';
import { useHeaderTheme } from '../../hooks/useHeaderTheme';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import LanguageSelect from './LanguageSelect';
import LiquidGlassFilter, { supportsLiquidGlass } from './LiquidGlassFilter';
import MenuToggle from './MenuToggle';
import MobileMenu from './MobileMenu';
import Navigation from './Navigation';
import SocialLinks from './SocialLinks';
import ThemeToggle from '../theme/ThemeToggle';
import './Header.css';

const SECTION_IDS = navLinks.filter((l) => l.section).map((l) => l.section);

export default function Header() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1100px)');
  const barRef = useRef(null);
  const toggleRef = useRef(null);
  const liquid = useMemo(supportsLiquidGlass, []);
  const t = useStrings();

  const activeSection = useActiveSection(SECTION_IDS, pathname);
  // The glass is always dark, in either colour scheme; what sits behind the
  // bar only tunes how opaque it gets (`data-over`).
  const behind = useHeaderTheme(40, [pathname]);
  // Home sections light up as they scroll by; other pages mark their own entry (or none).
  let activeId = pathname === '/' ? activeSection : null;
  if (pathname.startsWith('/blog')) activeId = 'blog';
  else if (pathname.startsWith('/clientes')) activeId = 'clientes';
  else if (pathname.startsWith('/gases')) activeId = 'servicos';

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The full navigation takes over on wide screens, so the drawer must not linger.
  if (isDesktop && open) setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('is-scroll-locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('is-scroll-locked');
    };
  }, [open]);

  return (
    <header
      className="site-header"
      data-over={behind}
      data-scrolled={scrolled || undefined}
      data-open={open || undefined}
    >
      {liquid && <LiquidGlassFilter target={barRef} />}
      <div ref={barRef} className={`site-header__bar glass${liquid ? ' glass--liquid' : ''}`}>
        <Link to="/" className="site-header__brand" aria-label={t.header.home} onClick={close}>
          <img
            src="/assets/logo-mark.png"
            alt="LWN Engenharia"
            width="170"
            height="160"
            className="site-header__logo"
            fetchPriority="high"
          />
        </Link>

        <Navigation activeId={activeId} className="site-header__nav" />

        <div className="site-header__end">
          <SocialLinks className="site-header__social" tone="auto" />
          <span className="site-header__divider" aria-hidden="true" />
          <ThemeToggle />
          <LanguageSelect />
          <MenuToggle ref={toggleRef} open={open} onToggle={() => setOpen((v) => !v)} />
        </div>
      </div>

      <MobileMenu open={open} activeId={activeId} onClose={close} />
    </header>
  );
}
