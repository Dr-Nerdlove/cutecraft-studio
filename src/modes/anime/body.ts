import { darken, lighten, mix, outline, shade } from '../../core/color';
import { C, L, M, Q, lerp, smoothClosed, smoothOpen, type Pt, ellipse, group, path } from '../../core/svg';
import { cel, stroke, type Ctx } from './context';
import { armGeo, torsoHW, type Geo } from './geometry';

// ---- legs -------------------------------------------------------------------------------------

export interface LegStation { cx: number; y: number; hw: number }

/** Where the leg is at t = 0 (top, under the hips) .. 1 (ankle). */
export function legAt(g: Geo, side: -1 | 1, t: number): LegStation {
  const y0 = g.yCrotch - g.torsoLen * 0.1;
  const y = lerp(y0, g.yAnkle, t);
  const stations: ReadonlyArray<readonly [number, number]> = [
    [0, g.thighHW], [0.3, g.thighHW * 0.97], [0.55, g.kneeHW], [0.74, g.kneeHW * 0.97], [1, g.ankleHW],
  ];
  let hw = g.ankleHW;
  for (let i = 0; i < stations.length - 1; i++) {
    const [t0, w0] = stations[i];
    const [t1, w1] = stations[i + 1];
    if (t <= t1) {
      hw = lerp(w0, w1, (1 - Math.cos(Math.PI * ((t - t0) / (t1 - t0)))) / 2);
      break;
    }
  }
  return { cx: side * g.legCx * lerp(1, 0.92, t), y, hw };
}

/** Closed outline of a slice of a leg between t0 and t1. */
export function legSlice(g: Geo, side: -1 | 1, t0: number, t1: number, grow = 0, flare = 0, steps = 6): string {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = lerp(t0, t1, i / steps);
    const s = legAt(g, side, t);
    const w = s.hw + grow + flare * (i / steps);
    outer.push({ x: s.cx + side * w, y: s.y });
    inner.push({ x: s.cx - side * w, y: s.y });
  }
  const end = legAt(g, side, t1);
  const bottom: Pt = { x: end.cx, y: end.y + 1.2 + grow };
  return smoothClosed([...outer, bottom, ...inner.reverse()], 1 / 6);
}

export function legsSvg(ctx: Ctx): string {
  const { g, skin } = ctx;
  let out = '';
  for (const side of [-1, 1] as const) {
    out += cel(ctx, legSlice(g, side, 0, 1), skin, { line: ctx.skinLine, shadeColor: ctx.skinShade, dx: -g.lw * 1.4, dy: 0 });
  }
  return out;
}

export function socksSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  if (p.socks === 'none') return '';
  let out = '';
  const t0 = p.socks === 'knee' ? 0.5 : 0.86;
  for (const side of [-1, 1] as const) {
    out += cel(ctx, legSlice(g, side, t0, 1, 0.9), p.sockColor, { dx: -g.lw * 1.1, dy: 0 });
    // ribbed band at the top
    const top = legAt(g, side, t0);
    const bandH = Math.max(2.2, g.u * 0.028);
    const w = top.hw + 1.4;
    out += path(`${M(top.cx - w, top.y)}${L(top.cx + w, top.y)}${L(top.cx + w * 0.98, top.y + bandH)}${L(top.cx - w * 0.98, top.y + bandH)}Z`, {
      fill: mix(shade(p.sockColor, 0.8), '#f5a0c0', 0.25), stroke: outline(p.sockColor), 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round',
    });
  }
  return out;
}

export function shoesSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  let out = '';
  for (const side of [-1, 1] as const) {
    const a = legAt(g, side, 1);
    const sw = Math.max(g.ankleHW * 2.3, 11);
    const sx = a.cx + side * g.ankleHW * 0.45;
    const h = g.shoeH;
    const pts: Pt[] = [
      { x: sx - g.ankleHW * 1.2, y: g.yAnkle - 2.5 },
      { x: sx + g.ankleHW * 1.2, y: g.yAnkle - 2.5 },
      { x: sx + sw * 0.9, y: g.yAnkle + h * 0.4 },
      { x: sx + sw, y: -h * 0.18 },
      { x: sx + sw * 0.6, y: -0.3 },
      { x: sx - sw * 0.6, y: -0.3 },
      { x: sx - sw, y: -h * 0.18 },
      { x: sx - sw * 0.9, y: g.yAnkle + h * 0.4 },
    ];
    const d = smoothClosed(pts, 1 / 6);
    const sole = '#fffaf6';
    const inner = group(
      path(`${M(sx - sw * 1.2, -h * 0.3)}${L(sx + sw * 1.2, -h * 0.3)}${L(sx + sw * 1.2, 2)}${L(sx - sw * 1.2, 2)}Z`, { fill: sole }) +
        ellipse(sx + side * sw * 0.2, g.yAnkle + h * 0.45, sw * 0.28, h * 0.16, { fill: lighten(p.shoeColor, 0.18), opacity: 0.8 }),
    );
    out += cel(ctx, d, p.shoeColor, { dx: -g.lw * 1.2, dy: -g.lw * 0.7, inside: inner });
  }
  return out;
}

