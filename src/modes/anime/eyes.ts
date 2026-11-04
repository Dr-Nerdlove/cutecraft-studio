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
  // many points on a near-elliptical outline: round, no boxy corners
  doe: {
    up: [[-0.5, 0.05], [-0.46, -0.2], [-0.35, -0.41], [-0.18, -0.53], [0, -0.57], [0.18, -0.54], [0.34, -0.44], [0.45, -0.24], [0.5, 0.05]],
    low: [[0.45, 0.3], [0.34, 0.48], [0.17, 0.58], [0, 0.61], [-0.17, 0.58], [-0.34, 0.48], [-0.45, 0.3]],
    iy: 0.02, ir: 0.37,
  },
  narrow: { up: [[-0.5, 0.12], [-0.28, -0.32], [0.05, -0.48], [0.32, -0.38], [0.5, -0.1]], low: [[0.3, 0.22], [0, 0.34], [-0.3, 0.3]], iy: -0.06, ir: 0.27 },
  round: { up: [[-0.5, 0.04], [-0.34, -0.4], [0, -0.52], [0.34, -0.42], [0.5, -0.04]], low: [[0.34, 0.4], [0, 0.5], [-0.34, 0.4]], iy: 0, ir: 0.34 },
  sparkly: { up: [[-0.5, 0.04], [-0.34, -0.42], [0, -0.53], [0.34, -0.44], [0.5, -0.06]], low: [[0.34, 0.4], [0, 0.5], [-0.34, 0.4]], iy: 0, ir: 0.35 },
  sleepy: { up: [[-0.5, 0.12], [-0.28, -0.14], [0.05, -0.22], [0.32, -0.16], [0.5, 0.06]], low: [[0.3, 0.38], [0, 0.48], [-0.3, 0.38]], iy: 0.06, ir: 0.3, heavy: true },
  cat: { up: [[-0.5, 0.16], [-0.28, -0.28], [0.06, -0.5], [0.32, -0.46], [0.5, -0.26]], low: [[0.3, 0.16], [0, 0.42], [-0.3, 0.38]], iy: -0.04, ir: 0.29 },
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

/**
 * A tapered, curved eyelash: thick at the base `a`, ending in a fine point. `ang` is the lean from
 * straight up (towards the outer corner when positive, radians), `len` its length. The tip curls
 * away from the eye (the control point leans further out than the tip).
 */
function lash(a: Pt, ang: number, len: number, w: number, color: string, extra: Record<string, string | number> = {}): string {
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  const cx = Math.sin(ang + 0.55), cy = -Math.cos(ang + 0.55);
  const nx = -dy, ny = dx; // normal
  const T = { x: a.x + dx * len, y: a.y + dy * len };
  const C = { x: a.x + cx * len * 0.55, y: a.y + cy * len * 0.55 };
  const h = w / 2;
  const d =
    `${M(a.x - nx * h, a.y - ny * h)}${Q(C.x - nx * h * 0.55, C.y - ny * h * 0.55, T.x, T.y)}` +
    `${Q(C.x + nx * h * 0.55, C.y + ny * h * 0.55, a.x + nx * h, a.y + ny * h)}Z`;
  return path(d, { fill: color, ...extra });
}

/** Fixed sparkle layout (x in W, y in Hh; x/y/radius/opacity): deterministic, no randomness. */
const SPARKLES: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.3, -0.62, 0.012, 0.9], [-0.18, -0.8, 0.008, 0.7], [-0.05, -0.68, 0.016, 1], [0.08, -0.9, 0.007, 0.6],
  [0.14, -0.62, 0.01, 0.85], [0.22, -0.78, 0.018, 1], [0.3, -0.6, 0.008, 0.7], [0.36, -0.86, 0.012, 0.9],
  [0.44, -0.66, 0.009, 0.75], [-0.38, -0.82, 0.007, 0.6], [0.02, -0.56, 0.007, 0.65], [0.28, -0.96, 0.007, 0.6],
  [-0.2, -1.08, 0.011, 0.95], [0.1, -1.12, 0.008, 0.8], [0.34, -1.04, 0.014, 1], [-0.36, -1.0, 0.009, 0.8],
  [0.4, 0.5, 0.011, 0.9], [0.25, 0.58, 0.008, 0.7], [0.5, 0.36, 0.007, 0.6],
];

