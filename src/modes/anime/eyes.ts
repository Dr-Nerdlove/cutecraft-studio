import { darken, lighten, mix, outline } from '../../core/color';
import { L, M, Q, circle, ellipse, group, heartPath, lerp, path, smoothOpen, starPath, type Pt } from '../../core/svg';
import { stroke, type Ctx } from './context';
import { faceLayout } from './layout';
import type { AnimeParams } from './schema';

/**
 * Semi-realistic anime eyes. Every shape is given as points in eye units (x: -0.5 = inner corner,
 * +0.5 = outer corner, times W; y times the eye height Hh, negative = up). The upper lid runs inner ->
 * outer corner, the lower lid outer -> inner (without the two corners).
 */
interface EyeShape {
  up: Pt[];
  low: Pt[];
  /** iris centre (y) and radius, in local units */
  irisY: number;
  irisR: number;
  /** heavy lid: draws the crease low, right above the lash line */
  heavy?: boolean;
}

type Raw = ReadonlyArray<readonly [number, number]>;

const SHAPES: Record<Exclude<AnimeParams['eyeShape'], 'happy'>, { up: Raw; low: Raw; iy: number; ir: number; heavy?: boolean }> = {
  almond: { up: [[-0.5, 0.1], [-0.3, -0.36], [0.02, -0.5], [0.3, -0.42], [0.5, -0.12]], low: [[0.32, 0.26], [0, 0.42], [-0.3, 0.34]], iy: -0.04, ir: 0.3 },
  doe: { up: [[-0.5, 0.02], [-0.32, -0.42], [0, -0.52], [0.3, -0.44], [0.5, 0.04]], low: [[0.32, 0.4], [0, 0.5], [-0.3, 0.38]], iy: 0, ir: 0.33 },
  narrow: { up: [[-0.5, 0.12], [-0.28, -0.32], [0.05, -0.48], [0.32, -0.38], [0.5, -0.1]], low: [[0.3, 0.22], [0, 0.34], [-0.3, 0.3]], iy: -0.06, ir: 0.27 },
  round: { up: [[-0.5, 0.04], [-0.34, -0.4], [0, -0.52], [0.34, -0.42], [0.5, -0.04]], low: [[0.34, 0.4], [0, 0.5], [-0.34, 0.4]], iy: 0, ir: 0.34 },
  sparkly: { up: [[-0.5, 0.04], [-0.34, -0.42], [0, -0.53], [0.34, -0.44], [0.5, -0.06]], low: [[0.34, 0.4], [0, 0.5], [-0.34, 0.4]], iy: 0, ir: 0.35 },
  sleepy: { up: [[-0.5, 0.12], [-0.28, -0.14], [0.05, -0.22], [0.32, -0.16], [0.5, 0.06]], low: [[0.3, 0.38], [0, 0.48], [-0.3, 0.38]], iy: 0.06, ir: 0.3, heavy: true },
  cat: { up: [[-0.5, 0.26], [-0.28, -0.2], [0.06, -0.46], [0.32, -0.46], [0.5, -0.36]], low: [[0.3, 0.08], [0, 0.4], [-0.3, 0.42]], iy: -0.04, ir: 0.29 },
};

function shapeFor(kind: Exclude<AnimeParams['eyeShape'], 'happy'>, W: number, Hh: number): EyeShape {
  const s = SHAPES[kind];
  const pt = ([x, y]: readonly [number, number]): Pt => ({ x: x * W, y: y * Hh });
  return { up: s.up.map(pt), low: s.low.map(pt), irisY: s.iy * Hh, irisR: s.ir * W, heavy: s.heavy };
}

/** Catchlights. Small and placed upper-left like a real reflection; star / heart keep the cute option. */
function highlights(ctx: Ctx, sh: EyeShape, sx: number): string {
  const { p } = ctx;
  const r = sh.irisR;
  const cy = sh.irisY;
  const bigX = -r * 0.36 * sx, bigY = cy - r * 0.36;
  let out = '';
  if (p.shine === 'star') out += path(starPath(bigX, bigY, r * 0.4, 0.26), { fill: '#fff' });
  else if (p.shine === 'heart') out += path(heartPath(bigX, bigY, r * 0.24), { fill: '#fff' });
  else out += ellipse(bigX, bigY, r * 0.22, r * 0.2, { fill: '#fff', opacity: 0.95 });
  out += circle(r * 0.4 * sx, cy + r * 0.34, r * 0.08, { fill: '#fff', opacity: 0.8 });
  if (p.eyeShape === 'sparkly') {
    out += path(starPath(-r * 0.05 * sx, cy + r * 0.48, r * 0.17), { fill: '#fff', opacity: 0.9 });
    out += circle(r * 0.18 * sx, cy - r * 0.55, r * 0.06, { fill: '#fff', opacity: 0.85 });
  }
  return out;
}

