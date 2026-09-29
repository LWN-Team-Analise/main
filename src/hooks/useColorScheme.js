import { useSyncExternalStore } from 'react';

// The site-wide colour scheme lives on <html data-scheme>. index.html sets it
// before first paint (from localStorage) so there is never a flash of the wrong
// theme. Light is the default: only an explicit, saved choice turns dark on.
const STORAGE_KEY = 'lwn-color-scheme';
const listeners = new Set();
let switchTimer = 0;

const read = () => (document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light');

/**
 * Switches the theme. Colours ease across quietly (see dark.css); the visible
 * gesture is the sun ↔ moon swap on the toggle itself.
 */
export function setColorScheme(scheme) {
  const root = document.documentElement;
  root.classList.add('is-theme-switching');
  root.dataset.scheme = scheme;
  try {
    localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    /* private mode: the choice simply isn't remembered */
  }
  listeners.forEach((fn) => fn());
  window.clearTimeout(switchTimer);
  switchTimer = window.setTimeout(() => root.classList.remove('is-theme-switching'), 450);
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useColorScheme() {
  return useSyncExternalStore(subscribe, read, () => 'light');
}
