import { darken, lighten, mix, outline } from '../../core/color';
import { C, L, M, Q, circle, group, heartPath, path, smoothClosed, type Pt } from '../../core/svg';
import { cel, flat, stroke, type Ctx } from './context';
import { bowSvg } from './outfit';
import { faceLayout } from './layout';
import type { AnimeParams } from './schema';

function earShape(bx: number, by: number, tx: number, ty: number, w: number): string {
  return (
    M(bx - w, by) + C(bx - w * 1.25, by + (ty - by) * 0.45, tx - w * 0.95, ty + (by - ty) * 0.12, tx, ty) +
    C(tx + w * 0.95, ty + (by - ty) * 0.12, bx + w * 1.25, by + (ty - by) * 0.45, bx + w, by) + 'Z'
  );
}

/** Ears sit between the face and the hair so the hair grows around their base. */
export function headBehindSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const c = p.headAccColor;
  const hw = g.hw, u = g.u, top = g.yTop - g.accLift;
  let out = '';
  if (p.headAcc === 'cat') {
    for (const s of [-1, 1] as const) {
      const outer: Pt = { x: s * hw * 1.0, y: top + u * 0.26 };
      const apex: Pt = { x: s * hw * 0.74, y: top - u * 0.27 };
      const inner: Pt = { x: s * hw * 0.16, y: top + u * 0.04 };
      const d = `${M(outer.x, outer.y)}${Q(s * hw * 1.08, top - u * 0.02, apex.x, apex.y)}${Q(s * hw * 0.34, top - u * 0.12, inner.x, inner.y)}Z`;
      const d2 = `${M(s * hw * 0.88, top + u * 0.17)}${Q(s * hw * 0.93, top - u * 0.02, s * hw * 0.74, top - u * 0.17)}${Q(s * hw * 0.42, top - u * 0.06, s * hw * 0.3, top + u * 0.05)}Z`;
      out += cel(ctx, d, c, { dx: -g.lw * 1.2, dy: -g.lw * 0.6 });
      out += flat(ctx, d2, mix(lighten(c, 0.1), '#ffb3c9', 0.55), { line: null });
    }
  } else if (p.headAcc === 'bunny') {
    for (const s of [-1, 1] as const) {
      const bx = s * hw * 0.42, by = top + u * 0.1;
      const tx = s * hw * 0.78, ty = top - u * 0.64;
      const w = hw * 0.25;
      out += cel(ctx, earShape(bx, by, tx, ty, w), c, { dx: -g.lw * 1.3, dy: -g.lw * 0.5 });
      out += flat(ctx, earShape(bx + s * hw * 0.02, by - u * 0.02, tx - s * hw * 0.01, ty + u * 0.1, w * 0.52), mix(lighten(c, 0.1), '#ffb3c9', 0.6), { line: null });
    }
  }
  return out;
}

