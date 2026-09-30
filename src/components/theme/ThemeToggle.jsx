import { Moon, Sun } from 'lucide-react';
import { setColorScheme, useColorScheme } from '../../hooks/useColorScheme';
import { useStrings } from '../../i18n/strings';
import './ThemeToggle.css';

export default function ThemeToggle({ className = '' }) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const t = useStrings();
  const label = dark ? t.header.lightMode : t.header.darkMode;

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={() => setColorScheme(dark ? 'light' : 'dark')}
      aria-label={label}
      aria-pressed={dark}
      title={label}
    >
      <Sun className="theme-toggle__icon theme-toggle__icon--sun" size={19} aria-hidden="true" />
      <Moon className="theme-toggle__icon theme-toggle__icon--moon" size={18} aria-hidden="true" />
    </button>
  );
}