// ---- torso & neck -----------------------------------------------------------------------------

// ---- shoulder line ----------------------------------------------------------------------------

/** Where on the arm axis (fraction of its length) the rounded shoulder cap is centred. */
export const SH_F = 0.03;

type Cubic = [Pt, Pt, Pt, Pt];

/** Right part of a cubic Bezier from parameter t on (de Casteljau). */
function cubicFrom(b: Cubic, t: number): Cubic {
  const m = (p: Pt, q: Pt): Pt => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
  const ab = m(b[0], b[1]), bc = m(b[1], b[2]), cd = m(b[2], b[3]);
  const abc = m(ab, bc), bcd = m(bc, cd);
  return [m(abc, bcd), bcd, cd, b[3]];
}

export interface Shoulder {
  /** Neck base -> tangent point on the shoulder cap (a slightly concave trapezius slope). */
  b: Cubic;
  /** Centre and radius of the rounded shoulder cap (the top of the arm). */
  ctr: Pt;
  R: number;
}

/**
 * Shoulder line of one side: a gentle slope from the neck base that runs into the rounded top of the
 * arm tangentially, so nothing sticks up above it. `rg` grows the cap (garments), `grow` moves the
 * neck base outwards, `tN` (0..1) starts the line further out (wider necklines).
 */
export function shoulderGeo(g: Geo, side: -1 | 1, rg: number, grow: number, tN = 0): Shoulder {
  const a = armGeo(g, 1);
  const ctr = { x: a.x0 + (a.x1 - a.x0) * SH_F, y: a.y0 + (a.y1 - a.y0) * SH_F };
  const R = a.r + rg;
  const n = { x: g.neckHW * 1.3 + grow, y: g.yShoulder };
  const dx = ctr.x - n.x, dy = ctr.y - n.y;
  const d = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx) - Math.asin(Math.min(0.9, R / d));
  const tl = Math.sqrt(d * d - R * R);
  const t = { x: n.x + tl * Math.cos(ang), y: n.y + tl * Math.sin(ang) };
  const c1a = ang + 0.2; // steeper at the neck, then flattening into the shoulder
  const c1 = { x: n.x + Math.cos(c1a) * tl * 0.35, y: n.y + Math.sin(c1a) * tl * 0.35 };
  const c2 = { x: t.x - Math.cos(ang) * tl * 0.3, y: t.y - Math.sin(ang) * tl * 0.3 };
  let b: Cubic = [n, c1, c2, t];
  if (tN > 0) b = cubicFrom(b, tN);
  const mx = (p: Pt): Pt => ({ x: p.x * side, y: p.y });
  return { b: b.map(mx) as Cubic, ctr: mx(ctr), R };
}

/** Point on the shoulder line at parameter t (0 = start, 1 = shoulder cap). */
export function shoulderAt(s: Shoulder, t: number): Pt {
  const [p0, p1, p2, p3] = s.b;
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: p0.x * k[0] + p1.x * k[1] + p2.x * k[2] + p3.x * k[3], y: p0.y * k[0] + p1.y * k[1] + p2.y * k[2] + p3.y * k[3] };
}

function edgePts(g: Geo, s: Shoulder, grow: number, yEnd: number, tail: Pt[], steps: number): Pt[] {
  const yA = s.ctr.y + s.R * 1.05;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = lerp(yA, yEnd, i / steps);
    pts.push({ x: -torsoHW(g, y, grow), y });
  }
  return [...pts, ...tail];
}

/**
 * Left edge of a garment or the torso, going down from the left end of the shoulder line (start the
 * path at `shoulderGeo(g, -1, rg, grow, tN).b[0]`): shoulder line, then (hidden under the arm cap)
 * the side. `tail` = extra left-edge points after the torso part (skirts).
 */