/**
 * Soft eyeshadow (earthy or glitter) as a blurred painted wash over the lid, centred at (cx, cy) with
 * radii (rx, ry), darkest towards the outer corner. Returns the markup; gradient defs go into `defs`.
 */
function shadowWash(ctx: Ctx, defs: string[], cx: number, cy: number, rx: number, ry: number, W: number, Hh: number, smudgeOn = true): string {
  const { p } = ctx;
  if (p.eyeshadow === 'none') return '';
  const glitter = p.eyeshadow === 'glitter';
  const outer = glitter ? p.glitterColor : '#8a5a44';
  const inner = glitter ? lighten(p.glitterColor, 0.3) : '#b98a6a';
  const base = mix(inner, outer, 0.6);
  const dark = glitter ? mix(outer, '#000000', 0.12) : '#7a4a38';
  const smudge = glitter ? outer : '#8a5a44';
  // soft edges come from radial gradients that fade to nothing (no blur filter, which would clip to a box)
  const radial = (name: string, c: string, o: number): string => {
    const id = ctx.uid(name);
    defs.push(
      `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="0.6" stop-color="${c}" stop-opacity="${o * 0.85}"/>` +
        `<stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`,
    );
    return `url(#${id})`;
  };
  let out = ellipse(cx, cy, rx, ry, { fill: radial('esw', base, glitter ? 0.95 : 0.9) });
  // lighter inner half in glitter, darker concentrated outer corner
  if (glitter) out += ellipse(cx - rx * 0.3, cy, rx * 0.5, ry * 0.8, { fill: radial('esl', lighten(inner, 0.35), 0.85) });
  out += ellipse(cx + rx * 0.45, cy + ry * 0.15, rx * 0.5, ry * 0.75, { fill: radial('eso', dark, 0.75) });
  // smudge along the outer lower lid
  if (smudgeOn) out += ellipse(W * 0.34, Hh * 0.38, W * 0.17, Hh * 0.07, { fill: radial('esm', smudge, 0.17) });
  return out;
}

