import { clamp, lerp, type Pt } from '../../core/svg';
import type { AnimeParams } from './schema';

/**
 * All measurements of one character, in local units: x = 0 is the centre line, y = 0 is the ground,
 * negative y is up. Everything else (body, clothes, face, hair, accessories) derives its positions
 * from this one object, so nothing can detach when a slider moves.
 */
export interface Geo {
  k: number; // 0 = chibi ... 1 = anime
  H: number; // total height (head top to ground)
  u: number; // head height (skull top to chin)
  headW: number;
  hw: number; // head half width
  lw: number; // line width

  yTop: number;
  yChin: number;
  yShoulder: number; // bottom of the neck
  yCrotch: number;
  yAnkle: number;
  shoeH: number;
  torsoLen: number;
  legLen: number;
  neckHW: number;

  shHW: number;
  waistHW: number;
  hipHW: number;
  chestBulge: number;

  armR: number;
  armLen: number;
  armAngle: number;

  legCx: number;
  thighHW: number;
  kneeHW: number;
  ankleHW: number;

  // layout of the finished picture
  scale: number;
  topExtra: number;
  halfW: number;
  hairHalf: number; // half width of the hair (used by the portrait view)
}

export const VIEW_W = 400;
export const VIEW_H = 600;
export const GROUND_Y = 552;

// Semi-realistic faces: a bit narrower and longer than classic anime faces.
const FACE_RATIO = { round: 0.9, oval: 0.81, heart: 0.85, square: 0.89 } as const;

export function computeGeo(p: AnimeParams): Geo {
  // Normal anime proportions only; the saved `proportion` value is ignored.
  const k = 1;
  const H = 500;
  // about 7 heads tall: a grown-up, semi-realistic figure
  const u = H * lerp(0.5, 1 / 7.1, k);
  const headW = u * FACE_RATIO[p.faceShape] * lerp(1.1, 0.93, k);
  // Body measurements use the oval head width, so the face shape never changes the body.
  const baseHeadW = u * FACE_RATIO.oval * lerp(1.1, 0.93, k);
  const hw = headW / 2;
  // fine, light line art
  const lw = clamp(u * 0.0085, 0.8, 2.2);

  const yTop = -H;
  const yChin = yTop + u;
  const neckLen = u * lerp(0.05, 0.16, k);
  const yShoulder = yChin + neckLen;
  const R = H - u - neckLen;
  const torsoLen = R * lerp(0.52, 0.4, k);
  const legLen = R - torsoLen;
  const yCrotch = yShoulder + torsoLen;
  const shoeH = clamp(u * 0.09, 11, 18);
  const yAnkle = -shoeH;

  // Below a slider's default the range is stretched past the old minimum (slimmer); at or above the
  // default the mapping is exactly the old value / 100, so existing figures do not change.
  const slimT = (v: number, def: number, lo: number): number => (v >= def ? v / 100 : lerp(lo, def / 100, v / def));
  const build = slimT(p.build, 40, -0.5);
  const sh = slimT(p.shoulders, 45, -0.3);
  const waistT = slimT(p.waist, 40, -0.4);
  const hipsT = slimT(p.hips, 50, -0.3);
  const flat = (1 - k) * 0.7; // chibi bodies are simple beans
  const shW = baseHeadW * lerp(0.6, 1.42, k) * lerp(0.84, 1.16, sh) * lerp(0.95, 1.07, build);
  const waistW = lerp(shW * lerp(0.58, 0.92, waistT) * lerp(0.92, 1.1, build), shW * 0.95, flat);
  const hipW = lerp(shW * lerp(0.66, 1.22, hipsT) * lerp(0.93, 1.1, build), shW * 0.98, flat);

  const armR = u * lerp(0.075, 0.098, k) * lerp(0.92, 1.12, build);
  const armLen = torsoLen * lerp(0.86, 1.22, k);

  const hipHW = hipW / 2;
  const legCx = hipHW * 0.5;
  const thighHW = hipHW * 0.5 * lerp(0.9, 1.04, build) - 0.6;
  const kneeHW = thighHW * lerp(0.74, 0.84, build);
  const ankleHW = Math.max(3.2, thighHW * 0.5);

  const geo: Geo = {
    k, H, u, headW, hw, lw, yTop, yChin, yShoulder, yCrotch, yAnkle, shoeH, torsoLen, legLen,
    neckHW: baseHeadW * lerp(0.115, 0.098, k),
    shHW: shW / 2, waistHW: waistW / 2, hipHW,
    chestBulge: lerp(0.0, 0.07, build) * (shW / 2),
    armR, armLen, armAngle: lerp(0.1, 0.085, k),
    legCx, thighHW, kneeHW, ankleHW,
    scale: 1, topExtra: 0, halfW: 0, hairHalf: 0,
  };

  // --- extents for scale-to-fit (generous estimates of everything that sticks out) ---
  const topU =
    Math.max(
      0.09,
      p.ahoge ? 0.32 : 0,
      p.hairBack === 'buns' ? 0.22 : 0,
      p.hairBack === 'messy' ? 0.14 : 0,
      p.hairFront === 'spiky' ? 0.12 : 0,
      { none: 0, bow: 0.12, cat: 0.3, bunny: 0.62, flower: 0.1, crown: 0.22, beret: 0.3 }[p.headAcc],
    );
  geo.topExtra = topU * u;

  const hairHalf =
    { short: 1.25, bob: 1.35, long: 1.3, wavy: 1.38, ponytail: 2.0, twintails: 2.15, buns: 1.25, sidetail: 1.9, braid: 1.6, hime: 1.4, messy: 1.45, drills: 2.2 }[p.hairBack] * hw;
  geo.hairHalf = hairHalf;
  const longSpread = ['long', 'wavy', 'hime'].includes(p.hairBack) ? geo.shHW * 1.12 : 0;
  const hemHalf = p.top === 'dress' ? hipHW * 1.12 + u * 0.16 + 4 : hipHW * 1.1 + u * 0.11 + 4;
  const bodyHalf = Math.max(geo.shHW + armR * 2 + armLen * Math.sin(geo.armAngle) + 4, hemHalf);
  geo.halfW = Math.max(hairHalf, longSpread, bodyHalf, p.headAcc === 'bunny' ? hw * 1.3 : 0);

  const availH = GROUND_Y - 22;
  const fit = Math.min(1.04, availH / (H + geo.topExtra), (VIEW_W / 2 - 8) / geo.halfW);
  geo.scale = fit * lerp(0.74, 1, p.height / 100);
  return geo;
}