export function edgeDown(g: Geo, rg: number, grow: number, tN: number, yEnd: number, tail: Pt[] = [], steps = 10): string {
  const s = shoulderGeo(g, -1, rg, grow, tN);
  const [, c1, c2, t] = s.b;
  const pts = edgePts(g, s, grow, yEnd, tail, steps);
  return C(c1.x, c1.y, c2.x, c2.y, t.x, t.y) + L(s.ctr.x, s.ctr.y) + L(pts[0].x, pts[0].y) + smoothOpen(pts, 1 / 6, false);
}

/** Right edge going up from the bottom of the left-edge points (mirror of `edgeDown`). */
export function edgeUp(g: Geo, rg: number, grow: number, tN: number, yEnd: number, tail: Pt[] = [], steps = 10): string {
  const s = shoulderGeo(g, -1, rg, grow, tN);
  const [n, c1, c2, t] = s.b;
  const pts = edgePts(g, s, grow, yEnd, tail, steps).map((q) => ({ x: -q.x, y: q.y })).reverse();
  return smoothOpen(pts, 1 / 6, false) + L(-s.ctr.x, s.ctr.y) + L(-t.x, t.y) + C(-c2.x, c2.y, -c1.x, c1.y, -n.x, n.y);
}

/** Closed torso (skin) outline with the sloping shoulders. */
function torsoShape(g: Geo, y1: number): string {
  const n = shoulderGeo(g, -1, 0, 0).b[0];
  return M(n.x, n.y) + edgeDown(g, 0, 0, 0, y1) + L(torsoHW(g, y1), y1) + edgeUp(g, 0, 0, 0, y1) + 'Z';
}

export function torsoSvg(ctx: Ctx): string {
  const { g } = ctx;
  const yS = g.yShoulder, T = g.torsoLen;
  // collarbones: two very soft strokes, only seen where the neckline is open
  const dark = mix(ctx.skinShade, '#a05a60', 0.3);
  let bones = '';
  for (const s of [-1, 1] as const) {
    bones += stroke(ctx, `${M(s * g.neckHW * 0.75, yS + T * 0.022)}${Q(s * g.neckHW * 2.2, yS + T * 0.03, s * g.neckHW * 3.9, yS + T * 0.004)}`, dark, g.lw * 2.2, { opacity: 0.5 });
  }
  const hollow = ellipse(0, yS + T * 0.012, g.neckHW * 0.55, g.u * 0.02, { fill: dark, opacity: 0.4 });
  const inside = group(bones + hollow, { filter: `url(#${ctx.soft})` });
  return cel(ctx, torsoShape(g, g.yCrotch + 1), ctx.skin, {
    line: ctx.skinLine, shadeColor: ctx.skinShade, dx: -g.lw * 1.5, dy: -g.lw * 0.5, inside,
  });
}

export function neckSvg(ctx: Ctx): string {
  const { g } = ctx;
  const top = g.yChin - g.u * 0.2;
  const bot = g.yShoulder + 1.5;
  const nk = g.neckHW;
  const d =
    M(-nk, top) + L(nk, top) + C(nk, g.yChin, nk * 1.05, bot - 2, nk * 1.25, bot) + L(-nk * 1.25, bot) + C(-nk * 1.05, bot - 2, -nk, g.yChin, -nk, top) + 'Z';
  // soft shadow cast by the head onto the neck
  const chinShadow = ellipse(g.u * 0.02, g.yChin - g.u * 0.02, nk * 1.5, g.u * 0.11, { fill: mix(ctx.skinShade, '#7a5a60', 0.25), opacity: 0.55, filter: `url(#${ctx.soft})` });
  return cel(ctx, d, ctx.skin, { line: ctx.skinLine, shadeColor: ctx.skinShade, dx: -g.lw * 1.4, dy: -g.lw * 0.5, inside: chinShadow });
}

// ---- arms -------------------------------------------------------------------------------------

/**
 * Outline of a slice of an arm from fraction f0 to f1 of the shoulder-to-wrist length.
 * `hand` adds the hand at the end (only meaningful for f1 = 1). `cap` rounds the top end into a
 * semicircle (the shoulder cap) instead of cutting it off straight.
 */
