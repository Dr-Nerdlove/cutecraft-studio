import type { Mode } from './mode';
import { animeMode } from '../modes/anime';

/** All registered modes. Add new modes here. */
export const modes: readonly Mode[] = [animeMode];
export const defaultMode: Mode = animeMode;

export function getMode(id: string): Mode | undefined {
  return modes.find((m) => m.id === id);
}
