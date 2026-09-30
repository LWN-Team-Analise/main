import { useStrings } from '../../i18n/strings';

export default function MenuToggle({ open, onToggle, ref }) {
  const t = useStrings();
  return (
    <button
      ref={ref}
      type="button"
      className="menu-toggle"
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? t.header.closeMenu : t.header.openMenu}
      onClick={onToggle}
    >
      <span className="menu-toggle__line" />
      <span className="menu-toggle__line" />
    </button>
  );
}