/** A thin, slightly curved eyelash starting at `a`, pointing in direction (dx, dy). */
function lash(ctx: Ctx, a: Pt, dx: number, dy: number, color: string, w: number): string {
  const d = `${M(a.x, a.y)}${Q(a.x + dx * 0.35, a.y + dy * 0.75, a.x + dx, a.y + dy)}`;
  return stroke(ctx, d, color, w);
}

function eyeSvg(ctx: Ctx, side: -1 | 1, irisColor: string, W: number, Hh: number): string {
  const { g, p } = ctx;
  const lo = faceLayout(ctx);
  const sx = side; // local +x is the outer side; the left eye (side -1) is mirrored
  const lid = mix(outline(p.hairColor), '#1c1216', 0.7);
  const lidW = Math.max(g.lw * 0.9, W * 0.07);
  const tr = `translate(${lo.eyeDX * side} ${lo.eyeY}) scale(${sx} 1)`;
  const crease = mix(ctx.skinLine, ctx.skinShade, 0.3);

  if (p.eyeShape === 'happy') {
    // closed, smiling eye: a tapered arc with a few lashes
    const w = W * 0.5;
    const arc = `${M(-w, Hh * 0.3)}${Q(-w * 0.05, -Hh * 1.0, w, Hh * 0.22)}`;
    const back = `${Q(-w * 0.05, -Hh * 1.0 + lidW * 2.2, -w, Hh * 0.3)}Z`;
    let inner = path(arc + L(w + W * 0.04, Hh * 0.18) + back, { fill: lid });
    inner += stroke(ctx, `${M(-w * 0.7, -Hh * 0.62)}${Q(0, -Hh * 1.35, w * 0.8, -Hh * 0.55)}`, crease, g.lw * 0.6, { opacity: 0.5 });
    if (p.lashes !== 'none') {
      const n = p.lashes === 'full' ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const f = 0.55 + i * 0.13;
        inner += lash(ctx, { x: lerp(-w, w, f), y: Hh * (0.3 - 1.25 * Math.sin(Math.PI * f) * 0.62) + Hh * 0.25 }, W * 0.1, Hh * 0.35, lid, lidW * 0.4);
      }
    }
    return group(inner, { transform: tr });
  }

  const sh = shapeFor(p.eyeShape, W, Hh);
  const I = sh.up[0];
  const O = sh.up[sh.up.length - 1];
  const upperD = smoothOpen(sh.up);
  const lowerD = smoothOpen([O, ...sh.low, I], 1 / 6, false);
  const outlineD = `${upperD}${lowerD}Z`;

  const clip = ctx.uid('eye');
  const irisG = ctx.uid('iris');
  const lidG = ctx.uid('lidsh');
  const scleraG = ctx.uid('scl');
  const shadowG = ctx.uid('esh');
  const shadowColor = mix(p.blushColor, darken(ctx.skinShade, 0.08), 0.55);
  const defs =
    `<clipPath id="${clip}">${path(outlineD)}</clipPath>` +
    `<radialGradient id="${irisG}" cx="0.5" cy="0.62" r="0.55">` +
    `<stop offset="0" stop-color="${lighten(irisColor, 0.14)}"/><stop offset="0.5" stop-color="${irisColor}"/>` +
    `<stop offset="0.82" stop-color="${darken(irisColor, 0.12)}"/><stop offset="1" stop-color="${darken(irisColor, 0.32)}"/></radialGradient>` +
    `<linearGradient id="${lidG}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#1a1018" stop-opacity="0.75"/><stop offset="0.5" stop-color="#1a1018" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${scleraG}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${darken(ctx.skinShade, 0.1)}" stop-opacity="0.75"/><stop offset="0.45" stop-color="#f2e6e6" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="${shadowG}"><stop offset="0" stop-color="${shadowColor}" stop-opacity="0.42"/><stop offset="1" stop-color="${shadowColor}" stop-opacity="0"/></radialGradient>`;

  let eye = '';
  // soft eyeshadow above the lid and a warm tint along the lower lid
  eye += ellipse(W * 0.08, -Hh * 0.42, W * 0.66, Hh * 0.62, { fill: `url(#${shadowG})` });
  eye += ellipse(W * 0.06, Hh * 0.5, W * 0.5, Hh * 0.26, { fill: `url(#${shadowG})`, opacity: 0.7 });

  // sclera, iris, pupil, clipped to the eye opening
  eye += path(outlineD, { fill: '#fbf5f3' });
  const r = sh.irisR;
  const cy = sh.irisY;
  let inside = '';
  inside += `<rect x="${-W * 0.6}" y="${-Hh * 0.6}" width="${W * 1.2}" height="${Hh * 1.2}" fill="url(#${scleraG})"/>`;
  inside += ellipse(-W * 0.47, I.y + Hh * 0.04, W * 0.07, Hh * 0.14, { fill: mix(p.blushColor, '#ffffff', 0.25), opacity: 0.6 });
  inside += circle(0, cy, r, { fill: `url(#${irisG})` });
  // fine fibres around the pupil
  let fibres = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const c = Math.cos(a), s = Math.sin(a);
    fibres += `${M(c * r * 0.48, cy + s * r * 0.48)}${L(c * r * 0.86, cy + s * r * 0.86)}`;
  }
  inside += path(fibres, { fill: 'none', stroke: lighten(irisColor, 0.2), 'stroke-width': Math.max(0.25, r * 0.05), opacity: 0.4 });
  inside += circle(0, cy, r, { fill: 'none', stroke: darken(irisColor, 0.4), 'stroke-width': Math.max(0.35, r * 0.09), opacity: 0.85 });
  inside += circle(0, cy, r * 0.4, { fill: darken(mix(irisColor, '#120a14', 0.75), 0.02) });
  inside += ellipse(0, cy + r * 0.55, r * 0.6, r * 0.28, { fill: lighten(irisColor, 0.3), opacity: 0.35 });
  // shadow cast by the upper lid
  inside += `<rect x="${-W * 0.6}" y="${-Hh * 0.6}" width="${W * 1.2}" height="${Hh * 1.1}" fill="url(#${lidG})"/>`;
  inside += highlights(ctx, sh, sx);
  eye += group(inside, { 'clip-path': `url(#${clip})` });

  // lower lid: fine line on the outer half, very light on the inner half
  eye += stroke(ctx, smoothOpen([O, ...sh.low, I]), mix(lid, ctx.skinShade, 0.55), Math.max(0.35, lidW * 0.3), { opacity: 0.6 });
  eye += stroke(ctx, smoothOpen([O, ...sh.low.slice(0, 2)]), lid, Math.max(0.4, lidW * 0.4), { opacity: 0.55 });

  // upper lash line: a filled band that thickens towards the outer corner and ends in a small wing
  const n = sh.up.length;
  const thick = (i: number): number => lidW * (0.55 + 1.6 * Math.pow(i / (n - 1), 1.4));
  const top = sh.up.map((q, i) => ({ x: q.x - (i === 0 ? 0 : W * 0.01), y: q.y - thick(i) }));
  const wingLen = p.lashes === 'none' ? 0.06 : p.lashes === 'light' ? 0.1 : 0.14;
  const wing: Pt = { x: O.x + W * wingLen, y: O.y - Hh * (0.1 + wingLen * 1.2) };
  const band = smoothOpen([...sh.up, wing]) + smoothOpen([wing, ...top.slice().reverse()], 1 / 6, false) + 'Z';
  eye += path(band, { fill: lid });

  // double-eyelid crease above the lid
  const creaseOff = sh.heavy ? Hh * 0.2 : Hh * 0.34;
  const creasePts = sh.up.slice(1).map((q, i) => ({ x: q.x * 0.95, y: q.y - thick(i + 1) - creaseOff * (0.75 + 0.25 * Math.sin((Math.PI * (i + 1)) / (n - 1))) }));
  eye += stroke(ctx, smoothOpen(creasePts), crease, Math.max(0.35, g.lw * 0.7), { opacity: sh.heavy ? 0.75 : 0.5 });

  // lashes
  if (p.lashes !== 'none') {
    const lw = Math.max(0.35, lidW * 0.42);
    const ups = p.lashes === 'full' ? [0.45, 0.6, 0.73, 0.85, 0.95] : [0.7, 0.86];
    for (const f of ups) {
      const i = f * (n - 1);
      const i0 = Math.floor(i), i1 = Math.min(n - 1, i0 + 1), t = i - i0;
      const a: Pt = { x: lerp(top[i0].x, top[i1].x, t), y: lerp(top[i0].y, top[i1].y, t) + lidW * 0.3 };
      eye += lash(ctx, a, W * (0.06 + 0.12 * f), -Hh * (0.22 + 0.06 * f), lid, lw);
    }
    eye += lash(ctx, { x: wing.x - W * 0.03, y: wing.y + Hh * 0.05 }, W * 0.12, -Hh * 0.12, lid, lw);
    if (p.lashes === 'full') {
      for (const f of [0, 1]) {
        const q = sh.low[f];
        eye += lash(ctx, { x: q.x, y: q.y + Hh * 0.02 }, W * (0.05 - f * 0.02), Hh * 0.2, lid, lw * 0.75);
      }
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

