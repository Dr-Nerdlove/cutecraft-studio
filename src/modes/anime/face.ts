import { darken, lighten, mix } from '../../core/color';
import { C, L, M, Q, circle, ellipse, group, lerp, path, smoothOpen, type Pt } from '../../core/svg';
import { stroke, type Ctx } from './context';
import { faceLayout } from './layout';

/** Ears sit behind the face. */
export function earsSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  let out = '';
  for (const s of [-1, 1] as const) {
    const x = s * g.hw * 0.93;
    const y = lo.eyeY + g.u * 0.05;
    out += ellipse(x, y, g.hw * 0.1, g.u * 0.085, { fill: p.skin, stroke: ctx.skinLine, 'stroke-width': g.lw * 0.8, transform: `rotate(${s * 8} ${x} ${y})` });
    out += stroke(ctx, `${M(x + s * g.hw * 0.04, y - g.u * 0.05)}${Q(x + s * g.hw * 0.07, y, x + s * g.hw * 0.02, y + g.u * 0.045)}`, ctx.skinShade, g.lw * 1.4, { opacity: 0.8 });
  }
  return out;
}

export function faceBaseSvg(ctx: Ctx): string {
  const { g } = ctx;
  const lo = faceLayout(ctx);
  const side = ctx.uid('fside');
  const glow = ctx.uid('fglow');
  const shadow = darken(ctx.skinShade, 0.03);
  // light from the upper left: soft shadow along both sides (stronger on the right), a warm glow on
  // the cheeks and a gentle shade along the jaw
  const defs =
    `<linearGradient id="${side}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${shadow}" stop-opacity="0.55"/><stop offset="0.22" stop-color="${shadow}" stop-opacity="0"/>` +
    `<stop offset="0.7" stop-color="${shadow}" stop-opacity="0"/><stop offset="1" stop-color="${shadow}" stop-opacity="0.8"/></linearGradient>` +
    `<radialGradient id="${glow}"><stop offset="0" stop-color="${lighten(ctx.skin, 0.05)}" stop-opacity="0.9"/><stop offset="1" stop-color="${lighten(ctx.skin, 0.05)}" stop-opacity="0"/></radialGradient>`;
  const inside =
    path(ctx.faceD, { fill: `url(#${side})` }) +
    ellipse(g.hw * 0.25, g.yChin - g.u * 0.02, g.hw * 0.95, g.u * 0.16, { fill: shadow, opacity: 0.35, filter: `url(#${ctx.soft})` }) +
    ellipse(-g.hw * 0.12, lo.eyeY + g.u * 0.08, g.hw * 0.75, g.u * 0.3, { fill: `url(#${glow})` });
  return (
    `<defs>${defs}</defs>` +
    `<clipPath id="${ctx.faceClip}">${path(ctx.faceD)}</clipPath>` +
    path(ctx.faceD, { fill: ctx.skin }) +
    group(inside, { 'clip-path': `url(#${ctx.faceClip})` }) +
    path(ctx.faceD, { fill: 'none', stroke: ctx.skinLine, 'stroke-width': g.lw, 'stroke-linejoin': 'round', opacity: 0.8 })
  );
}

