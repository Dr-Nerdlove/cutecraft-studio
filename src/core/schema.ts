import type { Key } from '../i18n';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

interface ParamBase {
  /** Storage key inside `params`. Never rename a key once released (old saves use it). */
  key: string;
  labelKey: Key;
  /** Hide the control while this returns false (e.g. second iris colour without heterochromia). */
  showIf?: (params: Params) => boolean;
}

export interface SliderParam extends ParamBase {
  type: 'slider';
  min: number;
  max: number;
  step: number;
  default: number;
  /** Small captions for both ends of the slider. */
  minLabelKey?: Key;
  maxLabelKey?: Key;
}

export interface ColorParam extends ParamBase {
  type: 'color';
  palette: readonly string[];
  allowCustom: boolean;
  default: string;
}

export interface ChoiceOption {
  value: string;
  labelKey: Key;
  icon?: string;
}

export interface ChoiceParam extends ParamBase {
  type: 'choice';
  options: readonly ChoiceOption[];
  default: string;
}

export interface ToggleParam extends ParamBase {
  type: 'toggle';
  default: boolean;
}

export type ParamDef = SliderParam | ColorParam | ChoiceParam | ToggleParam;

export interface Category {
  id: string;
  icon: string;
  labelKey: Key;
  params: readonly ParamDef[];
}

export const slider = (
  key: string, labelKey: Key, min: number, max: number, step: number, def: number,
  extra: Partial<Pick<SliderParam, 'showIf' | 'minLabelKey' | 'maxLabelKey'>> = {},
): SliderParam => ({ type: 'slider', key, labelKey, min, max, step, default: def, ...extra });

export const color = (
  key: string, labelKey: Key, palette: readonly string[], def: string,
  extra: Partial<Pick<ColorParam, 'showIf' | 'allowCustom'>> = {},
): ColorParam => ({ type: 'color', key, labelKey, palette, allowCustom: true, default: def, ...extra });

export const choice = (
  key: string, labelKey: Key, options: readonly ChoiceOption[], def: string,
  extra: Partial<Pick<ChoiceParam, 'showIf'>> = {},
): ChoiceParam => ({ type: 'choice', key, labelKey, options, default: def, ...extra });

export const toggle = (
  key: string, labelKey: Key, def: boolean, extra: Partial<Pick<ToggleParam, 'showIf'>> = {},
): ToggleParam => ({ type: 'toggle', key, labelKey, default: def, ...extra });

export function allParams(categories: readonly Category[]): ParamDef[] {
  return categories.flatMap((c) => [...c.params]);
}
