import { darken, lighten, luminance, mix, outline, shade } from '../../core/color';
import {
  C, L, M, Q, ellipse, group, heartPath, lerp, path, smoothOpen, type Pt,
} from '../../core/svg';
import { SH_F, armPoint, armSlice, edgeDown, edgeUp, legAt, shoulderAt, shoulderGeo } from './body';
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
  let folds = '';
  if (pleats) {
    const top = torsoHW(g, yW, 1.6);
    for (const f of [-0.66, -0.33, 0, 0.33, 0.66]) {
      folds += stroke(ctx, `${M(top * f * 0.9, yW + g.torsoLen * 0.06)}${Q(hemHW * f * 0.85, (yW + hemY) / 2, hemHW * f * 1.02, hemY - 1)}`, shade(color, 1.4), g.lw * 2.6, { opacity: 0.38 });
    }
    inside = lightSide(ctx, color, true) + soft(ctx, folds);
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
  inside = lightSide(ctx, c, true) + inside;
  return cel(ctx, pantsPath(g, tEnd, 1.5, flare), c, { dx: -g.lw * 1.5, dy: -g.lw * 0.4, inside });
}

// ---- tops -------------------------------------------------------------------------------------

/** Garments sit this much outside the skin; sleeves hug the arm with the same small growth. */
const RG = 1.2;

interface TopOptions {
  hemY: number;
  grow?: number;
  neckDepth?: number;
  vNeck?: boolean;
  bow?: number;
  /** Where the neckline starts along the shoulder line (0 = at the neck, larger = wider scoop). */
  tN?: number;
}

/** Neckline: the left start point and the curve from the right end back to it. */
function neckCurve(g: Geo, o: TopOptions): { nl: Pt; nr: Pt; seg: string } {
  const nl = shoulderGeo(g, -1, RG, o.grow ?? 1.6, o.tN ?? 0).b[0];
  const nr = { x: -nl.x, y: nl.y };
  const depth = o.neckDepth ?? g.torsoLen * 0.05;
  const seg = o.vNeck ? `${L(0, g.yShoulder + depth * 3.2)}${L(nl.x, nl.y)}` : Q(0, g.yShoulder + depth * 2, nl.x, nl.y);
  return { nl, nr, seg };
}

function topPath(g: Geo, o: TopOptions): string {
  const grow = o.grow ?? 1.6;
  const tN = o.tN ?? 0;
  const { nl, seg } = neckCurve(g, o);
  const hw = torsoHW(g, o.hemY, grow);
  return (
    M(nl.x, nl.y) + edgeDown(g, RG, grow, tN, o.hemY) +
    Q(0, o.hemY + (o.bow ?? g.torsoLen * 0.03), hw, o.hemY) +
    edgeUp(g, RG, grow, tN, o.hemY) + seg + 'Z'
  );
}

/** Light from the upper left: a lighter garment side and a deeper shadow side on the right. */
function lightSide(ctx: Ctx, c: string, horizontal = false): string {
  const { g } = ctx;
  const id = ctx.uid('fls');
  const sh = horizontal ? Math.max(g.shHW, g.hipHW) : g.shHW;
  const yS = g.yShoulder;
  const yEnd = horizontal ? yS - g.torsoLen * 0.05 : yS + g.torsoLen * 0.6;
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(-sh * 1.1).toFixed(1)}" y1="${(yS - g.torsoLen * 0.05).toFixed(1)}" x2="${(sh * 1.25).toFixed(1)}" y2="${yEnd.toFixed(1)}">` +
    `<stop offset="0" stop-color="${lighten(c, 0.12)}" stop-opacity="0.7"/><stop offset="0.45" stop-color="${c}" stop-opacity="0"/>` +
    `<stop offset="0.6" stop-color="${foldColor(c)}" stop-opacity="0"/><stop offset="1" stop-color="${foldColor(c)}" stop-opacity="0.5"/></linearGradient>` +
    `<rect x="${(-sh * 3).toFixed(1)}" y="${(yS - g.u * 0.3).toFixed(1)}" width="${(sh * 6).toFixed(1)}" height="${(g.torsoLen * 2.4).toFixed(1)}" fill="url(#${id})"/>`
  );
}