export function headFrontSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const c = p.headAccColor;
  const hw = g.hw, u = g.u, top = g.yTop - g.accLift;
  switch (p.headAcc) {
    case 'bow':
      return group(bowSvg(ctx, 0, 0, hw * 0.24, c), { transform: `translate(${-hw * 0.6} ${top + u * 0.1}) rotate(-18)` });
    case 'flower': {
      const cx = -hw * 0.58, cy = top + u * 0.13;
      const r = hw * 0.17;
      let out = '';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        out += circle(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, r * 0.68, { fill: c, stroke: outline(c), 'stroke-width': g.lw * 0.8 });
      }
      out += circle(cx, cy, r * 0.5, { fill: '#ffe27a', stroke: darken('#ffe27a', 0.3), 'stroke-width': g.lw * 0.7 });
      return out;
    }
    case 'crown': {
      const w = hw * 0.5, h = u * 0.2, yb = top + u * 0.02;
      const d = `${M(-w, yb)}${L(-w * 1.02, yb - h * 0.75)}${L(-w * 0.5, yb - h * 0.38)}${L(0, yb - h)}${L(w * 0.5, yb - h * 0.38)}${L(w * 1.02, yb - h * 0.75)}${L(w, yb)}${Q(0, yb + h * 0.2, -w, yb)}Z`;
      let out = cel(ctx, d, c, { dx: -g.lw, dy: -g.lw * 0.6 });
      const jewel = '#ff7aa8';
      for (const [x, y] of [[-w * 1.02, yb - h * 0.75], [0, yb - h], [w * 1.02, yb - h * 0.75]] as const) {
        out += circle(x, y, h * 0.1, { fill: lighten(c, 0.2), stroke: outline(c), 'stroke-width': g.lw * 0.7 });
      }
      out += path(heartPath(0, yb + h * 0.02, h * 0.1), { fill: jewel });
      return out;
    }
    case 'beret': {
      const l: Pt = { x: -hw * 1.05, y: top + u * 0.22 };
      const r: Pt = { x: hw * 1.02, y: top + u * 0.16 };
      const d =
        M(l.x, l.y) + C(l.x - hw * 0.1, top - u * 0.1, -hw * 0.5, top - u * 0.26, hw * 0.1, top - u * 0.25) +
        C(hw * 0.7, top - u * 0.24, hw * 1.14, top - u * 0.04, r.x, r.y) + Q(0, top + u * 0.29, l.x, l.y) + 'Z';
      let out = cel(ctx, d, c, {
        dx: -g.lw * 2, dy: -g.lw * 1.2,
        inside: stroke(ctx, `${M(-hw * 0.7, top - u * 0.02)}${Q(-hw * 0.3, top - u * 0.18, hw * 0.1, top - u * 0.2)}`, lighten(c, 0.2), u * 0.04, { opacity: 0.5 }),
      });
      out += circle(hw * 0.1, top - u * 0.25, hw * 0.075, { fill: darken(c, 0.08), stroke: outline(c), 'stroke-width': g.lw * 0.8 });
      return out;
    }
    default:
      return '';
  }
}

type Lens = { d: string; outer: number; inner: number };

/** Closed smooth outline through points given in lens units (x: + = outer side, y: + = down). */
function lensFrom(cx: number, cy: number, R: number, s: number, pts: ReadonlyArray<readonly [number, number]>): string {
  return smoothClosed(pts.map(([x, y]) => ({ x: cx + s * x * R, y: cy + y * R })));
}

function roundedRect(cx: number, cy: number, hw: number, hh: number, r: number): string {
  return (
    M(cx - hw + r, cy - hh) + L(cx + hw - r, cy - hh) + Q(cx + hw, cy - hh, cx + hw, cy - hh + r) +
    L(cx + hw, cy + hh - r) + Q(cx + hw, cy + hh, cx + hw - r, cy + hh) + L(cx - hw + r, cy + hh) +
    Q(cx - hw, cy + hh, cx - hw, cy + hh - r) + L(cx - hw, cy - hh + r) + Q(cx - hw, cy - hh, cx - hw + r, cy - hh) + 'Z'
  );
}

/** Lens outline for one side (s = -1 left, +1 right); outer/inner = horizontal reach in units of R. */
function lensShape(kind: Exclude<AnimeParams['glasses'], 'none'>, cx: number, cy: number, R: number, s: number): Lens {
  switch (kind) {
    case 'round': case 'sunRound':
      return { d: ellipsePath(cx, cy, R, R), outer: 1, inner: 1 };
    case 'thin':
      return { d: ellipsePath(cx, cy, R * 0.98, R * 0.86), outer: 0.98, inner: 0.98 };
    case 'square':
      return { d: roundedRect(cx, cy + R * 0.04, R * 1.04, R * 0.74, R * 0.3), outer: 1.04, inner: 1.04 };
    case 'cateye':
      // the outer upper corner sweeps up into a little wing
      return {
        d: lensFrom(cx, cy, R, s, [[-0.98, -0.3], [-0.55, -0.66], [0.2, -0.72], [0.82, -0.86], [1.12, -0.82], [1.02, -0.2], [0.72, 0.5], [0.05, 0.7], [-0.68, 0.52]]),
        outer: 1.1, inner: 0.98,
      };
    case 'aviator':
      // teardrop lens, deepest on the outer side
      return {
        d: lensFrom(cx, cy, R, s, [[-0.98, -0.5], [-0.3, -0.72], [0.55, -0.7], [1.04, -0.42], [1.02, 0.2], [0.72, 0.78], [0.12, 0.92], [-0.6, 0.62], [-0.96, 0.08]]),
        outer: 1.04, inner: 0.98,
      };
    case 'heart': case 'sunHeart':
      return { d: heartPath(cx, cy - R * 0.02, R * 0.98), outer: 1.08, inner: 1.08 };
    case 'sunStar':
      return { d: fivePointStar(cx, cy + R * 0.06, R * 1.12, R * 0.62), outer: 1.06, inner: 1.06 };
  }
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `${M(cx - rx, cy)}A${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(cx + rx).toFixed(2)} ${cy.toFixed(2)}A${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(cx - rx).toFixed(2)} ${cy.toFixed(2)}Z`;
}