export function blushSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const a = p.blush / 100;
  if (a <= 0.01) return '';
  const lo = faceLayout(ctx);
  const id = ctx.uid('blush');
  const defs = `<radialGradient id="${id}"><stop offset="0" stop-color="${p.blushColor}" stop-opacity="${(0.12 + 0.5 * a).toFixed(2)}"/><stop offset="0.55" stop-color="${p.blushColor}" stop-opacity="${(0.06 + 0.3 * a).toFixed(2)}"/><stop offset="1" stop-color="${p.blushColor}" stop-opacity="0"/></radialGradient>`;
  let out = defs;
  for (const s of [-1, 1] as const) {
    // broad, soft blush on the cheekbones, a little below and outside the eyes
    out += ellipse(s * (lo.eyeDX + lo.eyeW * 0.15), lo.eyeY + g.u * 0.12, lo.eyeW * 0.95, g.u * 0.085, { fill: `url(#${id})` });
  }
  // a faint flush across the bridge of the nose
  out += ellipse(0, lerp(lo.eyeY, lo.noseY, 0.55), lo.eyeDX * 0.75, g.u * 0.045, { fill: `url(#${id})`, opacity: (0.7 * a).toFixed(2) });
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
  const a = g.headW * 0.045;
  const y = lo.noseY;
  const col = mix(ctx.skinLine, '#a85a52', 0.3);
  const tint = darken(mix(ctx.skinShade, '#b0605a', 0.25), 0.03);
  const sw = Math.max(0.5, g.lw * 0.8);
  const soft = `url(#${ctx.soft})`;
  // shared pieces of a semi-realistic nose (light from the upper left)
  const tipShadow = path(`${M(-a * 1.05, y + a * 0.15)}${Q(0, y + a * 1.1, a * 1.15, y + a * 0.1)}${Q(a * 0.1, y + a * 0.5, -a * 1.05, y + a * 0.15)}Z`, { fill: tint, opacity: 0.55, filter: soft });
  const highlight = ellipse(-a * 0.2, y - a * 0.2, a * 0.32, a * 0.26, { fill: '#ffffff', opacity: 0.45, filter: soft });
  const nostrils = (o: number): string =>
    stroke(ctx, `${M(-a * 0.95, y + a * 0.05)}${Q(-a * 0.95, y + a * 0.6, -a * 0.32, y + a * 0.52)}`, col, sw, { opacity: o * 0.8 }) +
    stroke(ctx, `${M(a * 0.95, y + a * 0.05)}${Q(a * 0.95, y + a * 0.6, a * 0.32, y + a * 0.52)}`, col, sw, { opacity: o });
  switch (p.nose) {
    case 'dot':
      return tipShadow + ellipse(0, y + a * 0.3, a * 0.35, a * 0.22, { fill: col, opacity: 0.6 });
    case 'button':
      return tipShadow + highlight + ellipse(-a * 0.5, y + a * 0.5, a * 0.17, a * 0.11, { fill: col, opacity: 0.7 }) + ellipse(a * 0.5, y + a * 0.5, a * 0.17, a * 0.11, { fill: col, opacity: 0.8 });
    case 'soft':
      return tipShadow + highlight + nostrils(0.45);
    case 'defined': {
      // shadow along the right side of the bridge, from between the eyes down to the tip
      const top = lo.eyeY + lo.eyeH * 0.2;
      const bridge = stroke(ctx, `${M(a * 0.45, top)}${C(a * 0.5, lerp(top, y, 0.4), a * 0.85, lerp(top, y, 0.75), a * 0.75, y - a * 0.2)}`, tint, a * 0.55, { opacity: 0.4, filter: soft });
      return bridge + tipShadow + highlight + nostrils(0.7);
    }
    case 'line':
      return tipShadow + stroke(ctx, `${M(a * 0.15, y - a * 1.2)}${Q(a * 0.9, y + a * 0.1, a * 0.05, y + a * 0.55)}`, col, sw, { opacity: 0.75 });
  }
}

/**
 * Closed lips: upper lip with a cupid's bow, fuller lower lip with a gloss highlight, a soft shadow
 * underneath. `lift` raises the corners (smile), `scale` changes the width, `tint` the colour strength.
 */
