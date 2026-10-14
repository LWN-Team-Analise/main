import { useTheme } from '@/context/ThemeContext'
import usePointerGlow from '@/hooks/usePointerGlow'
import './ThemeToggle.css'

const MoonIcon = () => (
  <svg className="toggle__icon toggle__icon--moon" viewBox="0 0 24 24" width="19" height="19">
    <path
      fill="currentColor"
      d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a.8.8 0 0 0-1.1-.9A9.9 9.9 0 1 0 21.3 15.7a.8.8 0 0 0-.9-1.1Z"
    />
  </svg>
)

const SunIcon = () => (
  <svg
    className="toggle__icon toggle__icon--sun"
    viewBox="0 0 24 24"
    width="19"
    height="19"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5" />
  </svg>
)

/** Botao lua/sol no canto superior direito — fundo em liquid glass. */
export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()
  const { ref, onPointerMove, onPointerLeave } = usePointerGlow()

  return (
    <button
      ref={ref}
      type="button"
      className="toggle"
      onClick={toggleTheme}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      aria-pressed={isDark}
      aria-label={isDark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      <span className="toggle__sheen" aria-hidden="true" />
      <span className="toggle__edge" aria-hidden="true" />
      <span className="toggle__icons" aria-hidden="true">
        <MoonIcon />
        <SunIcon />
      </span>
    </button>
  )
}
