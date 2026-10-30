import { isHex } from './color';
import type { CharacterState } from './mode';
import { getMode, defaultMode } from './modes';
import { allParams, type Params, type ParamDef } from './schema';

export const GALLERY_KEY = 'cutecraft.gallery.v1';
export const CURRENT_KEY = 'cutecraft.current.v1';
export const VIEW_KEY = 'cutecraft.view';

export const CURRENT_SCHEMA_VERSION = 1;

// ---- safe localStorage ------------------------------------------------------------------------

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// ---- migration --------------------------------------------------------------------------------

function cleanValue(def: ParamDef, raw: unknown): number | string | boolean {
  switch (def.type) {
    case 'slider': {
      const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : def.default;
      return Math.min(def.max, Math.max(def.min, v));
    }
    case 'toggle':
      return typeof raw === 'boolean' ? raw : def.default;
    case 'choice':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw) ? raw : def.default;
    case 'color':
      return isHex(raw) ? raw.toLowerCase() : def.default;
  }
}

/**
 * Turns anything that was ever stored into a valid character of the current schema:
 * - missing parameters are filled with defaults (new parameters never break old saves),
 * - unknown parameters are dropped (removed parameters never break either),
 * - invalid values fall back to the default.
 * Returns null when the data is not a character at all. Never throws.
 */
export function migrate(raw: unknown): CharacterState | null {
  try {
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;
    const mode = getMode(typeof obj.mode === 'string' ? obj.mode : defaultMode.id);
    if (!mode) return null;
    // Future: when schemaVersion 2 exists, upgrade `obj.params` step by step here
    // (rename keys, convert values) before the generic cleaning below.
    const incoming = typeof obj.params === 'object' && obj.params !== null ? (obj.params as Record<string, unknown>) : {};
    const params: Params = {};
    for (const def of allParams(mode.categories)) {
      params[def.key] = cleanValue(def, incoming[def.key]);
    }
    return { schemaVersion: CURRENT_SCHEMA_VERSION, mode: mode.id, params };
  } catch {
    return null;
  }
}

export function newCharacter(modeId: string): CharacterState {
  const mode = getMode(modeId) ?? defaultMode;
  return { schemaVersion: CURRENT_SCHEMA_VERSION, mode: mode.id, params: mode.defaults() };
}

export const cloneCharacter = (c: CharacterState): CharacterState => ({ ...c, params: { ...c.params } });

// ---- current work (autosave) ------------------------------------------------------------------

export function loadCurrent(): CharacterState | null {
  const raw = storageGet(CURRENT_KEY);
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCurrent(c: CharacterState): void {
  storageSet(CURRENT_KEY, JSON.stringify(c));
}

// ---- gallery ----------------------------------------------------------------------------------

export interface GalleryItem {
  id: string;
  name: string;
  createdAt: number;
  character: CharacterState;
}

interface GalleryFile {
  version: 1;
  items: GalleryItem[];
}

export function loadGallery(): GalleryItem[] {
  const raw = storageGet(GALLERY_KEY);
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    const list: unknown = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
    if (!Array.isArray(list)) return [];
    const items: GalleryItem[] = [];
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const character = migrate(e.character);
      if (!character) continue;
      items.push({
        id: typeof e.id === 'string' && e.id ? e.id : makeId(),
        name: typeof e.name === 'string' ? e.name.slice(0, 60) : '',
        createdAt: typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : Date.now(),
        character,
      });
    }
    return items;
  } catch {
    return [];
  }
}

/** Returns false when the browser refused to store (private mode, quota). */
export function saveGallery(items: GalleryItem[]): boolean {
  const file: GalleryFile = { version: 1, items };
  return storageSet(GALLERY_KEY, JSON.stringify(file));
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
