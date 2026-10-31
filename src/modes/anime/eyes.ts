import { darken, lighten, mix, outline } from '../../core/color';
import { C, L, M, Q, circle, ellipse, group, heartPath, path, smoothClosed, smoothOpen, starPath, type Pt } from '../../core/svg';
import { stroke, type Ctx } from './context';
import { faceLayout } from './layout';
import type { AnimeParams } from './schema';

interface EyeShape {
  /** closed outline of the visible eye (sclera) */
  outline: string;
  /** upper lid line, inner corner -> outer corner */
  upper: string;
  /** lower lid line */
  lower: string;
  /** where the iris sits (relative to the centre) */
  irisY: number;
  irisRx: number;
  irisRy: number;
  outer: Pt;
  /** lid y for sleepy eyes (draws a lid fold above) */
  fold?: number;
}

function arcPts(W: number, Hh: number, top: number, bottom: number, n = 9): { up: Pt[]; low: Pt[] } {
  const up: Pt[] = [];
  const low: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI;
    const x = -Math.cos(th) * (W / 2);
    up.push({ x, y: -Math.sin(th) * Hh * top });
    low.push({ x, y: Math.sin(th) * Hh * bottom });
  }
  return { up, low };
}

function shapeFor(kind: AnimeParams['eyeShape'], W: number, Hh: number): EyeShape {
  switch (kind) {
    case 'sleepy': {
      const up: Pt[] = [
        { x: -W / 2, y: Hh * 0.08 }, { x: -W * 0.3, y: -Hh * 0.2 }, { x: 0, y: -Hh * 0.3 }, { x: W * 0.3, y: -Hh * 0.22 }, { x: W / 2, y: Hh * 0.02 },
      ];
      const low = arcPts(W, Hh, 0.5, 0.62).low.slice(1, -1).reverse();
      return {
        outline: smoothClosed([...up, ...low.slice().reverse().reverse()]),
        upper: smoothOpen(up),
        lower: smoothOpen([up[0], ...low.slice().reverse(), up[up.length - 1]]),
        irisY: Hh * 0.08, irisRx: W * 0.4, irisRy: Hh * 0.62, outer: up[up.length - 1], fold: -Hh * 0.52,
      };
    }
    case 'cat': {
      const I: Pt = { x: -W / 2, y: Hh * 0.28 };
      const O: Pt = { x: W / 2, y: -Hh * 0.34 };
      const upperD = `${M(I.x, I.y)}${C(-W * 0.4, -Hh * 0.18, -W * 0.12, -Hh * 0.5, W * 0.14, -Hh * 0.46)}${C(W * 0.3, -Hh * 0.43, W * 0.44, -Hh * 0.38, O.x, O.y)}`;
      const lowerD = `${C(W * 0.34, -Hh * 0.05, W * 0.0, Hh * 0.5, -W * 0.22, Hh * 0.46)}${C(-W * 0.36, Hh * 0.43, -W * 0.46, Hh * 0.36, I.x, I.y)}`;
      return {
        outline: `${upperD}${lowerD}Z`,
        upper: upperD,
        lower: `${M(O.x, O.y)}${lowerD}`,
        irisY: -Hh * 0.02, irisRx: W * 0.36, irisRy: Hh * 0.52, outer: O,
      };
    }
    case 'almond': {
      // elongated, tapered inner corner, gently upswept outer corner; heavier upper lid than a round eye
      const I: Pt = { x: -W / 2, y: Hh * 0.1 };
      const O: Pt = { x: W / 2, y: -Hh * 0.12 };
      const upperD = `${M(I.x, I.y)}${C(-W * 0.34, -Hh * 0.2, -W * 0.14, -Hh * 0.5, W * 0.08, -Hh * 0.5)}${C(W * 0.28, -Hh * 0.5, W * 0.43, -Hh * 0.3, O.x, O.y)}`;
      const lowerD = `${C(W * 0.36, Hh * 0.1, W * 0.14, Hh * 0.44, -W * 0.08, Hh * 0.44)}${C(-W * 0.3, Hh * 0.44, -W * 0.44, Hh * 0.28, I.x, I.y)}`;
      return {
        outline: `${upperD}${lowerD}Z`,
        upper: upperD,
        lower: `${M(O.x, O.y)}${lowerD}`,
        irisY: -Hh * 0.04, irisRx: W * 0.37, irisRy: Hh * 0.55, outer: O,
      };
    }
    default: {
      const flat = kind === 'sparkly' ? 0.5 : 0.5;
      const { up, low } = arcPts(W, Hh, flat, 0.47);
      // slightly dropped inner corner, raised outer corner: friendlier look
      const tilt = (q: Pt): Pt => ({ x: q.x, y: q.y - (q.x / W) * Hh * 0.08 });
      const upT = up.map(tilt);
      const lowT = low.map(tilt);
      return {
        outline: smoothClosed([...upT, ...lowT.slice(1, -1).reverse()]),
        upper: smoothOpen(upT),
        lower: smoothOpen(lowT),
        irisY: Hh * 0.03, irisRx: W * 0.43, irisRy: Hh * 0.5, outer: upT[upT.length - 1],
      };
    }
  }
}