/** Five-pointed star with softened points. */
function fivePointStar(cx: number, cy: number, ro: number, ri: number): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? ri : ro;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return smoothClosed(pts, 1 / 14);
}

export function glassesSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  if (p.glasses === 'none') return '';
  const kind = p.glasses;
  const sun = kind === 'sunRound' || kind === 'aviator' || kind === 'sunHeart' || kind === 'sunStar';
  const lo = faceLayout(ctx);
  const R = Math.max(lo.eyeW * 0.72, lo.eyeH * 0.62);
  const frame = p.glassesColor;
  const frameLine = darken(frame, 0.18);
  const fw = Math.max(g.lw * 1.5, R * 0.1) * (kind === 'thin' || kind === 'aviator' ? 0.55 : 1);
  const cy = lo.eyeY + lo.eyeH * 0.02;
  let defs = '';
  let lensFill: Record<string, string | number> = { fill: '#ffffff', 'fill-opacity': 0.16 };
  if (sun) {
    // tinted lens, darker at the top like real gradient sunglasses
    const id = ctx.uid('lens');
    const lc = p.lensColor;
    defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${darken(lc, 0.22)}" stop-opacity="0.96"/>` +
      `<stop offset="1" stop-color="${lighten(lc, 0.12)}" stop-opacity="0.82"/></linearGradient></defs>`;
    lensFill = { fill: `url(#${id})` };
  }
  let out = defs;
  let inner = 1;
  for (const s of [-1, 1] as const) {
    const cx = s * lo.eyeDX;
    const lens = lensShape(kind, cx, cy, R, s);
    inner = lens.inner;
    out += path(lens.d, { ...lensFill, stroke: frame, 'stroke-width': fw, 'stroke-linejoin': 'round' });
    // a thin darker line inside the rim gives the frame some depth
    if (kind !== 'thin') out += path(lens.d, { fill: 'none', stroke: frameLine, 'stroke-width': fw * 0.25, opacity: 0.5 });
    // glint
    out += stroke(ctx, `${M(cx - R * 0.55, cy - R * 0.42)}${Q(cx - R * 0.35, cy - R * 0.66, cx - R * 0.05, cy - R * 0.72)}`, '#ffffff', fw * (sun ? 0.9 : 0.7), { opacity: sun ? 0.55 : 0.7 });
    if (sun) out += stroke(ctx, `${M(cx + R * 0.2, cy + R * 0.42)}${L(cx + R * 0.42, cy + R * 0.2)}`, '#ffffff', fw * 0.6, { opacity: 0.35 });
    // temple arm
    out += stroke(ctx, `${M(cx + s * R * lens.outer * 0.97, cy - R * 0.15)}${L(s * g.hw * 0.99, cy - R * 0.1)}`, frame, Math.max(fw, g.lw * 1.2) * 0.85);
  }
  const bx = lo.eyeDX - R * inner * 0.97;
  out += stroke(ctx, `${M(-bx, cy - R * 0.1)}${Q(0, cy - R * 0.38, bx, cy - R * 0.1)}`, frame, Math.max(fw, g.lw * 1.2) * 0.9);
  // aviators get the classic straight top bar
  if (kind === 'aviator') out += stroke(ctx, `${M(-bx, cy - R * 0.62)}${L(bx, cy - R * 0.62)}`, frame, fw * 0.9);
  return out;
}
