import { darken, lighten, mix, outline, shade } from '../../core/color';
import { C, L, M, Q, lerp, smoothClosed, type Pt, ellipse, group, path } from '../../core/svg';
import { cel, stroke, type Ctx } from './context';
import { armGeo, torsoLeftEdge, type Geo } from './geometry';

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

export function torsoPath(g: Geo, y0: number, y1: number, grow = 0, steps = 12): string {
  const left = torsoLeftEdge(g, y0, y1, grow, steps);
  const right = left.map((q) => ({ x: -q.x, y: q.y })).reverse();
  return smoothClosed([...left, ...right], 1 / 6);
}

export function torsoSvg(ctx: Ctx): string {
  const { g } = ctx;
  return cel(ctx, torsoPath(g, g.yShoulder - 1, g.yCrotch + 1), ctx.skin, {
    line: ctx.skinLine, shadeColor: ctx.skinShade, dx: -g.lw * 1.5, dy: -g.lw * 0.5,
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
 * `hand` adds the hand at the end (only meaningful for f1 = 1).
 */
export function armSlice(ctx: Ctx, side: -1 | 1, f0: number, f1: number, grow = 0, flare = 0, hand = false): string {
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
  return smoothClosed(pts, 1 / 6);
}

export function armsSvg(ctx: Ctx): string {
  const { g } = ctx;
  let out = '';
  for (const side of [-1, 1] as const) {
    const a = armGeo(g, side);
    out += cel(ctx, armSlice(ctx, side, -0.04, 1, 0, 0, true), ctx.skin, {
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

