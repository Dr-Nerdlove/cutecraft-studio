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
    out += ellipse(x + s * g.hw * 0.02, y, g.hw * 0.06, g.u * 0.06, { fill: ctx.skinRose, opacity: 0.6, filter: `url(#${ctx.soft})` });
    out += stroke(ctx, `${M(x + s * g.hw * 0.04, y - g.u * 0.05)}${Q(x + s * g.hw * 0.07, y, x + s * g.hw * 0.02, y + g.u * 0.045)}`, ctx.skinShade, g.lw * 1.4, { opacity: 0.8 });
  }
  return out;
}

/** High cheekbones: a light ridge on the bone with a soft hollow shadow right below it (clipped to the face). */
function cheekbones(ctx: Ctx): string {
  const { g, p } = ctx;
  if (p.faceShape !== 'highcheek') return '';
  const lo = faceLayout(ctx);
  const soft = `url(#${ctx.soft})`;
  const shadow = darken(ctx.skinShade, 0.05);
  let out = '';
  for (const s of [-1, 1] as const) {
    const x = s * g.hw * 0.7;
    const y = lo.eyeY + g.u * 0.2;
    out += ellipse(x * 0.98, y + g.u * 0.075, g.hw * 0.3, g.u * 0.05, { fill: shadow, opacity: s < 0 ? 0.28 : 0.4, filter: soft, transform: `rotate(${s * -22} ${x} ${y})` });
    out += ellipse(x * 0.95, y - g.u * 0.015, g.hw * 0.26, g.u * 0.028, { fill: '#ffffff', opacity: s < 0 ? 0.3 : 0.18, filter: soft, transform: `rotate(${s * -22} ${x} ${y})` });
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
    `<stop offset="0" stop-color="${shadow}" stop-opacity="0.45"/><stop offset="0.2" stop-color="${shadow}" stop-opacity="0"/>` +
    `<stop offset="0.6" stop-color="${shadow}" stop-opacity="0"/><stop offset="0.85" stop-color="${shadow}" stop-opacity="0.45"/><stop offset="1" stop-color="${darken(shadow, 0.04)}" stop-opacity="0.9"/></linearGradient>` +
    `<radialGradient id="${glow}"><stop offset="0" stop-color="${lighten(ctx.skin, 0.05)}" stop-opacity="0.9"/><stop offset="1" stop-color="${lighten(ctx.skin, 0.05)}" stop-opacity="0"/></radialGradient>`;
  const soft = `url(#${ctx.soft})`;
  const inside =
    path(ctx.faceD, { fill: `url(#${side})` }) +
    // eye sockets: a soft shade between brow and eye, deepest at the inner corner
    ellipse(-(lo.eyeDX - lo.eyeW * 0.25), lo.eyeY - lo.eyeH * 0.55, lo.eyeW * 0.55, lo.eyeH * 0.6, { fill: shadow, opacity: 0.3, filter: soft }) +
    ellipse(lo.eyeDX - lo.eyeW * 0.25, lo.eyeY - lo.eyeH * 0.55, lo.eyeW * 0.55, lo.eyeH * 0.6, { fill: shadow, opacity: 0.4, filter: soft }) +
    // rosy nose tip and chin
    ellipse(0, lo.noseY, g.headW * 0.07, g.u * 0.04, { fill: ctx.skinRose, opacity: 0.55, filter: soft }) +
    ellipse(0, g.yChin - g.u * 0.06, g.headW * 0.1, g.u * 0.04, { fill: ctx.skinRose, opacity: 0.3, filter: soft }) +
    // lit areas: forehead, bridge of the nose, cheekbone on the light side
    ellipse(-g.hw * 0.15, g.yTop + g.u * 0.32, g.hw * 0.45, g.u * 0.1, { fill: '#ffffff', opacity: 0.18, filter: soft }) +
    ellipse(-g.headW * 0.01, lerp(lo.eyeY, lo.noseY, 0.65), g.headW * 0.022, g.u * 0.045, { fill: '#ffffff', opacity: 0.2, filter: soft }) +
    ellipse(-(lo.eyeDX + lo.eyeW * 0.1), lo.eyeY + g.u * 0.1, lo.eyeW * 0.35, g.u * 0.03, { fill: '#ffffff', opacity: 0.3, filter: soft }) +
    ellipse(g.hw * 0.25, g.yChin - g.u * 0.02, g.hw * 0.95, g.u * 0.16, { fill: shadow, opacity: 0.35, filter: `url(#${ctx.soft})` }) +
    ellipse(-g.hw * 0.12, lo.eyeY + g.u * 0.08, g.hw * 0.75, g.u * 0.3, { fill: `url(#${glow})` }) +
    cheekbones(ctx);
  return (
    `<defs>${defs}</defs>` +
    `<clipPath id="${ctx.faceClip}">${path(ctx.faceD)}</clipPath>` +
    path(ctx.faceD, { fill: ctx.skin }) +
    group(inside, { 'clip-path': `url(#${ctx.faceClip})` }) +
    path(ctx.faceD, { fill: 'none', stroke: ctx.skinLine, 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round', opacity: 0.4 })
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
    stroke(ctx, `${M(-a * 0.85, y + a * 0.3)}${Q(-a * 0.75, y + a * 0.6, -a * 0.35, y + a * 0.55)}`, col, sw, { opacity: o * 0.7 }) +
    stroke(ctx, `${M(a * 0.85, y + a * 0.3)}${Q(a * 0.75, y + a * 0.6, a * 0.35, y + a * 0.55)}`, col, sw, { opacity: o * 0.9 });
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
 * Closed lips: a slim upper lip with a soft cupid's bow, a fuller lower lip with a small gloss highlight,
 * a soft shadow underneath. `lift` raises the corners (smile), `scale` changes the width, `full` the
 * thickness of the lips, `tint` the colour strength.
 */
function lips(ctx: Ctx, w: number, y: number, lift: number, scale: number, tint: number, full = 1): string {
  const { g } = ctx;
  const hw = w * 0.6 * scale;
  const base = mix(ctx.skin, '#d24a64', tint);
  const upperC = darken(base, 0.07);
  const lineC = mix(darken(base, 0.25), '#6a2434', 0.35);
  const cy = y - lift;
  const sag = y + w * 0.03 + lift * 0.4; // control point of the seam between the lips
  const up = w * 0.1 * full; // height of the upper lip
  const lo = w * 0.17 * full; // depth of the lower lip
  // upper lip: corner -> low shoulder -> peak of the bow -> dip in the middle -> and mirrored
  const upper =
    `${M(-hw, cy)}${C(-hw * 0.6, cy - up * 0.35, -w * 0.2, y - up * 1.25, -w * 0.085, y - up * 1.3)}` +
    `${Q(-w * 0.03, y - up * 1.3, 0, y - up * 0.95)}${Q(w * 0.03, y - up * 1.3, w * 0.085, y - up * 1.3)}` +
    `${C(w * 0.2, y - up * 1.25, hw * 0.6, cy - up * 0.35, hw, cy)}`;
  const seam = `${Q(0, sag, -hw, cy)}`;
  const lower = `${M(-hw, cy)}${Q(0, sag, hw, cy)}${C(hw * 0.72, y + lo + w * 0.02, -hw * 0.72, y + lo + w * 0.02, -hw, cy)}Z`;
  const gid = ctx.uid('lip');
  const defs = `<radialGradient id="${gid}" cx="0.45" cy="0.3" r="0.75"><stop offset="0" stop-color="${lighten(base, 0.08)}"/><stop offset="1" stop-color="${darken(base, 0.04)}"/></radialGradient>`;
  return (
    `<defs>${defs}</defs>` +
    ellipse(0, y + lo + w * 0.1, hw * 0.5, w * 0.06, { fill: ctx.skinShade, opacity: 0.35, filter: `url(#${ctx.soft})` }) +
    path(lower, { fill: `url(#${gid})` }) +
    path(upper + seam + 'Z', { fill: upperC }) +
    stroke(ctx, `${M(-hw, cy)}${Q(0, sag, hw, cy)}`, lineC, Math.max(0.4, g.lw * 0.7), { opacity: 0.85 }) +
    ellipse(-w * 0.05, y + lo * 0.5, w * 0.1, w * 0.025, { fill: '#ffffff', opacity: 0.5, filter: `url(#${ctx.soft})` })
  );
}

/**
 * Open mouth seen from the front: a dark cavity between two lips, an upper row of teeth that follows the
 * upper lip, and a tongue at the bottom. `hw` is the half width, `depth` how far the mouth opens.
 */
function openMouth(ctx: Ctx, w: number, y: number, hw: number, depth: number, smile: number): string {
  const { g } = ctx;
  const base = mix(ctx.skin, '#d24a64', 0.55);
  const lineC = mix(darken(base, 0.25), '#6a2434', 0.4);
  const cavity = darken(mix(base, '#5a1a2e', 0.6), 0.02);
  const sw = Math.max(0.6, g.lw * 0.8);
  const cy = y - smile; // the corners lift when smiling
  const ctrl = y + w * 0.04;
  const bottom = y + depth;
  const d = `${M(-hw, cy)}${Q(0, ctrl, hw, cy)}${C(hw * 0.78, bottom + depth * 0.1, -hw * 0.78, bottom + depth * 0.1, -hw, cy)}Z`;
  const teethH = depth * 0.38;
  const teeth = `${M(-hw, cy - 1)}${Q(0, ctrl - 1, hw, cy - 1)}${L(hw, cy + teethH)}${Q(0, ctrl + teethH * 1.15, -hw, cy + teethH)}Z`;
  const id = ctx.uid('mouth');
  return (
    ellipse(0, bottom + w * 0.1, hw * 0.55, w * 0.05, { fill: ctx.skinShade, opacity: 0.3, filter: `url(#${ctx.soft})` }) +
    `<clipPath id="${id}">${path(d)}</clipPath>` +
    path(d, { fill: cavity }) +
    group(
      ellipse(0, bottom + depth * 0.05, hw * 0.55, depth * 0.38, { fill: '#f27a93' }) +
        path(teeth, { fill: '#fffafa' }) +
        path(`${M(-hw, cy + teethH)}${Q(0, ctrl + teethH * 1.15, hw, cy + teethH)}`, { fill: 'none', stroke: '#e8c9d0', 'stroke-width': 0.6 }),
      { 'clip-path': `url(#${id})` },
    ) +
    // a hint of lower lip under the opening, then the outline of the opening
    stroke(ctx, `${M(-hw * 0.7, y + depth * 0.82)}${Q(0, bottom + depth * 0.38, hw * 0.7, y + depth * 0.82)}`, lighten(base, 0.05), Math.max(1, w * 0.07), { opacity: 0.75 }) +
    path(d, { fill: 'none', stroke: lineC, 'stroke-width': sw, 'stroke-linejoin': 'round', opacity: 0.9 })
  );
}

export function mouthSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  const w = lo.mouthW;
  const y = lo.mouthY;
  const lip = mix(ctx.skinLine, '#c2405c', 0.6);
  const inner = darken(mix(lip, '#5a1a2e', 0.5), 0.02);
  const sw = Math.max(0.8, g.lw * 0.9);
  switch (p.mouth) {
    case 'smile':
      // closed, softly smiling lips
      return lips(ctx, w, y, w * 0.07, 0.95, 0.4, 1.25);
    case 'open':
      return openMouth(ctx, w, y, w * 0.5, w * 0.42, w * 0.05);
    case 'cat': {
      // a small "w": two soft arcs meeting in the middle
      const d = `${M(-w * 0.46, y - w * 0.03)}${C(-w * 0.4, y + w * 0.22, -w * 0.08, y + w * 0.2, 0, y - w * 0.02)}${C(w * 0.08, y + w * 0.2, w * 0.4, y + w * 0.22, w * 0.46, y - w * 0.03)}`;
      return stroke(ctx, d, lip, sw);
    }
    case 'o': {
      const rx = w * 0.19, ry = w * 0.24;
      const id = ctx.uid('mouth');
      const cy = y + ry * 0.35;
      return (
        // soft lip ring around the opening
        ellipse(0, cy, rx * 1.45, ry * 1.3, { fill: mix(ctx.skin, '#d24a64', 0.45), opacity: 0.9 }) +
        `<clipPath id="${id}">${ellipse(0, cy, rx, ry)}</clipPath>` +
        ellipse(0, cy, rx, ry, { fill: inner }) +
        group(ellipse(0, cy + ry * 0.75, rx * 0.8, ry * 0.5, { fill: '#f27a93' }), { 'clip-path': `url(#${id})` }) +
        ellipse(0, cy, rx, ry, { fill: 'none', stroke: lip, 'stroke-width': sw * 0.8 })
      );
    }
    case 'pout':
      // small, full lips
      return lips(ctx, w * 0.92, y, -w * 0.01, 0.8, 0.6, 1.7);
    case 'lips':
      return lips(ctx, w, y, 0, 1, 0.55, 1.45);
    case 'smirk': {
      // one-sided smile: the right corner lifts more
      const d = `${M(-w * 0.42, y + w * 0.04)}${C(-w * 0.2, y + w * 0.12, w * 0.08, y + w * 0.12, w * 0.28, y + w * 0.02)}${Q(w * 0.42, y - w * 0.05, w * 0.5, y - w * 0.14)}`;
      return stroke(ctx, d, lip, sw) + stroke(ctx, `${M(w * 0.5, y - w * 0.14)}${L(w * 0.55, y - w * 0.19)}`, lip, sw * 0.8);
    }
    case 'grin':
      // wide smile showing a row of teeth
      return openMouth(ctx, w, y, w * 0.62, w * 0.34, w * 0.07);
    case 'fang': {
      const d = `${M(-w * 0.5, y - w * 0.02)}${C(-w * 0.3, y + w * 0.28, w * 0.3, y + w * 0.28, w * 0.5, y - w * 0.02)}`;
      const fx = w * 0.24, fy = y + w * 0.155;
      return (
        stroke(ctx, d, lip, sw) +
        path(`${M(fx - w * 0.06, fy - w * 0.012)}${L(fx + w * 0.06, fy - w * 0.02)}${L(fx + w * 0.005, fy + w * 0.14)}Z`, { fill: '#ffffff', stroke: lip, 'stroke-width': sw * 0.6, 'stroke-linejoin': 'round' }) +
        stroke(ctx, `${M(w * 0.5, y - w * 0.02)}${L(w * 0.54, y - w * 0.08)}`, lip, sw * 0.8)
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