function lips(ctx: Ctx, w: number, y: number, lift: number, scale: number, tint: number): string {
  const { g } = ctx;
  const hw = w * 0.62 * scale;
  const base = mix(ctx.skin, '#d24a64', tint);
  const upperC = darken(base, 0.08);
  const lineC = mix(darken(base, 0.3), '#4a1424', 0.45);
  const cy = y - lift;
  const upper = `${M(-hw, cy)}${C(-hw * 0.6, y - w * 0.06, -w * 0.2, y - w * 0.22, -w * 0.1, y - w * 0.2)}${Q(0, y - w * 0.2, 0, y - w * 0.13)}${Q(0, y - w * 0.2, w * 0.1, y - w * 0.2)}${C(w * 0.2, y - w * 0.22, hw * 0.6, y - w * 0.06, hw, cy)}`;
  const mid = `${Q(0, y + w * 0.06 + lift * 0.4, -hw, cy)}`;
  const lower = `${M(-hw, cy)}${Q(0, y + w * 0.06 + lift * 0.4, hw, cy)}${C(hw * 0.7, y + w * 0.36, -hw * 0.7, y + w * 0.36, -hw, cy)}Z`;
  const gid = ctx.uid('lip');
  const defs = `<radialGradient id="${gid}" cx="0.45" cy="0.35" r="0.7"><stop offset="0" stop-color="${lighten(base, 0.07)}"/><stop offset="1" stop-color="${darken(base, 0.05)}"/></radialGradient>`;
  return (
    `<defs>${defs}</defs>` +
    ellipse(0, y + w * 0.42, hw * 0.55, w * 0.1, { fill: ctx.skinShade, opacity: 0.45, filter: `url(#${ctx.soft})` }) +
    path(lower, { fill: `url(#${gid})` }) +
    path(upper + mid + 'Z', { fill: upperC }) +
    stroke(ctx, `${M(-hw * 1.04, cy - lift * 0.1)}${Q(0, y + w * 0.06 + lift * 0.4, hw * 1.04, cy - lift * 0.1)}`, lineC, Math.max(0.5, g.lw * 0.9)) +
    ellipse(-w * 0.06, y + w * 0.16, w * 0.15, w * 0.04, { fill: '#ffffff', opacity: 0.55 }) +
    ellipse(-w * 0.12, y - w * 0.15, w * 0.05, w * 0.018, { fill: '#ffffff', opacity: 0.4 })
  );
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
    case 'smile':
      // closed, softly smiling lips
      return lips(ctx, w, y, w * 0.07, 0.95, 0.4);
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
    case 'pout':
      // small, full lips
      return lips(ctx, w * 0.9, y, -w * 0.02, 0.72, 0.6);
    case 'lips':
      return lips(ctx, w, y, 0, 1, 0.55);
    case 'smirk': {
      // one-sided smile: the right corner lifts more
      const d = `${M(-w * 0.45, y + w * 0.04)}${Q(-w * 0.05, y + w * 0.2, w * 0.2, y + w * 0.06)}${Q(w * 0.4, y - w * 0.02, w * 0.52, y - w * 0.14)}`;
      return (
        stroke(ctx, d, lip, sw) +
        stroke(ctx, `${M(w * 0.52, y - w * 0.14)}${L(w * 0.58, y - w * 0.2)}`, lip, sw * 0.8) +
        stroke(ctx, `${M(w * 0.5, y - w * 0.04)}${Q(w * 0.56, y - w * 0.08, w * 0.58, y - w * 0.04)}`, lip, sw * 0.5, { opacity: 0.5 })
      );
    }
    case 'grin': {
      // wide smile showing a row of teeth
      const id = ctx.uid('mouth');
      const hw = w * 0.62;
      const d = `${M(-hw, y - w * 0.02)}${Q(0, y + w * 0.04, hw, y - w * 0.02)}${C(hw * 0.8, y + w * 0.52, -hw * 0.8, y + w * 0.52, -hw, y - w * 0.02)}Z`;
      return (
        `<clipPath id="${id}">${path(d)}</clipPath>` +
        path(d, { fill: inner }) +
        group(
          path(`${M(-hw, y - w * 0.04)}${L(hw, y - w * 0.04)}${L(hw, y + w * 0.16)}${Q(0, y + w * 0.22, -hw, y + w * 0.16)}Z`, { fill: '#ffffff' }) +
          ellipse(0, y + w * 0.5, w * 0.3, w * 0.16, { fill: '#ff8fa3' }),
          { 'clip-path': `url(#${id})` },
        ) +
        path(d, { fill: 'none', stroke: lip, 'stroke-width': sw, 'stroke-linejoin': 'round' }) +
        stroke(ctx, `${M(-hw, y - w * 0.02)}${L(-hw - w * 0.05, y - w * 0.09)}`, lip, sw * 0.8) +
        stroke(ctx, `${M(hw, y - w * 0.02)}${L(hw + w * 0.05, y - w * 0.09)}`, lip, sw * 0.8)
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
  const bw = lo.eyeW * 1.12;
  const h = bw * 0.3;
  const th = Math.min(6, Math.max(0.8, g.headW * lerp(0.014, 0.036, p.browThickness / 100)));
  let out = '';
  for (const s of [-1, 1] as const) {
    const cx = s * (lo.eyeDX + lo.eyeW * 0.06);
    const X = (ox: number): number => cx + s * ox;
    // centre line: inner end, control point, outer end
    let a: Pt, c: Pt, b: Pt;
    switch (p.brow) {
      case 'soft': a = { x: X(-bw / 2), y: lo.browY + h * 0.2 }; c = { x: X(0), y: lo.browY - h * 0.55 }; b = { x: X(bw / 2), y: lo.browY + h * 0.35 }; break;
      case 'straight': a = { x: X(-bw / 2), y: lo.browY + h * 0.05 }; c = { x: X(0.05 * bw), y: lo.browY - h * 0.2 }; b = { x: X(bw / 2), y: lo.browY + h * 0.1 }; break;
      case 'raised': a = { x: X(-bw / 2), y: lo.browY + h * 0.15 }; c = { x: X(-bw * 0.05), y: lo.browY - h * 1.1 }; b = { x: X(bw / 2), y: lo.browY + h * 0.2 }; break;
      case 'worried': a = { x: X(-bw / 2), y: lo.browY - h * 0.45 }; c = { x: X(0), y: lo.browY - h * 0.1 }; b = { x: X(bw / 2), y: lo.browY + h * 0.5 }; break;
    }
    // tapered brow: full at the inner end, thin at the tail
    const top: Pt[] = [];
    const bot: Pt[] = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const q: Pt = { x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y };
      const w = th * (t < 0.15 ? lerp(0.75, 1, t / 0.15) : lerp(1, 0.18, (t - 0.15) / 0.85));
      top.push({ x: q.x, y: q.y - w * 0.55 });
      bot.push({ x: q.x, y: q.y + w * 0.45 });
    }
    const gid = ctx.uid('brow');
    out +=
      `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${a.x.toFixed(2)}" y1="0" x2="${b.x.toFixed(2)}" y2="0">` +
      `<stop offset="0" stop-color="${p.browColor}" stop-opacity="0.5"/><stop offset="0.3" stop-color="${p.browColor}" stop-opacity="0.92"/>` +
      `<stop offset="1" stop-color="${p.browColor}" stop-opacity="0.8"/></linearGradient>` +
      path(smoothOpen(top) + L(bot[N].x, bot[N].y) + smoothOpen(bot.slice().reverse(), 1 / 6, false) + 'Z', { fill: `url(#${gid})` });
  }
  return out;
}