function sparkles(ctx: Ctx, W: number, Hh: number, scale: number, dy: number, lower = true): string {
  const { p } = ctx;
  if (p.eyeshadow !== 'glitter') return '';
  const tint = lighten(p.glitterColor, 0.45);
  let out = '';
  SPARKLES.forEach(([x, y, r, o], i) => {
    if (y > 0 && !lower) return;
    const px = x * W, py = y * Hh * scale + dy, pr = Math.max(0.25, r * W);
    out += i % 3 === 0 ? path(starPath(px, py, pr * 1.9, 0.2), { fill: i % 2 ? '#ffffff' : tint, opacity: o }) : circle(px, py, pr, { fill: i % 2 ? tint : '#ffffff', opacity: o });
  });
  return out;
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
    // closed, smiling eye: a tapered arc (no lashes)
    const w = W * 0.5;
    const arc = `${M(-w, Hh * 0.3)}${Q(-w * 0.05, -Hh * 1.0, w, Hh * 0.22)}`;
    const back = `${Q(-w * 0.05, -Hh * 1.0 + lidW * 2.2, -w, Hh * 0.3)}Z`;
    const hdefs: string[] = [];
    let inner = '';
    if (p.eyeshadow !== 'none') {
      inner += shadowWash(ctx, hdefs, 0, -Hh * 0.5, w * 1.05, Hh * 0.38, W, Hh, false);
      inner += sparkles(ctx, W, Hh, 0.6, Hh * 0.1, false);
    }
    inner += path(arc + back, { fill: lid });
    inner += stroke(ctx, `${M(-w * 0.7, -Hh * 0.62)}${Q(0, -Hh * 1.35, w * 0.8, -Hh * 0.55)}`, crease, g.lw * 0.6, { opacity: 0.5 });
    return (hdefs.length ? `<defs>${hdefs.join('')}</defs>` : '') + group(inner, { transform: tr });
  }

  const sh = shapeFor(p.eyeShape, W, Hh);
  const doe = p.eyeShape === 'doe';
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
    `<stop offset="0" stop-color="${darken(ctx.skinShade, 0.12)}" stop-opacity="0.85"/><stop offset="0.55" stop-color="#f2e6e6" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="${shadowG}"><stop offset="0" stop-color="${shadowColor}" stop-opacity="0.42"/><stop offset="1" stop-color="${shadowColor}" stop-opacity="0"/></radialGradient>`;

  const extraDefs: string[] = [];
  let eye = '';
  // soft eyeshadow above the lid and a warm tint along the lower lid (or the chosen eyeshadow)
  if (p.eyeshadow !== 'none') {
    eye += shadowWash(ctx, extraDefs, W * 0.04, -Hh * 0.78, W * 0.56, Hh * 0.4, W, Hh);
  } else eye += ellipse(W * 0.08, -Hh * 0.42, W * 0.66, Hh * 0.62, { fill: `url(#${shadowG})` });
  if (p.eyeshadow === 'none') eye += ellipse(W * 0.06, Hh * 0.5, W * 0.5, Hh * 0.26, { fill: `url(#${shadowG})`, opacity: 0.7 });

  // sclera, iris, pupil, clipped to the eye opening
  eye += path(outlineD, { fill: '#f6eeec' });
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
  // light falling into the lower iris, and a soft window-like reflection
  inside += ellipse(0, cy + r * 0.6, r * 0.75, r * 0.35, { fill: lighten(irisColor, 0.35), opacity: 0.55, filter: `url(#${ctx.soft})` });
  inside += ellipse(r * 0.3 * sx, cy - r * 0.05, r * 0.3, r * 0.22, { fill: '#ffffff', opacity: 0.22, filter: `url(#${ctx.soft})` });
  // shadow cast by the upper lid
  inside += `<rect x="${-W * 0.6}" y="${-Hh * 0.6}" width="${W * 1.2}" height="${Hh * 1.1}" fill="url(#${lidG})"/>`;
  inside += highlights(ctx, sh, sx);
  // wet rim along the lower lid
  inside += stroke(ctx, smoothOpen([O, ...sh.low, I].map((q) => ({ x: q.x, y: q.y - Hh * 0.07 }))), '#ffffff', Math.max(0.3, lidW * 0.35), { opacity: 0.55 });
  eye += group(inside, { 'clip-path': `url(#${clip})` });

  // lower lid: fine line on the outer half, very light on the inner half
  // (doe eyes stay free of lid lines)
  if (!doe) {
    eye += stroke(ctx, smoothOpen([O, ...sh.low, I]), mix(lid, ctx.skinShade, 0.55), Math.max(0.35, lidW * 0.3), { opacity: 0.6 });
    eye += stroke(ctx, smoothOpen([O, ...sh.low.slice(0, Math.ceil(sh.low.length * 0.45))]), lid, Math.max(0.4, lidW * 0.4), { opacity: 0.55 });
  }

  // upper lash line: a filled band that thickens towards the outer corner and ends in a small soft wing
  const n = sh.up.length;
  const liner = p.eyeliner;
  const volume = p.lashes === 'volume';
  const thickF = (liner ? 1.1 : 1) * (volume ? 1.15 : 1);
  const thick = (i: number): number => lidW * (0.5 + 1.0 * Math.pow(i / (n - 1), 1.6)) * thickF;
  const top = sh.up.map((q, i) => ({ x: q.x - (i === 0 ? 0 : W * 0.01), y: q.y - thick(i) }));
  const wingLen = liner ? 0.14 : p.lashes === 'none' ? 0.05 : p.lashes === 'light' ? 0.07 : 0.09;
  // the wing continues the lid curve up and out and ends in a fine point
  const wing: Pt = { x: O.x + W * wingLen, y: O.y - Hh * (0.06 + wingLen * 1.1) };
  const wingMid: Pt = { x: O.x + W * wingLen * 0.4, y: top[n - 1].y - Hh * (liner ? 0.03 : 0.01) };
  const band = smoothOpen([...sh.up, wing]) + smoothOpen([wing, wingMid, ...top.slice().reverse()], 1 / 6, false) + 'Z';
  const lineColor = liner ? '#1a1016' : lid;
  eye += path(band, { fill: lineColor });

  // double-eyelid crease above the lid (not on doe eyes)
  if (!doe) {
    const creaseOff = sh.heavy ? Hh * 0.2 : Hh * 0.34;
    const creasePts = sh.up.slice(1).map((q, i) => ({ x: q.x * 0.95, y: q.y - thick(i + 1) - creaseOff * (0.75 + 0.25 * Math.sin((Math.PI * (i + 1)) / (n - 1))) }));
    eye += stroke(ctx, smoothOpen(creasePts), crease, Math.max(0.35, g.lw * 0.7), { opacity: sh.heavy ? 0.75 : 0.5 });
  }

  // upper lashes: few, tapered and curved; varied in length, leaning further out towards the outer corner
  const lw = Math.max(0.55, lidW * 0.5);
  const at = (f: number): Pt => {
    const i = f * (n - 1);
    const i0 = Math.floor(i), i1 = Math.min(n - 1, i0 + 1), t = i - i0;
    return { x: lerp(top[i0].x, top[i1].x, t), y: lerp(top[i0].y, top[i1].y, t) + lidW * 0.35 };
  };
  if (p.lashes !== 'none') {
    // [position along the lid (1 = outer corner), length factor]
    const ups: ReadonlyArray<readonly [number, number]> = volume
      ? [[0.34, 0.7], [0.44, 0.95], [0.53, 0.8], [0.63, 1.1], [0.72, 1.3], [0.8, 1.05], [0.87, 1.4], [0.94, 1.2], [1, 0.95]]
      : p.lashes === 'full'
        ? [[0.46, 0.75], [0.56, 0.95], [0.7, 1.05], [0.79, 0.9], [0.9, 1.2], [0.98, 1]]
        : [[0.62, 0.8], [0.8, 1], [0.95, 1.15]];
    ups.forEach(([f, lenF], k) => {
      const ang = 0.3 + 0.95 * f + 0.06 * Math.sin(k * 2.1);
      eye += lash(at(f), ang, Hh * 0.33 * lenF * (volume ? 1.05 : 1), lw * (0.9 + 0.3 * f), lineColor);
    });
  }

  // lower lashes: a few short, soft, tapered ones near the outer corner only
  if (p.lowerLashes) {
    const lowLine = [O, ...sh.low, I];
    const lowPath = (f: number): Pt => {
      const i = f * (lowLine.length - 1);
      const i0 = Math.floor(i), i1 = Math.min(lowLine.length - 1, i0 + 1), t = i - i0;
      return { x: lerp(lowLine[i0].x, lowLine[i1].x, t), y: lerp(lowLine[i0].y, lowLine[i1].y, t) };
    };
    const lows: ReadonlyArray<readonly [number, number]> = volume ? [[0.05, 1], [0.15, 0.8], [0.27, 0.9], [0.4, 0.6]] : [[0.06, 1], [0.18, 0.8], [0.32, 0.65]];
    lows.forEach(([f, lenF]) => {
      // pointing down and away from the eye; the control point turns the tip back towards the corner
      eye += lash(lowPath(f), Math.PI - 0.45 - 0.6 * f, Hh * 0.17 * lenF, lw * 0.55, lid, { opacity: 0.55 });
    });
  }
  if (p.eyeshadow === 'glitter') eye += sparkles(ctx, W, Hh, 1, 0);
  return `<defs>${defs}${extraDefs.join('')}</defs>${group(eye, { transform: tr })}`;
}

export function eyesSvg(ctx: Ctx): string {
  const { p } = ctx;
  const lo = faceLayout(ctx);
  const left = eyeSvg(ctx, -1, p.iris, lo.eyeW, lo.eyeH);
  const right = eyeSvg(ctx, 1, p.hetero ? p.iris2 : p.iris, lo.eyeW, lo.eyeH);
  return left + right;
}