function highlights(ctx: Ctx, sh: EyeShape, sx: number): string {
  const { p } = ctx;
  const { irisRx: rx, irisRy: ry, irisY: cy } = sh;
  const bigX = -rx * 0.34 * sx, bigY = cy - ry * 0.34;
  const smX = rx * 0.38 * sx, smY = cy + ry * 0.4;
  let out = '';
  if (p.shine === 'star') {
    out += path(starPath(bigX, bigY, rx * 0.42, 0.28), { fill: '#fff' });
    out += circle(smX, smY, rx * 0.11, { fill: '#fff', opacity: 0.95 });
  } else if (p.shine === 'heart') {
    out += path(heartPath(bigX, bigY, rx * 0.24), { fill: '#fff' });
    out += circle(smX, smY, rx * 0.11, { fill: '#fff', opacity: 0.95 });
  } else {
    out += ellipse(bigX, bigY, rx * 0.26, ry * 0.25, { fill: '#fff' });
    out += circle(smX, smY, rx * 0.12, { fill: '#fff', opacity: 0.95 });
  }
  if (p.eyeShape === 'sparkly') {
    out += path(starPath(-rx * 0.52 * sx, cy + ry * 0.3, rx * 0.2), { fill: '#fff', opacity: 0.95 });
    out += circle(rx * 0.12 * sx, cy - ry * 0.66, rx * 0.075, { fill: '#fff', opacity: 0.9 });
    out += circle(rx * 0.52 * sx, cy + ry * 0.12, rx * 0.06, { fill: '#fff', opacity: 0.85 });
  }
  return out;
}