/**
 * The part of the 400x600 picture that the portrait view shows (same 2:3 shape as the full picture,
 * so it fills the preview). Head and shoulders, wide enough for the hair, never larger than the
 * full picture (a chibi head is already almost the whole figure).
 */
export function portraitBox(g: Geo): { x: number; y: number; w: number; h: number } {
  const s = g.scale;
  const top = GROUND_Y + (g.yTop - g.topExtra - g.u * 0.06) * s;
  const bottom = GROUND_Y + (g.yChin + g.u * 0.6) * s;
  const half = Math.max(g.hw * 1.2, Math.min(g.hairHalf, g.hw * 2.0)) * s;
  const h = Math.min(VIEW_H, Math.max(bottom - top, half * 3)); // 2:3 -> height = 1.5 * width = 3 * half
  const w = (h * VIEW_W) / VIEW_H;
  const y = clamp((top + bottom) / 2 - h / 2, 0, VIEW_H - h);
  return { x: (VIEW_W - w) / 2, y, w, h };
}

// ---- face outline -----------------------------------------------------------------------------

type Profile = ReadonlyArray<readonly [number, number]>;

const PROFILES: Record<AnimeParams['faceShape'], Profile> = {
  round: [[0, 0], [0.06, 0.42], [0.14, 0.7], [0.28, 0.93], [0.44, 1], [0.6, 0.97], [0.74, 0.87], [0.86, 0.67], [0.95, 0.37], [1, 0]],
  oval: [[0, 0], [0.06, 0.38], [0.14, 0.64], [0.28, 0.87], [0.44, 0.98], [0.6, 0.94], [0.74, 0.82], [0.86, 0.62], [0.95, 0.33], [1, 0]],
  // wide cheekbones, a jaw that narrows gently and a small, softly rounded chin (no V point)
  heart: [[0, 0], [0.06, 0.46], [0.14, 0.77], [0.28, 0.98], [0.38, 1], [0.52, 0.93], [0.66, 0.75], [0.78, 0.56], [0.88, 0.4], [0.95, 0.28], [0.985, 0.15], [1, 0]],
  square: [[0, 0], [0.06, 0.44], [0.14, 0.72], [0.28, 0.94], [0.46, 1], [0.66, 0.97], [0.82, 0.89], [0.93, 0.64], [0.985, 0.33], [1, 0]],
};

