// Small colour helpers. All colours are "#rrggbb" strings.

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h, 16);
  if (!Number.isFinite(v) || h.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hh = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: f(hh + 1 / 3) * 255, g: f(hh) * 255, b: f(hh - 1 / 3) * 255 };
}

export const hexToHsl = (hex: string): HSL => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl: HSL): string => rgbToHex(hslToRgb({ ...hsl, s: clamp01(hsl.s), l: clamp01(hsl.l) }));

export function lighten(hex: string, amount: number): string {
  const c = hexToHsl(hex);
  return hslToHex({ ...c, l: c.l + amount });
}

export function darken(hex: string, amount: number): string {
  return lighten(hex, -amount);
}

export function saturate(hex: string, amount: number): string {
  const c = hexToHsl(hex);
  return hslToHex({ ...c, s: c.s + amount });
}

export function hueShift(hex: string, degrees: number): string {
  const c = hexToHsl(hex);
  return hslToHex({ ...c, h: c.h + degrees });
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Soft cel-shading colour: a bit darker, a bit warmer and more saturated. */
export function shade(hex: string, strength = 1): string {
  const c = hexToHsl(hex);
  return hslToHex({
    h: c.h - 7 * strength,
    s: Math.min(1, c.s * (1 + 0.1 * strength) + 0.03 * strength),
    l: c.l * (1 - 0.15 * strength) - 0.02 * strength,
  });
}

/** Outline colour derived from a fill: a muted, darker cousin (never pure black). */
export function outline(hex: string): string {
  const c = hexToHsl(hex);
  return hslToHex({
    h: c.h - 4,
    s: Math.min(0.42, Math.max(0.08, c.s * 0.45)),
    l: Math.min(0.46, Math.max(0.1, c.l * 0.52)),
  });
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