function eyeSvg(ctx: Ctx, side: -1 | 1, irisColor: string, W: number, Hh: number): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  const sx = side; // local +x is the outer side; the left eye (side -1) is mirrored
  const lid = mix(outline(p.hairColor), '#2a1a2e', 0.55);
  const lidW = Math.min(g.lw * 3.2, Math.max(g.lw * 1.5, W * 0.055));
  const tr = `translate(${lo.eyeDX * side} ${lo.eyeY}) scale(${sx} 1)`;

  if (p.eyeShape === 'happy') {
    const w = W * 0.48;
    const d = `${M(-w, Hh * 0.38)}${Q(-w * 0.1, -Hh * 1.12, w, Hh * 0.38)}`;
    let inner = stroke(ctx, d, lid, lidW * 1.15);
    if (p.lashes !== 'none') {
      inner += stroke(ctx, `${M(w * 0.98, Hh * 0.34)}${L(w * 1.2, Hh * 0.1)}`, lid, lidW * 0.9);
      if (p.lashes === 'full') inner += stroke(ctx, `${M(w * 0.85, Hh * 0.04)}${L(w * 1.1, -Hh * 0.18)}`, lid, lidW * 0.75);
    }
    return group(inner, { transform: tr });
  }

  const sh = shapeFor(p.eyeShape, W, Hh);
  const clip = ctx.uid('eye');
  const grad = ctx.uid('iris');
  const defs =
    `<clipPath id="${clip}">${path(sh.outline)}</clipPath>` +
    `<linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${darken(irisColor, 0.2)}"/><stop offset="0.55" stop-color="${irisColor}"/><stop offset="1" stop-color="${lighten(irisColor, 0.22)}"/></linearGradient>`;

  const irisX = 0;
  const pupil = darken(mix(irisColor, '#1e1030', 0.55), 0.05);
  let eye = '';
  eye += path(sh.outline, { fill: '#fffdfc' });
  let inside = '';
  inside += ellipse(0, -Hh * 0.5, W * 0.62, Hh * 0.3, { fill: '#cbb6dd', opacity: 0.5 });
  inside += ellipse(irisX, sh.irisY, sh.irisRx, sh.irisRy, { fill: `url(#${grad})` });
  inside += ellipse(irisX, sh.irisY, sh.irisRx, sh.irisRy, { fill: 'none', stroke: darken(irisColor, 0.3), 'stroke-width': Math.max(0.6, g.lw * 0.5), opacity: 0.8 });
  inside += ellipse(irisX, sh.irisY - sh.irisRy * 0.05, sh.irisRx * 0.46, sh.irisRy * 0.5, { fill: pupil });
  inside += ellipse(irisX, sh.irisY + sh.irisRy * 0.55, sh.irisRx * 0.62, sh.irisRy * 0.3, { fill: lighten(irisColor, 0.32), opacity: 0.55 });
  inside += highlights(ctx, sh, sx);
  eye += group(inside, { 'clip-path': `url(#${clip})` });

  // lid lines
  eye += stroke(ctx, sh.lower, mix(lid, '#ffffff', 0.35), Math.max(0.6, lidW * 0.4), { opacity: 0.7 });
  eye += stroke(ctx, sh.upper, lid, lidW);
  if (sh.fold !== undefined) {
    eye += stroke(ctx, `${M(-W * 0.38, sh.fold + Hh * 0.08)}${Q(0, sh.fold - Hh * 0.12, W * 0.4, sh.fold + Hh * 0.1)}`, ctx.skinLine, Math.max(0.6, g.lw * 0.7), { opacity: 0.6 });
  }
  // lashes
  const o = sh.outer;
  if (p.lashes !== 'none') {
    const flick = `${M(o.x - W * 0.04, o.y + Hh * 0.04)}${Q(o.x + W * 0.1, o.y - Hh * 0.02, o.x + W * 0.17, o.y - Hh * (p.lashes === 'full' ? 0.2 : 0.12))}`;
    eye += stroke(ctx, flick, lid, lidW * 0.95);
    if (p.lashes === 'full') {
      const t = [0.24, 0.5, 0.74];
      for (const f of t) {
        const x = -W / 2 + W * f;
        const y = sh.fold !== undefined ? -Hh * 0.28 : -Hh * 0.5 * Math.sin(Math.PI * f) - (x / W) * Hh * 0.08;
        eye += stroke(ctx, `${M(x, y + Hh * 0.03)}${L(x + W * 0.06, y - Hh * 0.1)}`, lid, lidW * 0.7);
      }
      eye += stroke(ctx, `${M(o.x - W * 0.08, o.y + Hh * 0.3)}${L(o.x + W * 0.02, o.y + Hh * 0.38)}`, lid, lidW * 0.55, { opacity: 0.85 });
    }
  }
  return `<defs>${defs}</defs>${group(eye, { transform: tr })}`;
}

export function eyesSvg(ctx: Ctx): string {
  const { p } = ctx;
  const lo = faceLayout(ctx);
  const left = eyeSvg(ctx, -1, p.iris, lo.eyeW, lo.eyeH);
  const right = eyeSvg(ctx, 1, p.hetero ? p.iris2 : p.iris, lo.eyeW, lo.eyeH);
  return left + right;
}