export function armSlice(ctx: Ctx, side: -1 | 1, f0: number, f1: number, grow = 0, flare = 0, hand = false, cap = false): string {
  const g = ctx.g;
  const a = armGeo(g, side);
  const dx = a.x1 - a.x0, dy = a.y1 - a.y0;
  const len = Math.hypot(dx, dy);
  const dir = { x: dx / len, y: dy / len };
  const nrm = { x: -dir.y, y: dir.x };
  const widthAt = (f: number): number => a.r * lerp(1, 0.76, Math.min(1, Math.max(0, (f - 0.35) / 0.65)));
  const posAt = (f: number): Pt => ({ x: a.x0 + dir.x * len * f, y: a.y0 + dir.y * len * f });

  const leftPts: Pt[] = [];
  const rightPts: Pt[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const f = lerp(f0, f1, i / steps);
    const c = posAt(f);
    const w = widthAt(f) + grow + flare * (i / steps);
    leftPts.push({ x: c.x - nrm.x * w, y: c.y - nrm.y * w });
    rightPts.push({ x: c.x + nrm.x * w, y: c.y + nrm.y * w });
  }
  const endC = posAt(f1);
  const tail: Pt[] = [];
  if (hand) {
    const hr = a.r * 1.12;
    const hc = { x: endC.x + dir.x * hr * 0.8, y: endC.y + dir.y * hr * 0.8 };
    leftPts.push({ x: hc.x - nrm.x * hr, y: hc.y - nrm.y * hr });
    rightPts.push({ x: hc.x + nrm.x * hr, y: hc.y + nrm.y * hr });
    tail.push({ x: hc.x + dir.x * hr * 1.02, y: hc.y + dir.y * hr * 1.02 });
  } else {
    const w = widthAt(f1) + grow + flare;
    tail.push({ x: endC.x + dir.x * w * 0.35, y: endC.y + dir.y * w * 0.35 });
  }
  // the order must run around the shape: left side down, tail, right side up
  const pts = side === -1 ? [...leftPts, ...tail, ...rightPts.slice().reverse()] : [...rightPts, ...tail, ...leftPts.slice().reverse()];
  if (cap) {
    // arc over the top from one side point to the other (a = 0: leftPts[0], a = PI: rightPts[0])
    const c0 = posAt(f0), w0 = widthAt(f0) + grow;
    const arc = [30, 60, 90, 120, 150].map((deg) => {
      const a2 = (deg * Math.PI) / 180;
      return { x: c0.x + w0 * (-nrm.x * Math.cos(a2) - dir.x * Math.sin(a2)), y: c0.y + w0 * (-nrm.y * Math.cos(a2) - dir.y * Math.sin(a2)) };
    });
    pts.push(...(side === -1 ? arc.reverse() : arc));
  }
  return smoothClosed(pts, 1 / 6);
}

/** A point beside the arm axis: fraction f of the way down, `off` to the viewer's right (+) or left (-). */
export function armPoint(g: Geo, side: -1 | 1, f: number, off = 0): Pt {
  const a = armGeo(g, side);
  const dx = a.x1 - a.x0, dy = a.y1 - a.y0;
  const len = Math.hypot(dx, dy);
  return { x: a.x0 + dx * f + (dy / len) * off, y: a.y0 + dy * f - (dx / len) * off };
}

export function armsSvg(ctx: Ctx): string {
  const { g } = ctx;
  let out = '';
  for (const side of [-1, 1] as const) {
    const a = armGeo(g, side);
    out += cel(ctx, armSlice(ctx, side, SH_F, 1, 0, 0, true, true), ctx.skin, {
      line: ctx.skinLine, shadeColor: ctx.skinShade, dx: -g.lw * 1.3, dy: -g.lw * 0.3,
    });
    // tiny thumb line on the hand
    const hr = a.r * 1.12;
    const dxv = a.x1 - a.x0, dyv = a.y1 - a.y0;
    const len = Math.hypot(dxv, dyv);
    const hx = a.x1 + (dxv / len) * hr * 1.1;
    const hy = a.y1 + (dyv / len) * hr * 1.1;
    out += stroke(ctx, `${M(hx - side * hr * 0.1, hy - hr * 0.5)}${Q(hx + side * hr * 0.15, hy - hr * 0.1, hx - side * hr * 0.05, hy + hr * 0.2)}`, ctx.skinLine, g.lw * 0.7, { opacity: 0.7 });
  }
  return out;
}

export function groundShadowSvg(ctx: Ctx): string {
  const { g } = ctx;
  const rx = Math.max(g.hipHW * 1.5, g.legCx * 2.2 + 24);
  return ellipse(0, 1, rx, Math.max(5, g.u * 0.045), { fill: darken('#c9a6c8', 0.1), opacity: 0.28 });
}

