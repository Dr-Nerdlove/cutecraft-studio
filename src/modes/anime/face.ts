import { darken, mix, saturate } from '../../core/color';
import { C, L, M, Q, circle, ellipse, group, lerp, path } from '../../core/svg';
import { cel, stroke, type Ctx } from './context';
import { faceLayout } from './layout';

/** Ears sit behind the face. */
export function earsSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  let out = '';
  for (const s of [-1, 1] as const) {
    const x = s * g.hw * 0.97;
    out += ellipse(x, lo.eyeY + g.u * 0.02, g.hw * 0.13, g.u * 0.075, { fill: p.skin, stroke: ctx.skinLine, 'stroke-width': g.lw });
    out += ellipse(x + s * g.hw * 0.01, lo.eyeY + g.u * 0.025, g.hw * 0.055, g.u * 0.04, { fill: ctx.skinShade, opacity: 0.8 });
  }
  return out;
}

export function faceBaseSvg(ctx: Ctx): string {
  const { g } = ctx;
  return (
    `<clipPath id="${ctx.faceClip}">${path(ctx.faceD)}</clipPath>` +
    cel(ctx, ctx.faceD, ctx.skin, { line: ctx.skinLine, shadeColor: ctx.skinShade, dx: -g.lw * 1.2, dy: -g.lw * 1.2 })
  );
}

export function blushSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const a = p.blush / 100;
  if (a <= 0.01) return '';
  const lo = faceLayout(ctx);
  const id = ctx.uid('blush');
  const defs = `<radialGradient id="${id}"><stop offset="0" stop-color="${p.blushColor}" stop-opacity="${(0.25 + 0.7 * a).toFixed(2)}"/><stop offset="0.6" stop-color="${p.blushColor}" stop-opacity="${(0.15 + 0.5 * a).toFixed(2)}"/><stop offset="1" stop-color="${p.blushColor}" stop-opacity="0"/></radialGradient>`;
  let out = defs;
  for (const s of [-1, 1] as const) {
    const cx = s * lo.eyeDX * 1.04;
    const cy = lo.eyeY + lo.eyeH * 0.58;
    out += ellipse(cx, cy, lo.eyeW * 0.62, lo.eyeW * 0.33, { fill: `url(#${id})` });
    if (a > 0.6) {
      const hatch = darken(saturate(p.blushColor, 0.1), 0.12);
      for (let i = -1; i <= 1; i++) {
        const x = cx + i * lo.eyeW * 0.15;
        out += stroke(ctx, `${M(x - lo.eyeW * 0.04, cy + lo.eyeW * 0.07)}${L(x + lo.eyeW * 0.05, cy - lo.eyeW * 0.06)}`, hatch, Math.max(0.7, g.lw * 0.6), { opacity: 0.55 * a });
      }
    }
  }
  return out;
}

export function frecklesSvg(ctx: Ctx): string {
  const { p } = ctx;
  if (!p.freckles) return '';
  const lo = faceLayout(ctx);
  const col = mix(ctx.skinShade, '#b0623e', 0.45);
  const r = Math.max(0.75, lo.eyeW * 0.03);
  const spots: Array<[number, number]> = [[-0.12, 0.62], [0.2, 0.7], [0.5, 0.6], [0.34, 0.86], [0.02, 0.88], [0.62, 0.84]];
  let out = '';
  for (const s of [-1, 1] as const) {
    for (const [dx, dy] of spots) {
      out += circle(s * (lo.eyeDX + dx * lo.eyeW - lo.eyeW * 0.1), lo.eyeY + dy * lo.eyeW * 0.95 + lo.eyeH * 0.1, r, { fill: col, opacity: 0.8 });
    }
  }
  return out;
}

export function noseSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  if (p.nose === 'none') return '';
  const lo = faceLayout(ctx);
  const a = Math.max(1.4, lo.eyeW * 0.1);
  const col = mix(ctx.skinLine, '#a85a52', 0.3);
  if (p.nose === 'dot') {
    return ellipse(0, lo.noseY, a * 0.55, a * 0.4, { fill: col, opacity: 0.75 });
  }
  return stroke(ctx, `${M(-a * 0.2, lo.noseY - a * 0.5)}${Q(a * 0.7, lo.noseY + a * 0.1, -a * 0.2, lo.noseY + a * 0.55)}`, col, Math.max(0.8, g.lw * 0.75), { opacity: 0.85 });
}

