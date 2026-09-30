import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { LANGUAGES, setLanguage, useLanguage } from '../../i18n/language';
import { useStrings } from '../../i18n/strings';
import './LanguageSelect.css';

// Small flags drawn inline (emoji flags show as letters on Windows).
function FlagBrazil() {
  return (
    <svg className="lang-flag" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
      <rect width="20" height="14" fill="#009c3b" />
      <path d="M10 1.7 18.2 7 10 12.3 1.8 7z" fill="#ffdf00" />
      <circle cx="10" cy="7" r="3.25" fill="#002776" />
      <path d="M6.9 6.2c2-.5 4.3-.2 6.1.9" fill="none" stroke="#fff" strokeWidth="0.7" />
    </svg>
  );
}

function FlagUnitedStates() {
  return (
    <svg className="lang-flag" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
      <rect width="20" height="14" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={i * (14 / 13)} width="20" height={14 / 13} fill="#b22234" />
      ))}
      <rect width="8.6" height={(14 / 13) * 7} fill="#3c3b6e" />
      {[1.4, 3.6, 5.8].map((y) =>
        [1.4, 3.6, 5.8, 8 - 0.6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.45" fill="#fff" />),
      )}
    </svg>
  );
}

const FLAGS = { pt: FlagBrazil, en: FlagUnitedStates };

/**
 * Language switch next to the theme toggle: the current flag and code with a
 * small chevron; it opens a two-item menu (Português / English), the current
 * one checked. Closes on choice, on Escape, or on a click anywhere else.
 */
export default function LanguageSelect() {
  const lang = useLanguage();
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const current = LANGUAGES.find((l) => l.code === lang);
  const Flag = FLAGS[lang];

  useEffect(() => {
    if (!open) return undefined;
    // Keyboard focus starts on the current language.
    itemRefs.current[LANGUAGES.findIndex((l) => l.code === lang)]?.focus();
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, lang]);

  const choose = (code) => {
    setLanguage(code);
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Up / down move between the two options.
  const onMenuKey = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = itemRefs.current;
    const at = items.indexOf(document.activeElement);
    const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className="lang-select" data-open={open || undefined}>
      <button
        ref={buttonRef}
        type="button"
        className="lang-select__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t.header.changeLanguage(current.name)}
        title={t.header.language}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag />
        <span className="lang-select__code">{lang.toUpperCase()}</span>
        <ChevronDown className="lang-select__chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open && (
        <ul id={menuId} className="lang-select__menu" role="menu" aria-label={t.header.language} onKeyDown={onMenuKey}>
          {LANGUAGES.map(({ code, name }, i) => {
            const ItemFlag = FLAGS[code];
            const selected = code === lang;
            return (
              <li key={code} role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  lang={code === 'pt' ? 'pt-BR' : 'en'}
                  className="lang-select__option"
                  onClick={() => choose(code)}
                >
                  <ItemFlag />
                  <span>{name}</span>
                  {selected && <Check className="lang-select__check" size={16} strokeWidth={2.4} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
