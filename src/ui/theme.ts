import { THEME_KEY, storageGet, storageSet } from '../core/storage';

export type Theme = 'light' | 'dark';

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

/** The theme the user picked with the header button, or null while the app follows the system. */
function chosen(): Theme | null {
  const saved = storageGet(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

export function getTheme(): Theme {
  return chosen() ?? (darkQuery?.matches ? 'dark' : 'light');
}

function apply(): void {
  const c = chosen();
  const root = document.documentElement;
  if (c) root.dataset.theme = c;
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getTheme() === 'dark' ? '#221a36' : '#ffc2dc');
  listeners.forEach((fn) => fn());
}

export function toggleTheme(): void {
  storageSet(THEME_KEY, getTheme() === 'dark' ? 'light' : 'dark');
  apply();
}

export function onThemeChange(fn: () => void): void {
  listeners.add(fn);
}

export function initTheme(): void {
  apply();
  darkQuery?.addEventListener('change', apply);
}
