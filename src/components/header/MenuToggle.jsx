export default function MenuToggle({ open, onToggle, ref }) {
  return (
    <button
      ref={ref}
      type="button"
      className="menu-toggle"
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? 'Fechar menu' : 'Abrir menu'}
      onClick={onToggle}
    >
      <span className="menu-toggle__line" />
      <span className="menu-toggle__line" />
    </button>
  );
}
