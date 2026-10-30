import { de } from './de';
import { en } from './en';
import type { Dictionary, Key } from './types';
import { LANG_KEY, storageGet, storageSet } from '../core/storage';

export type { Key, Dictionary } from './types';
export type Lang = 'de' | 'en';

const dictionaries: Record<Lang, Dictionary> = { de, en };

function detectLang(): Lang {
  const saved = storageGet(LANG_KEY);
  if (saved === 'de' || saved === 'en') return saved;
  const nav = typeof navigator !== 'undefined' ? (navigator.language || '').toLowerCase() : '';
  return nav.startsWith('de') ? 'de' : 'en';
}

let current: Lang = detectLang();
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  storageSet(LANG_KEY, lang);
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

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
}
