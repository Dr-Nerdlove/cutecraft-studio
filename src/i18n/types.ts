import type { de } from './de';

/** Every translation key. German is the source of truth. */
export type Key = keyof typeof de;

/** A complete dictionary: a missing or extra key makes `tsc` fail. */
export type Dictionary = { [K in Key]: string };
