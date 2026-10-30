// Tiny SVG string helpers shared by all modes.

export interface Pt { x: number; y: number }

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Format a number compactly for SVG output. */
export function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
}

type AttrValue = string | number | undefined | false | null;

export function attrs(o: Record<string, AttrValue>): string {
  let out = '';
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === false || v === null) continue;
    out += ` ${k}="${typeof v === 'number' ? n(v) : v}"`;
  }
  return out;
}

export function tag(name: string, o: Record<string, AttrValue>, inner?: string): string {
  return inner === undefined ? `<${name}${attrs(o)}/>` : `<${name}${attrs(o)}>${inner}</${name}>`;
}

export const M = (x: number, y: number): string => `M${n(x)} ${n(y)}`;
export const L = (x: number, y: number): string => `L${n(x)} ${n(y)}`;
export const Q = (cx: number, cy: number, x: number, y: number): string => `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`;
export const C = (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): string =>
  `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x)} ${n(y)}`;

const curveThrough = (pts: Pt[], closed: boolean, k: number): string => {
  const len = pts.length;
  let d = '';
  const at = (i: number): Pt => {
    if (closed) return pts[((i % len) + len) % len];
    return pts[Math.min(len - 1, Math.max(0, i))];
  };
  const segs = closed ? len : len - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += C(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y);
  }
  return d;
};

/** Smooth closed path through points (Catmull-Rom -> cubic Bezier). */
export function smoothClosed(pts: Pt[], k = 1 / 6): string {
  if (pts.length < 3) return '';
  return `${M(pts[0].x, pts[0].y)}${curveThrough(pts, true, k)}Z`;
}

/** Smooth open path through points. Pass `move=false` to continue an existing path. */
export function smoothOpen(pts: Pt[], k = 1 / 6, move = true): string {
  if (pts.length < 2) return '';
  return `${move ? M(pts[0].x, pts[0].y) : ''}${curveThrough(pts, false, k)}`;
}

export const mirrorPts = (pts: Pt[]): Pt[] => pts.map((p) => ({ x: -p.x, y: p.y }));

export function ellipse(cx: number, cy: number, rx: number, ry: number, o: Record<string, AttrValue> = {}): string {
  return tag('ellipse', { cx, cy, rx, ry, ...o });
}

export function circle(cx: number, cy: number, r: number, o: Record<string, AttrValue> = {}): string {
  return tag('circle', { cx, cy, r, ...o });
}

export function path(d: string, o: Record<string, AttrValue> = {}): string {
  return tag('path', { d, ...o });
}

export function group(inner: string, o: Record<string, AttrValue> = {}): string {
  return tag('g', o, inner);
}

/** Heart outline centred at (cx, cy), `s` = half width. */
export function heartPath(cx: number, cy: number, s: number): string {
  return (
    M(cx, cy + s * 0.95) +
    C(cx - s * 1.2, cy + s * 0.2, cx - s * 1.15, cy - s * 0.85, cx - s * 0.5, cy - s * 0.85) +
    C(cx - s * 0.2, cy - s * 0.85, cx, cy - s * 0.6, cx, cy - s * 0.4) +
    C(cx, cy - s * 0.6, cx + s * 0.2, cy - s * 0.85, cx + s * 0.5, cy - s * 0.85) +
    C(cx + s * 1.15, cy - s * 0.85, cx + s * 1.2, cy + s * 0.2, cx, cy + s * 0.95) +
    'Z'
  );
}

/** Four-pointed sparkle star centred at (cx, cy), `r` = tip radius. */
export function starPath(cx: number, cy: number, r: number, pinch = 0.22): string {
  const i = r * pinch;
  return (
    M(cx, cy - r) + Q(cx + i, cy - i, cx + r, cy) + Q(cx + i, cy + i, cx, cy + r) +
    Q(cx - i, cy + i, cx - r, cy) + Q(cx - i, cy - i, cx, cy - r) + 'Z'
  );
}