/** Colour of fold shadows: darker, slightly cool and less saturated than the cel shade. */
const foldColor = (c: string): string => mix(shade(c, 1.4), '#7a5a86', 0.28);

/** One blurred group (a single filter pass for all its strokes). */
const soft = (ctx: Ctx, inner: string): string => (inner ? group(inner, { filter: `url(#${ctx.soft})` }) : '');

const LONG_HAIR = ['long', 'wavy', 'ponytail', 'twintails', 'sidetail', 'braid', 'hime', 'drills', 'bob'];

/**
 * Painted shading for the upper body of a garment: light and shadow side, soft folds from the
 * armpits and at the waist, highlights on the lit side, the shadow of chin and hair near the neck.
 * `neckD` is the neckline curve (shadow along it); everything is meant to be clipped by `cel`.
 */
function fabricShade(ctx: Ctx, c: string, o: { neckD?: string; waist?: boolean } = {}): string {
  const { g, p } = ctx;
  const T = g.torsoLen, yS = g.yShoulder;
  const sL = shoulderGeo(g, -1, RG, 0);
  const cx = Math.abs(sL.ctr.x), cy = sL.ctr.y, R = sL.R;
  const dk = foldColor(c);
  const lt = lighten(c, 0.13);
  const W = g.lw * 3.2;
  let dark = '';
  let light = '';
  for (const s of [-1, 1] as const) {
    // folds running from the armpit across the chest
    const ax = s * (cx - R * 1.05), ay = cy + R * 1.0;
    dark += stroke(ctx, `${M(ax, ay)}${Q(s * cx * 0.62, cy + T * 0.13, s * cx * 0.36, cy + T * 0.27)}`, dk, W * 1.4, { opacity: 0.55 });
    dark += stroke(ctx, `${M(ax - s * 1.5, ay + T * 0.07)}${Q(s * cx * 0.66, cy + T * 0.2, s * cx * 0.5, cy + T * 0.33)}`, dk, W * 1.1, { opacity: 0.4 });
    // dark crease right in the armpit
    dark += ellipse(s * (cx - R * 0.8), ay + R * 0.3, R * 0.5, R * 0.9, { fill: dk, opacity: 0.5 });
    if (o.waist !== false) {
      const wy = waistY(g), wh = g.waistHW;
      dark += stroke(ctx, `${M(s * wh * 0.96, wy - T * 0.03)}${Q(s * wh * 0.62, wy + T * 0.01, s * wh * 0.28, wy + T * 0.015)}`, dk, W * 1.2, { opacity: 0.42 });
    }
    // the shoulder under the hair is in the shade
    const sh = shoulderGeo(g, s, RG, 0);
    const a0 = shoulderAt(sh, 0.12), a1 = shoulderAt(sh, 0.55), a2 = shoulderAt(sh, 0.95);
    const hairK = LONG_HAIR.includes(p.hairBack as string) ? 1 : 0.5;
    dark += stroke(ctx, `${M(a0.x, a0.y + g.u * 0.05)}${Q(a1.x, a1.y + g.u * 0.07, a2.x, a2.y + g.u * 0.07)}`, dk, g.u * 0.12, { opacity: 0.42 * hairK });
  }
  // highlights on the lit (left) side
  light += stroke(ctx, `${M(-cx * 0.5, yS + T * 0.11)}${Q(-cx * 0.8, yS + T * 0.17, -cx * 0.9, yS + T * 0.32)}`, lt, W * 1.5, { opacity: 0.6 });
  light += stroke(ctx, `${M(-cx * 0.62, yS + T * 0.42)}${Q(-cx * 0.66, yS + T * 0.52, -g.waistHW * 0.9, yS + T * 0.6)}`, lt, W * 1.2, { opacity: 0.45 });
  const h0 = shoulderAt(sL, 0.4), h1 = shoulderAt(sL, 0.85);
  light += stroke(ctx, `${M(h0.x, h0.y + 2.2)}${L(h1.x, h1.y + 2.6)}`, lt, W * 1.2, { opacity: 0.55 });
  // shadow of the chin and head on the chest, and along the neckline
  dark += ellipse(g.u * 0.02, yS + T * 0.035, g.neckHW * 2.4, g.u * 0.09, { fill: mix(foldColor(c), '#5a3a60', 0.35), opacity: 0.5 });
  if (o.neckD) dark += path(o.neckD, { fill: 'none', stroke: dk, 'stroke-width': W * 1.5, opacity: 0.55, transform: `translate(0 ${(g.lw * 1.6).toFixed(2)})` });
  return lightSide(ctx, c) + soft(ctx, dark) + soft(ctx, light);
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
  const neckPath = (o: TopOptions): string => {
    const { nr, seg } = neckCurve(g, o);
    return M(nr.x, nr.y) + seg;
  };

  switch (p.top) {
    case 'tshirt': {
      const hem = g.yCrotch - T * 0.12;
      const o: TopOptions = { hemY: hem };
      const print = path(heartPath(0, yS + T * 0.34, Math.max(3, g.u * 0.045)), { fill: mix(c, '#ff7aa8', 0.55), opacity: 0.85 });
      out += cel(ctx, topPath(g, o), c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside: fabricShade(ctx, c, { neckD: neckPath(o) }) + print });
      break;
    }
    case 'hoodie': {
      const hem = g.yCrotch + T * 0.0;
      const o: TopOptions = { hemY: hem, neckDepth: T * 0.035, grow: 2 };
      const px = torsoHW(g, yS + T * 0.7) * 0.62;
      const pocket = path(`${M(-px, yS + T * 0.66)}${L(px, yS + T * 0.66)}${L(px * 1.12, hem - T * 0.05)}${L(-px * 1.12, hem - T * 0.05)}Z`, {
        fill: shade(c, 0.5), stroke: shade(c, 1.5), 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round', opacity: 0.6,
      });
      const cords =
        stroke(ctx, `${M(-g.neckHW * 0.55, yS + T * 0.06)}${Q(-g.neckHW * 0.6, yS + T * 0.2, -g.neckHW * 0.5, yS + T * 0.3)}`, lighten(c, 0.2), g.lw * 1.1) +
        stroke(ctx, `${M(g.neckHW * 0.55, yS + T * 0.06)}${Q(g.neckHW * 0.6, yS + T * 0.2, g.neckHW * 0.5, yS + T * 0.3)}`, lighten(c, 0.2), g.lw * 1.1);
      out += cel(ctx, topPath(g, o), c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside: fabricShade(ctx, c, { neckD: neckPath(o) }) + pocket });
      // ribbed hem
      out += path(`${M(-torsoHW(g, hem - T * 0.05, 2), hem - T * 0.05)}${L(torsoHW(g, hem - T * 0.05, 2), hem - T * 0.05)}`, { stroke: shade(c, 1.4), 'stroke-width': g.lw * 0.8, opacity: 0.5 });
      out += cords;
      break;
    }
    case 'sailor': {
      const hem = yS + T * 0.78;
      const o: TopOptions = { hemY: hem, vNeck: true, neckDepth: T * 0.075, bow: T * 0.02, tN: 0.12 };
      const topD = topPath(g, o);
      out += cel(ctx, topD, c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside: fabricShade(ctx, c) });
      const collar = luminance(c) > 0.62 ? mix(c, '#3a4a8a', 0.72) : lighten(c, 0.5);
      // collar: follows the shoulder line, then falls diagonally to the V tip
      const sl = shoulderGeo(g, -1, RG + 0.8, 2.4);
      const pts = [0, 0.3, 0.6, 0.8, 0.93].map((t) => shoulderAt(sl, t));
      const S = pts[pts.length - 1];
      const sh = g.shHW;
      const rp = pts.map((q) => ({ x: -q.x, y: q.y })).reverse();
      const cd =
        M(pts[0].x, pts[0].y) + smoothOpen(pts, 1 / 6, false) +
        C(S.x - 1, S.y + T * 0.08, -sh * 0.55, yS + T * 0.3, 0, yS + T * 0.42) +
        C(sh * 0.55, yS + T * 0.3, -S.x + 1, S.y + T * 0.08, -S.x, S.y) +
        smoothOpen(rp, 1 / 6, false) + L(0, yS + T * 0.27) + 'Z';
      const stripes = ctx.uid('stripe');
      out += `<clipPath id="${stripes}">${path(cd)}</clipPath>`;
      // the collar throws a soft shadow onto the blouse
      const clipTop = ctx.uid('stclip');
      out += `<clipPath id="${clipTop}">${path(topD)}</clipPath>`;
      out += group(path(cd, { fill: mix(foldColor(c), '#5a3a60', 0.35), opacity: 0.4, transform: `translate(${g.lw.toFixed(2)} ${(g.lw * 2.6).toFixed(2)})`, filter: `url(#${ctx.soft})` }), { 'clip-path': `url(#${clipTop})` });
      out += cel(ctx, cd, collar, { dx: -g.lw * 1.2, dy: -g.lw * 0.5, inside: lightSide(ctx, collar) });
      out += group(
        stroke(ctx, `${M(S.x * 0.95, S.y + T * 0.03)}${C(-sh * 0.75, yS + T * 0.2, -sh * 0.48, yS + T * 0.28, 0, yS + T * 0.38)}${C(sh * 0.48, yS + T * 0.28, sh * 0.75, yS + T * 0.2, -S.x * 0.95, S.y + T * 0.03)}`, '#ffffff', g.lw * 0.9, { opacity: 0.85 }),
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
        inside += stroke(ctx, `${M(torsoHW(g, hem, 0) * x, hem - bandH)}${L(torsoHW(g, hem, 0) * x, hem)}`, shade(c, 1.5), g.lw * 0.6, { opacity: 0.4 });
      }
      // knit stripes
      inside += stroke(ctx, `${M(-torsoHW(g, yS + T * 0.45, 3), yS + T * 0.45)}${L(torsoHW(g, yS + T * 0.45, 3), yS + T * 0.45)}`, lighten(c, 0.14), g.lw * 1.3, { opacity: 0.6 });
      const o: TopOptions = { hemY: hem, neckDepth: T * 0.015, grow: 2 };
      out += cel(ctx, topPath(g, o), c, { dx: -g.lw * 2, dy: -g.lw * 0.5, inside: fabricShade(ctx, c) + inside });
      // turtleneck collar
      const ch = Math.max(g.u * 0.07, 5);
      const cw = g.neckHW * 1.28;
      const roll = ellipse(g.u * 0.01, yS + 3, cw * 0.9, ch * 0.3, { fill: shade(band, 1.5), opacity: 0.35, filter: `url(#${ctx.soft})` });
      out += cel(ctx, M(-cw, yS - ch) + Q(0, yS - ch - 1.5, cw, yS - ch) + L(cw * 1.08, yS + 2) + Q(0, yS + 4, -cw * 1.08, yS + 2) + 'Z', band, { dx: -g.lw, dy: -g.lw * 0.4, inside: roll });
      break;
    }
    case 'dress': {
      const yW = waistY(g) - T * 0.03;
      const hemY = g.yCrotch + g.legLen * 0.42;
      const hemHW = g.hipHW * 1.12 + g.u * 0.16;
      const hipY = yS + T * 0.9;
      const o: TopOptions = { hemY, grow: 1.6, tN: 0.38, neckDepth: T * 0.045 };
      const sk: Pt[] = [{ x: -(torsoHW(g, yW, 1.6) + 0.5), y: yW }, { x: -(g.hipHW + 2.5), y: hipY }, { x: -hemHW, y: hemY }];
      const dip = g.u * 0.03;
      const scallops = 6;
      let hem = '';
      const w = (hemHW * 2) / scallops;
      for (let i = 0; i < scallops; i++) {
        const x0 = -hemHW + w * i;
        hem += Q(x0 + w / 2, hemY + dip * 2, x0 + w, hemY);
      }
      // bodice edge down to the waist, then the skirt points
      const { nl, seg } = neckCurve(g, o);
      const d =
        M(nl.x, nl.y) + edgeDown(g, RG, 1.6, o.tN ?? 0, yW, sk) + hem +
        edgeUp(g, RG, 1.6, o.tN ?? 0, yW, sk) + seg + 'Z';
      let pleats = '';
      for (const f of [-0.62, -0.31, 0, 0.31, 0.62]) {
        pleats += stroke(ctx, `${M(torsoHW(g, yW) * f, yW + 2)}${Q(hemHW * f * 0.8, (yW + hemY) / 2, hemHW * f * 1.02, hemY - 1)}`, shade(c, 1.4), g.lw * 2.4, { opacity: 0.3 });
      }
      // waist ribbon
      const rib = darken(mix(c, '#ff5f9a', 0.5), 0.02);
      const ribbon = path(`${M(-torsoHW(g, yW, 3), yW - T * 0.03)}${L(torsoHW(g, yW, 3), yW - T * 0.03)}${L(torsoHW(g, yW, 3), yW + T * 0.04)}${L(-torsoHW(g, yW, 3), yW + T * 0.04)}Z`, { fill: rib });
      const inside = fabricShade(ctx, c, { neckD: neckPath(o), waist: false }) + soft(ctx, pleats) + ribbon;
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

/** Painted shading of a sleeve: lit left edge, shaded right edge, folds at the elbow of long sleeves. */
function sleeveShade(ctx: Ctx, side: -1 | 1, c: string, f1: number, elbow: boolean): string {
  const { g } = ctx;
  const r = g.armR;
  const dk = foldColor(c);
  const lt = lighten(c, 0.14);
  const P = (f: number, off: number): Pt => armPoint(g, side, f, off);
  const line = (fa: number, fb: number, off: number): string => `${M(P(fa, off).x, P(fa, off).y)}${L(P(fb, off).x, P(fb, off).y)}`;
  let dark = stroke(ctx, line(SH_F + 0.03, f1, r * 0.78), dk, r * 0.8, { opacity: 0.38 });
  // the cap is shaded where the arm leaves the torso (underarm)
  const ua = P(SH_F + 0.1, side * r * 0.2);
  dark += ellipse(ua.x, ua.y, r * 0.7, r * 0.55, { fill: dk, opacity: 0.25 });
  let light = stroke(ctx, line(SH_F, Math.min(f1, 0.4), -r * 0.52), lt, r * 0.42, { opacity: 0.42 });
  if (elbow) {
    for (const [f, a] of [[0.5, 0.34], [0.58, 0.24]] as const) {
      const p0 = P(f, -r * 1.1), p1 = P(f + 0.035, 0), p2 = P(f, r * 1.1);
      dark += stroke(ctx, `${M(p0.x, p0.y)}${Q(p1.x, p1.y, p2.x, p2.y)}`, dk, r * 0.5, { opacity: a });
    }
    const q0 = P(0.54, -r * 0.7), q1 = P(0.64, -r * 0.2);
    light += stroke(ctx, `${M(q0.x, q0.y)}${L(q1.x, q1.y)}`, lt, r * 0.35, { opacity: 0.3 });
  }
  return lightSide(ctx, c) + soft(ctx, dark) + soft(ctx, light);
}

export function sleevesSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const c = p.topColor;
  let out = '';
  const r = g.armR;
  for (const side of [-1, 1] as const) {
    switch (p.top) {
      case 'tshirt':
        out += cel(ctx, armSlice(ctx, side, SH_F, 0.36, RG, r * 0.14, false, true), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3, inside: sleeveShade(ctx, side, c, 0.36, false) });
        break;
      case 'sailor': {
        out += cel(ctx, armSlice(ctx, side, SH_F, 0.36, RG, r * 0.14, false, true), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3, inside: sleeveShade(ctx, side, c, 0.36, false) });
        const collar = luminance(c) > 0.62 ? mix(c, '#3a4a8a', 0.72) : lighten(c, 0.5);
        out += flat(ctx, armSlice(ctx, side, 0.29, 0.36, RG, r * 0.14), collar, { lineW: g.lw * 0.8 });
        break;
      }
      case 'dress':
        out += cel(ctx, armSlice(ctx, side, SH_F, 0.27, RG, r * 0.3, false, true), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3, inside: sleeveShade(ctx, side, c, 0.27, false) });
        out += flat(ctx, armSlice(ctx, side, 0.23, 0.28, RG, r * 0.3), shade(c, 0.8), { lineW: g.lw * 0.8 });
        break;
      case 'hoodie':
      case 'sweater': {
        out += cel(ctx, armSlice(ctx, side, SH_F, 0.93, RG, r * 0.2, false, true), c, { dx: -g.lw * 1.4, dy: -g.lw * 0.3, inside: sleeveShade(ctx, side, c, 0.93, true) });
        out += cel(ctx, armSlice(ctx, side, 0.86, 0.96, RG, r * 0.1), shade(c, 0.7), { dx: -g.lw * 0.8, dy: -g.lw * 0.2 });
        break;
      }
    }
  }
  return out;
}
