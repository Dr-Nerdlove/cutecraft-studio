import { darken, lighten, luminance, mix, outline, shade } from '../../core/color';
import {
  C, L, M, Q, ellipse, group, heartPath, lerp, path, smoothOpen, type Pt,
} from '../../core/svg';
import { armSlice, legAt } from './body';
import { cel, flat, stroke, type Ctx } from './context';
import { torsoHW, type Geo } from './geometry';

const waistY = (g: Geo): number => g.yShoulder + g.torsoLen * 0.62;

// ---- bottoms ----------------------------------------------------------------------------------

function flaredSkirtPath(g: Geo, topY: number, topHW: number, hipY: number, hipHWv: number, hemY: number, hemHW: number, scallops: number): string {
  const left: Pt[] = [{ x: -topHW, y: topY }, { x: -hipHWv, y: hipY }, { x: -hemHW, y: hemY }];
  const right: Pt[] = [{ x: hemHW, y: hemY }, { x: hipHWv, y: hipY }, { x: topHW, y: topY }];
  let d = M(left[0].x, left[0].y) + smoothOpen(left, 1 / 6, false);
  const dip = g.u * 0.028;
  const w = (hemHW * 2) / scallops;
  for (let i = 0; i < scallops; i++) {
    const x0 = -hemHW + w * i;
    d += Q(x0 + w / 2, hemY + dip * 2, x0 + w, hemY);
  }
  d += smoothOpen(right, 1 / 6, false) + 'Z';
  return d;
}

function skirtSvg(ctx: Ctx, color: string, hemY: number, hemHW: number, pleats = true): string {
  const { g } = ctx;
  const yW = waistY(g) - g.torsoLen * 0.03;
  const yHip = g.yShoulder + g.torsoLen * 0.88;
  const d = flaredSkirtPath(g, yW, torsoHW(g, yW, 1.6), yHip, g.hipHW + 1.8, hemY, hemHW, 6);
  let inside = '';
  if (pleats) {
    const top = torsoHW(g, yW, 1.6);
    for (const f of [-0.66, -0.33, 0, 0.33, 0.66]) {
      inside += stroke(ctx, `${M(top * f * 0.9, yW + g.torsoLen * 0.06)}${Q(hemHW * f * 0.85, (yW + hemY) / 2, hemHW * f * 1.02, hemY - 1)}`, shade(color, 1.3), g.lw * 0.8, { opacity: 0.55 });
    }
  }
  return cel(ctx, d, color, { dx: -g.lw * 2.2, dy: -g.lw * 0.6, inside });
}

function pantsPath(g: Geo, tEnd: number, grow: number, flare: number): string {
  const yW = waistY(g) - g.torsoLen * 0.03;
  const y0 = legAt(g, -1, 0).y;
  const outerL: Pt[] = torsoLeftEdge2(g, yW, y0, grow);
  const innerL: Pt[] = [];
  const tc = (g.yCrotch - y0) / (g.yAnkle - y0);
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = lerp(0, tEnd, i / steps);
    const s = legAt(g, -1, t);
    const f = i / steps;
    outerL.push({ x: s.cx - s.hw - grow - flare * f, y: s.y });
  }
  for (let i = steps; i >= 0; i--) {
    const t = lerp(tc, tEnd, i / steps);
    const s = legAt(g, -1, t);
    const f = (t - 0) / Math.max(0.0001, tEnd);
    innerL.push({ x: s.cx + s.hw + grow + flare * f, y: s.y });
  }
  const hemL = outerL[outerL.length - 1];
  const hemIn = innerL[0];
  const apexY = g.yCrotch - 2;
  const mirror = (p: Pt): Pt => ({ x: -p.x, y: p.y });
  const innerR = innerL.slice().reverse().map(mirror);
  const outerR = outerL.slice().reverse().map(mirror);
  return (
    M(outerL[0].x, outerL[0].y) + smoothOpen(outerL, 1 / 6, false) +
    L(hemIn.x, hemIn.y) + smoothOpen(innerL, 1 / 6, false) +
    Q(0, apexY - 3, innerR[0].x, innerR[0].y) + smoothOpen(innerR, 1 / 6, false) +
    L(outerR[0].x - (hemIn.x - hemL.x) * 0, outerR[0].y) + smoothOpen(outerR, 1 / 6, false) + 'Z'
  );
}

function torsoLeftEdge2(g: Geo, y0: number, y1: number, grow: number): Pt[] {
  const pts: Pt[] = [];
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const y = lerp(y0, y1, i / steps);
    pts.push({ x: -torsoHW(g, y, grow), y });
  }
  return pts;
}