export function mouthSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  const w = lo.mouthW;
  const y = lo.mouthY;
  const lip = mix(ctx.skinLine, '#c2405c', 0.6);
  const inner = darken(mix(lip, '#5a1a2e', 0.5), 0.02);
  const sw = Math.max(0.9, g.lw * 0.95);
  switch (p.mouth) {
    case 'smile': {
      const d = `${M(-w / 2, y)}${Q(0, y + w * 0.42, w / 2, y)}`;
      return (
        stroke(ctx, d, lip, sw) +
        stroke(ctx, `${M(-w / 2, y)}${L(-w / 2 - w * 0.06, y - w * 0.07)}`, lip, sw * 0.8) +
        stroke(ctx, `${M(w / 2, y)}${L(w / 2 + w * 0.06, y - w * 0.07)}`, lip, sw * 0.8)
      );
    }
    case 'open': {
      const id = ctx.uid('mouth');
      const d = `${M(-w * 0.52, y - w * 0.02)}${Q(0, y + w * 0.12, w * 0.52, y - w * 0.02)}${C(w * 0.48, y + w * 0.62, -w * 0.48, y + w * 0.62, -w * 0.52, y - w * 0.02)}Z`;
      return (
        `<clipPath id="${id}">${path(d)}</clipPath>` +
        path(d, { fill: inner }) +
        group(ellipse(0, y + w * 0.52, w * 0.3, w * 0.2, { fill: '#ff8fa3' }) + path(`${M(-w * 0.4, y)}${Q(0, y + w * 0.12, w * 0.4, y)}${L(w * 0.34, y + w * 0.1)}${Q(0, y + w * 0.2, -w * 0.34, y + w * 0.1)}Z`, { fill: '#ffffff', opacity: 0.95 }), { 'clip-path': `url(#${id})` }) +
        path(d, { fill: 'none', stroke: lip, 'stroke-width': sw, 'stroke-linejoin': 'round' })
      );
    }
    case 'cat': {
      const d = `${M(-w * 0.5, y - w * 0.04)}${Q(-w * 0.26, y + w * 0.3, 0, y + w * 0.02)}${Q(w * 0.26, y + w * 0.3, w * 0.5, y - w * 0.04)}`;
      return stroke(ctx, d, lip, sw);
    }
    case 'o': {
      const rx = w * 0.2, ry = w * 0.26;
      const id = ctx.uid('mouth');
      return (
        `<clipPath id="${id}">${ellipse(0, y + ry * 0.4, rx, ry)}</clipPath>` +
        ellipse(0, y + ry * 0.4, rx, ry, { fill: inner }) +
        group(ellipse(0, y + ry * 1.05, rx * 0.8, ry * 0.5, { fill: '#ff8fa3' }), { 'clip-path': `url(#${id})` }) +
        ellipse(0, y + ry * 0.4, rx, ry, { fill: 'none', stroke: lip, 'stroke-width': sw })
      );
    }
    case 'pout': {
      return (
        stroke(ctx, `${M(-w * 0.3, y + w * 0.04)}${Q(-w * 0.15, y - w * 0.1, 0, y)}${Q(w * 0.15, y - w * 0.1, w * 0.3, y + w * 0.04)}`, lip, sw) +
        stroke(ctx, `${M(-w * 0.15, y + w * 0.16)}${Q(0, y + w * 0.24, w * 0.15, y + w * 0.16)}`, lip, sw * 0.8, { opacity: 0.8 })
      );
    }
    case 'fang': {
      const d = `${M(-w * 0.55, y)}${Q(0, y + w * 0.5, w * 0.55, y)}`;
      const fx = w * 0.27, fy = y + w * 0.2;
      return (
        stroke(ctx, d, lip, sw) +
        path(`${M(fx - w * 0.07, fy - w * 0.015)}${L(fx + w * 0.07, fy - w * 0.03)}${L(fx + w * 0.005, fy + w * 0.17)}Z`, { fill: '#ffffff', stroke: lip, 'stroke-width': sw * 0.6, 'stroke-linejoin': 'round' }) +
        stroke(ctx, `${M(w * 0.55, y)}${L(w * 0.6, y - w * 0.07)}`, lip, sw * 0.8)
      );
    }
  }
}

export function browsSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  const bw = lo.eyeW * 0.92;
  const h = bw * 0.38;
  const sw = Math.min(7, Math.max(0.9, g.headW * lerp(0.011, 0.03, p.browThickness / 100)));
  let out = '';
  for (const s of [-1, 1] as const) {
    const cx = s * (lo.eyeDX + lo.eyeW * 0.02);
    const X = (ox: number): number => cx + s * ox;
    let d = '';
    switch (p.brow) {
      case 'soft':
        d = `${M(X(-bw / 2), lo.browY + h * 0.15)}${Q(X(0), lo.browY - h * 0.55, X(bw / 2), lo.browY + h * 0.2)}`;
        break;
      case 'straight':
        d = `${M(X(-bw / 2), lo.browY + h * 0.02)}${Q(X(0), lo.browY - h * 0.06, X(bw / 2), lo.browY - h * 0.02)}`;
        break;
      case 'raised':
        d = `${M(X(-bw / 2), lo.browY + h * 0.1)}${Q(X(-bw * 0.05), lo.browY - h * 1.05, X(bw / 2), lo.browY + h * 0.1)}`;
        break;
      case 'worried':
        d = `${M(X(-bw / 2), lo.browY - h * 0.5)}${Q(X(0), lo.browY - h * 0.05, X(bw / 2), lo.browY + h * 0.45)}`;
        break;
    }
    out += stroke(ctx, d, p.browColor, sw, { opacity: 0.92 });
  }
  return out;
}

