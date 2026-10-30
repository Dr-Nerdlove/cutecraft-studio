import { de } from './de';
import { en } from './en';
import type { Dictionary, Key } from './types';

export type { Key, Dictionary } from './types';
export type Lang = 'de' | 'en';

const dictionaries: Record<Lang, Dictionary> = { de, en };

/** German if the system's preferred language is German, otherwise English. */
function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const first = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  return first.startsWith('de') ? 'de' : 'en';
}

let current: Lang = detectLang();
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

/** Translate a key. `{name}`-style placeholders are filled from `vars`. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let text: string = dictionaries[current][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

export function initLang(): void {
  document.documentElement.lang = current;
  // follow the system language while the app is open
  window.addEventListener('languagechange', () => {
    const next = detectLang();
    if (next === current) return;
    current = next;
    document.documentElement.lang = next;
    listeners.forEach((fn) => fn());
  });
}