export function bottomSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  if (p.top === 'dress') return '';
  const c = p.bottomColor;
  if (p.bottom === 'skirt') {
    const hemY = g.yCrotch + g.legLen * 0.3;
    return skirtSvg(ctx, c, hemY, g.hipHW * 1.1 + g.u * 0.11);
  }
  const tEnd = p.bottom === 'shorts' ? 0.3 : 0.985;
  const flare = p.bottom === 'shorts' ? 1.2 : 1.6;
  const yW = waistY(g) - g.torsoLen * 0.03;
  let inside = '';
  // waistband
  const bandH = g.torsoLen * 0.055;
  inside += path(
    `${M(-torsoHW(g, yW, 3), yW)}${L(torsoHW(g, yW, 3), yW)}${L(torsoHW(g, yW + bandH, 3), yW + bandH)}${L(-torsoHW(g, yW + bandH, 3), yW + bandH)}Z`,
    { fill: shade(c, 1.1), opacity: 0.8 },
  );
  // centre seam
  inside += stroke(ctx, `${M(0, yW + bandH)}${L(0, g.yCrotch - 2)}`, shade(c, 1.4), g.lw * 0.7, { opacity: 0.6 });
  return cel(ctx, pantsPath(g, tEnd, 1.5, flare), c, { dx: -g.lw * 1.5, dy: -g.lw * 0.4, inside });
}

// ---- tops -------------------------------------------------------------------------------------

interface TopOptions {
  hemY: number;
  grow?: number;
  neckDepth?: number;
  vNeck?: boolean;
  bow?: number;
}

function topPath(g: Geo, o: TopOptions): string {
  const grow = o.grow ?? 1.6;
  const steps = 12;
  const left: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = lerp(g.yShoulder, o.hemY, i / steps);
    left.push({ x: -torsoHW(g, y, grow), y });
  }
  const right = left.map((q) => ({ x: -q.x, y: q.y })).reverse();
  const depth = o.neckDepth ?? g.torsoLen * 0.05;
  const neck = o.vNeck
    ? `${L(0, g.yShoulder + depth * 3.2)}${L(left[0].x, left[0].y)}`
    : Q(0, g.yShoulder + depth * 2, left[0].x, left[0].y);
  return (
    M(left[0].x, left[0].y) + smoothOpen(left, 1 / 6, false) +
    Q(0, o.hemY + (o.bow ?? g.torsoLen * 0.03), right[0].x, right[0].y) +
    smoothOpen(right, 1 / 6, false) + neck + 'Z'
  );
}