/** Relative face half width (0..1) at t = 0 (skull top) .. 1 (chin). */
export function faceRel(g: Geo, shape: AnimeParams['faceShape'], t: number): number {
  const prof = PROFILES[shape];
  const tt = clamp(t, 0, 1);
  let rel = 0;
  for (let i = 0; i < prof.length - 1; i++) {
    const [t0, r0] = prof[i];
    const [t1, r1] = prof[i + 1];
    if (tt >= t0 && tt <= t1) {
      const f = (tt - t0) / (t1 - t0);
      rel = lerp(r0, r1, (1 - Math.cos(Math.PI * f)) / 2 * 0.35 + f * 0.65);
      break;
    }
  }
  // semi-realistic faces: widest at the cheekbones, tapering to a slim, soft chin
  const jaw = clamp((tt - 0.5) / 0.5, 0, 1);
  // (the heart shape already narrows a lot, so its jaw is slimmed less)
  return rel * (1 - (shape === 'heart' ? 0.1 : 0.24) * g.k * Math.pow(jaw, 1.5));
}

export function faceHalfWidthAt(g: Geo, shape: AnimeParams['faceShape'], y: number): number {
  return faceRel(g, shape, (y - g.yTop) / g.u) * g.hw;
}

export function facePoints(g: Geo, shape: AnimeParams['faceShape']): Pt[] {
  const prof = PROFILES[shape];
  const right: Pt[] = prof.map(([t]) => ({ x: faceRel(g, shape, t) * g.hw, y: g.yTop + t * g.u }));
  // right side top->bottom (skipping the two axis points), then the chin, then the left side back up
  const mid = right.slice(1, -1);
  return [right[0], ...mid, right[right.length - 1], ...mid.slice().reverse().map((q) => ({ x: -q.x, y: q.y }))];
}

// ---- torso silhouette -------------------------------------------------------------------------

/** Half width of the bare torso at height y (between shoulder line and crotch). */
export function torsoHW(g: Geo, y: number, grow = 0): number {
  const t = clamp((y - g.yShoulder) / g.torsoLen, 0, 1);
  const st: ReadonlyArray<readonly [number, number]> = [
    [0, g.neckHW * 1.3],
    [0.07, g.shHW * 0.97],
    [0.3, g.shHW * 0.78 + g.chestBulge],
    [0.6, g.waistHW],
    [0.88, g.hipHW],
    [1, g.hipHW * 0.97],
  ];
  for (let i = 0; i < st.length - 1; i++) {
    const [t0, w0] = st[i];
    const [t1, w1] = st[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return lerp(w0, w1, (1 - Math.cos(Math.PI * f)) / 2) + grow;
    }
  }
  return g.hipHW * 0.97 + grow;
}

/** Left-edge points (x <= 0) of the torso between two heights. */
export function torsoLeftEdge(g: Geo, y0: number, y1: number, grow = 0, steps = 10): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = lerp(y0, y1, i / steps);
    pts.push({ x: -torsoHW(g, y, grow), y });
  }
  return pts;
}

export interface ArmGeo {
  side: -1 | 1;
  x0: number;
  y0: number;
  x1: number;
  y1: number; // wrist
  r: number;
}

export function armGeo(g: Geo, side: -1 | 1): ArmGeo {
  const r = g.armR;
  const y0 = g.yShoulder + g.torsoLen * 0.075;
  const x0 = side * (g.shHW - r * 0.45);
  return {
    side, x0, y0, r,
    x1: x0 + side * Math.sin(g.armAngle) * g.armLen,
    y1: y0 + Math.cos(g.armAngle) * g.armLen,
  };
}
