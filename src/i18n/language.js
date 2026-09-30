import { useSyncExternalStore } from 'react';

// The site language lives on <html data-lang> (and <html lang>), like the colour
// scheme: index.html sets it before first paint from localStorage, so the page
// never flashes in the wrong language. Portuguese is the default.
const STORAGE_KEY = 'lwn-language';
const HTML_LANG = { pt: 'pt-BR', en: 'en' };
const listeners = new Set();

/** The two languages the site is written in, in the order the selector lists them. */
export const LANGUAGES = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'English' },
];

const read = () => (document.documentElement.dataset.lang === 'en' ? 'en' : 'pt');

/** Switches the whole site to `lang` ('pt' | 'en') and remembers the choice. */
export function setLanguage(lang) {
  const code = lang === 'en' ? 'en' : 'pt';
  const root = document.documentElement;
  root.dataset.lang = code;
  root.lang = HTML_LANG[code];
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* private mode: the choice simply isn't remembered */
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The current language code: 'pt' or 'en'. */
export function useLanguage() {
  return useSyncExternalStore(subscribe, read, () => 'pt');
}
