import type { Key } from '../i18n';
import type { Category, Params } from './schema';

/** 'full' = whole body, 'portrait' = zoomed to head and shoulders (a view setting, not part of the character). */
export type ViewKind = 'full' | 'portrait';

/**
 * A style mode (anime now, more later). Each mode owns its parameter schema and its renderer.
 * The UI, storage and export are generic and only talk to this interface.
 */
export interface Mode {
  id: string;
  nameKey: Key;
  categories: readonly Category[];
  defaults(): Params;
  randomize(): Params;
  /**
   * Returns a standalone SVG string (with viewBox). `idPrefix` makes every internal id unique,
   * so many characters can live on one page (gallery thumbnails).
   */
  render(params: Params, idPrefix: string, view?: ViewKind): string;
}

/** The saved form of a character. Bump `schemaVersion` only for breaking changes + add a migration step. */
export interface CharacterState {
  schemaVersion: 1;
  mode: string;
  params: Params;
}