export function bowSvg(ctx: Ctx, x: number, y: number, s: number, color: string): string {
  const { g } = ctx;
  const line = outline(color);
  const loops =
    path(`${M(x, y)}${C(x - s * 1.6, y - s * 1.2, x - s * 1.9, y + s * 1.1, x, y)}Z`, { fill: color, stroke: line, 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round' }) +
    path(`${M(x, y)}${C(x + s * 1.6, y - s * 1.2, x + s * 1.9, y + s * 1.1, x, y)}Z`, { fill: color, stroke: line, 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round' });
  const knot = ellipse(x, y, s * 0.42, s * 0.42, { fill: lighten(color, 0.06), stroke: line, 'stroke-width': g.lw * 0.8 });
  return loops + knot;
}

export function topSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const c = p.topColor;
  const T = g.torsoLen;
  const yS = g.yShoulder;
  let out = '';

  switch (p.top) {
    case 'tshirt': {
      const hem = g.yCrotch - T * 0.12;
      const print = path(heartPath(0, yS + T * 0.34, Math.max(3, g.u * 0.045)), { fill: mix(c, '#ff7aa8', 0.55), opacity: 0.9 });
      out += cel(ctx, topPath(g, { hemY: hem }), c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside: print });
      break;
    }
    case 'hoodie': {
      const hem = g.yCrotch + T * 0.0;
      const px = torsoHW(g, yS + T * 0.7) * 0.62;
      const pocket = path(`${M(-px, yS + T * 0.66)}${L(px, yS + T * 0.66)}${L(px * 1.12, hem - T * 0.05)}${L(-px * 1.12, hem - T * 0.05)}Z`, {
        fill: shade(c, 0.5), stroke: shade(c, 1.5), 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round', opacity: 0.85,
      });
      const cords =
        stroke(ctx, `${M(-g.neckHW * 0.55, yS + T * 0.06)}${Q(-g.neckHW * 0.6, yS + T * 0.2, -g.neckHW * 0.5, yS + T * 0.3)}`, lighten(c, 0.2), g.lw * 1.1) +
        stroke(ctx, `${M(g.neckHW * 0.55, yS + T * 0.06)}${Q(g.neckHW * 0.6, yS + T * 0.2, g.neckHW * 0.5, yS + T * 0.3)}`, lighten(c, 0.2), g.lw * 1.1);
      out += cel(ctx, topPath(g, { hemY: hem, neckDepth: T * 0.035, grow: 2 }), c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside: pocket });
      // ribbed hem
      out += path(`${M(-torsoHW(g, hem - T * 0.05, 2), hem - T * 0.05)}${L(torsoHW(g, hem - T * 0.05, 2), hem - T * 0.05)}`, { stroke: shade(c, 1.4), 'stroke-width': g.lw * 0.8, opacity: 0.6 });
      out += cords;
      break;
    }
    case 'sailor': {
      const hem = yS + T * 0.78;
      out += cel(ctx, topPath(g, { hemY: hem, vNeck: true, neckDepth: T * 0.075, bow: T * 0.02 }), c, { dx: -g.lw * 2, dy: -g.lw * 0.5 });
      const collar = luminance(c) > 0.62 ? mix(c, '#3a4a8a', 0.72) : lighten(c, 0.5);
      const nk = g.neckHW * 1.35;
      const sh = g.shHW;
      const cd =
        M(-nk, yS - 1) + C(-sh * 0.55, yS - 1, -sh * 0.9, yS + T * 0.02, -sh * 0.9, yS + T * 0.1) +
        C(-sh * 0.8, yS + T * 0.22, -sh * 0.5, yS + T * 0.3, 0, yS + T * 0.42) +
        C(sh * 0.5, yS + T * 0.3, sh * 0.8, yS + T * 0.22, sh * 0.9, yS + T * 0.1) +
        C(sh * 0.9, yS + T * 0.02, sh * 0.55, yS - 1, nk, yS - 1) +
        L(0, yS + T * 0.27) + 'Z';
      const stripes = ctx.uid('stripe');
      out += `<clipPath id="${stripes}">${path(cd)}</clipPath>`;
      out += cel(ctx, cd, collar, { dx: -g.lw * 1.2, dy: -g.lw * 0.5 });
      out += group(
        stroke(ctx, `${M(-sh * 0.86, yS + T * 0.1)}${C(-sh * 0.75, yS + T * 0.2, -sh * 0.48, yS + T * 0.28, 0, yS + T * 0.38)}${C(sh * 0.48, yS + T * 0.28, sh * 0.75, yS + T * 0.2, sh * 0.86, yS + T * 0.1)}`, '#ffffff', g.lw * 0.9, { opacity: 0.9 }),
        { 'clip-path': `url(#${stripes})` },
      );
      const ribbon = luminance(collar) < 0.5 ? '#ff8fb8' : '#e84a5f';
      out += bowSvg(ctx, 0, yS + T * 0.31, Math.max(3.5, g.u * 0.055), ribbon);
      break;
    }
    case 'sweater': {
      const hem = g.yCrotch + T * 0.02;
      const bandH = T * 0.06;
      const band = shade(c, 0.7);
      let inside = path(
        `${M(-torsoHW(g, hem, 4), hem - bandH)}${L(torsoHW(g, hem, 4), hem - bandH)}${L(torsoHW(g, hem, 4), hem + 4)}${L(-torsoHW(g, hem, 4), hem + 4)}Z`,
        { fill: band },
      );
      for (let x = -0.8; x <= 0.81; x += 0.2) {
        inside += stroke(ctx, `${M(torsoHW(g, hem, 0) * x, hem - bandH)}${L(torsoHW(g, hem, 0) * x, hem)}`, shade(c, 1.5), g.lw * 0.6, { opacity: 0.5 });
      }
      // knit stripes
      inside += stroke(ctx, `${M(-torsoHW(g, yS + T * 0.45, 3), yS + T * 0.45)}${L(torsoHW(g, yS + T * 0.45, 3), yS + T * 0.45)}`, lighten(c, 0.14), g.lw * 1.3, { opacity: 0.8 });
      out += cel(ctx, topPath(g, { hemY: hem, neckDepth: T * 0.015, grow: 2 }), c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside });
      // turtleneck collar
      const ch = Math.max(g.u * 0.07, 5);
      const cw = g.neckHW * 1.28;
      out += cel(ctx, M(-cw, yS - ch) + Q(0, yS - ch - 1.5, cw, yS - ch) + L(cw * 1.08, yS + 2) + Q(0, yS + 4, -cw * 1.08, yS + 2) + 'Z', band, { dx: -g.lw, dy: -g.lw * 0.4 });
      break;
    }
    case 'dress': {
      const yW = waistY(g) - g.torsoLen * 0.03;
      const hemY = g.yCrotch + g.legLen * 0.42;
      const hemHW = g.hipHW * 1.12 + g.u * 0.16;
      const hipY = g.yShoulder + T * 0.9;
      const left: Pt[] = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const y = lerp(yS, yW, i / steps);
        left.push({ x: -torsoHW(g, y, 1.6), y });
      }
      const sk: Pt[] = [{ x: -(torsoHW(g, yW, 1.6) + 0.5), y: yW }, { x: -(g.hipHW + 2.5), y: hipY }, { x: -hemHW, y: hemY }];
      const skR = sk.map((q) => ({ x: -q.x, y: q.y })).reverse();
      const rightB = left.map((q) => ({ x: -q.x, y: q.y })).reverse();
      const dip = g.u * 0.03;
      const scallops = 6;
      let hem = '';
      const w = (hemHW * 2) / scallops;
      for (let i = 0; i < scallops; i++) {
        const x0 = -hemHW + w * i;
        hem += Q(x0 + w / 2, hemY + dip * 2, x0 + w, hemY);
      }
      const d =
        M(left[0].x, left[0].y) + smoothOpen(left.concat(sk.slice(1)), 1 / 6, false) + hem +
        smoothOpen(skR.concat(rightB.slice(1)), 1 / 6, false) +
        Q(0, yS + T * 0.1, left[0].x, left[0].y) + 'Z';
      let inside = '';
      for (const f of [-0.62, -0.31, 0, 0.31, 0.62]) {
        inside += stroke(ctx, `${M(torsoHW(g, yW) * f, yW + 2)}${Q(hemHW * f * 0.8, (yW + hemY) / 2, hemHW * f * 1.02, hemY - 1)}`, shade(c, 1.3), g.lw * 0.8, { opacity: 0.5 });
      }
      // waist ribbon
      const rib = darken(mix(c, '#ff5f9a', 0.5), 0.02);
      inside += path(`${M(-torsoHW(g, yW, 3), yW - T * 0.03)}${L(torsoHW(g, yW, 3), yW - T * 0.03)}${L(torsoHW(g, yW, 3), yW + T * 0.04)}${L(-torsoHW(g, yW, 3), yW + T * 0.04)}Z`, { fill: rib });
      out += cel(ctx, d, c, { dx: -g.lw * 2.2, dy: -g.lw * 0.6, inside });
      out += bowSvg(ctx, 0, yW + T * 0.005, Math.max(3.5, g.u * 0.05), lighten(rib, 0.08));
      break;
    }
  }
  return out;
}

// ---- hood (drawn behind the neck) ---------------------------------------------------------------

export function hoodBackSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  if (p.top !== 'hoodie') return '';
  const w = g.neckHW * 2.1;
  const d = M(-w, g.yShoulder + 2) + C(-w * 1.1, g.yShoulder - g.u * 0.2, -w * 0.5, g.yChin - g.u * 0.05, 0, g.yChin - g.u * 0.02) +
    C(w * 0.5, g.yChin - g.u * 0.05, w * 1.1, g.yShoulder - g.u * 0.2, w, g.yShoulder + 2) + Q(0, g.yShoulder + g.torsoLen * 0.1, -w, g.yShoulder + 2) + 'Z';
  return cel(ctx, d, shade(p.topColor, 0.6), { dx: -g.lw, dy: -g.lw * 0.3 });
}

// ---- sleeves ----------------------------------------------------------------------------------

export function sleevesSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const c = p.topColor;
  let out = '';
  const r = g.armR;
  for (const side of [-1, 1] as const) {
    switch (p.top) {
      case 'tshirt':
        out += cel(ctx, armSlice(ctx, side, -0.08, 0.36, 1.5, r * 0.18), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3 });
        break;
      case 'sailor': {
        out += cel(ctx, armSlice(ctx, side, -0.08, 0.36, 1.5, r * 0.18), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3 });
        const collar = luminance(c) > 0.62 ? mix(c, '#3a4a8a', 0.72) : lighten(c, 0.5);
        out += flat(ctx, armSlice(ctx, side, 0.29, 0.36, 1.5, r * 0.18), collar, { lineW: g.lw * 0.8 });
        break;
      }
      case 'dress':
        out += cel(ctx, armSlice(ctx, side, -0.1, 0.27, r * 0.22, r * 0.2), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3 });
        out += flat(ctx, armSlice(ctx, side, 0.23, 0.28, r * 0.2, r * 0.2), shade(c, 0.8), { lineW: g.lw * 0.8 });
        break;
      case 'hoodie':
      case 'sweater': {
        out += cel(ctx, armSlice(ctx, side, -0.08, 0.93, 1.5, r * 0.28), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3 });
        out += cel(ctx, armSlice(ctx, side, 0.86, 0.96, 1.5, r * 0.12), shade(c, 0.7), { dx: -g.lw * 0.8, dy: -g.lw * 0.2 });
        break;
      }
    }
  }
  return out;
}

