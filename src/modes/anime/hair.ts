import { darken, lighten, mix, shade } from '../../core/color';
import { C, M, Q, clamp, ellipse, group, lerp, path, smoothClosed, smoothOpen, type Pt } from '../../core/svg';
import { cel, stroke, type Ctx } from './context';
import { faceHalfWidthAt, faceRel, type Geo } from './geometry';
import type { AnimeParams } from './schema';

// ---- shared helpers ---------------------------------------------------------------------------

/**
 * Hair that ends in pointed locks. `tips` run left to right; between two tips the outline rises
 * to a sharp cusp, so every lock looks like a leaf. The path continues from tips[0].
 */
function locks(tips: Pt[], depth: number, up = true): string {
  let d = '';
  for (let i = 0; i < tips.length - 1; i++) {
    const A = tips[i], B = tips[i + 1];
    const dirY = up ? -1 : 1;
    const V: Pt = { x: (A.x + B.x) / 2, y: (up ? Math.min(A.y, B.y) : Math.max(A.y, B.y)) + dirY * depth };
    const dx1 = V.x - A.x, dx2 = B.x - V.x;
    d += C(A.x + dx1 * 0.62, A.y + (V.y - A.y) * 0.1, V.x - dx1 * 0.05, V.y - (V.y - A.y) * 0.5, V.x, V.y);
    d += C(V.x + dx2 * 0.05, V.y + (B.y - V.y) * 0.5, B.x - dx2 * 0.62, B.y + (V.y - B.y) * 0.1, B.x, B.y);
  }
  return d;
}

/**
 * Bangs: every lock ends in a sharp point (steep edges at the tip, narrow gaps between locks), so the
 * fringe reads as anime hair instead of a row of round drops. Same shape contract as `locks`.
 */
function bangLocks(tips: Pt[], depth: number): string {
  let d = '';
  for (let i = 0; i < tips.length - 1; i++) {
    const A = tips[i], B = tips[i + 1];
    const V: Pt = { x: (A.x + B.x) / 2, y: Math.min(A.y, B.y) - depth };
    const dx1 = V.x - A.x, dx2 = B.x - V.x;
    const dy1 = V.y - A.y, dy2 = B.y - V.y;
    d += C(A.x + dx1 * 0.05, A.y + dy1 * 0.45, V.x - dx1 * 0.32, V.y - dy1 * 0.1, V.x, V.y);
    d += C(V.x + dx2 * 0.32, V.y + dy2 * 0.1, B.x - dx2 * 0.05, B.y - dy2 * 0.45, B.x, B.y);
  }
  return d;
}

/**
 * Gives the bang tips a sweep and uneven lengths so the fringe does not look like a comb. The two
 * outer tips stay where they are: they join the side locks.
 */
function styleBangTips(ctx: Ctx, tips: Pt[]): Pt[] {
  const { g, p } = ctx;
  if (p.hairFront === 'blunt' || p.hairFront === 'spiky' || p.hairFront === 'forehead' || p.hairFront === 'swept') return tips;
  const hw = g.hw, u = g.u;
  const LEN = [0.03, -0.02, 0.0]; // in head heights, positive = longer
  const styled = tips.map((t, i) => {
    if (i === 0 || i === tips.length - 1) return t;
    // side-swept bangs sweep one way; the others fan out from the middle
    const dir = p.hairFront === 'side' ? 1 : clamp(t.x / (hw * 0.7), -1, 1);
    return { x: t.x + dir * hw * 0.07, y: t.y + LEN[i % 3] * u };
  });
  return styled;
}

/** A soft darkening towards the lower part of a hair shape (gradient, clipped by the caller). */
function shadeOverlay(ctx: Ctx, y0: number, y1: number, color: string, opacity: number): string {
  const id = ctx.uid('hsh');
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0.toFixed(1)}" x2="0" y2="${y1.toFixed(1)}">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="${opacity}"/></linearGradient>` +
    `<rect x="-900" y="${(y0 - 600).toFixed(1)}" width="1800" height="${(y1 - y0 + 1600).toFixed(1)}" fill="url(#${id})"/>`
  );
}

/** Slightly curved strand lines running down from y0 to y1 at the given x positions (fractions of `half`). */
function strandLines(ctx: Ctx, xs: number[], half: number, y0: number, y1: number, bow: number, color: string, w: number, opacity: number): string {
  let out = '';
  xs.forEach((f, i) => {
    const x0 = f * half * 0.8;
    const x1 = f * half * (1 + bow * (i % 2 ? 0.7 : 1));
    const ya = y0 + (i % 3) * (y1 - y0) * 0.05;
    const yb = y1 - ((i + 1) % 3) * (y1 - y0) * 0.06;
    out += stroke(ctx, `${M(x0, ya)}${Q(f * half * (1 + bow * 0.4), (ya + yb) / 2, x1, yb)}`, color, w, { opacity });
  });
  return out;
}

/** A crescent-shaped shine band following the crown (the anime "angel ring"). t0..t1 pick a part of the arc. */
function shineBand(ctx: Ctx, m: HairMetrics, t0: number, t1: number, thick: number, color: string, opacity: number): string {
  const { g } = ctx;
  const P0: Pt = { x: -m.rx * 0.8, y: m.yc - g.u * 0.1 };
  const P2: Pt = { x: m.rx * 0.8, y: m.yc - g.u * 0.1 };
  const P1: Pt = { x: 0, y: g.yTop - g.u * 0.04 };
  const at = (t: number): Pt => ({
    x: (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * P1.x + t * t * P2.x,
    y: (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * P1.y + t * t * P2.y,
  });
  const top: Pt[] = [];
  const bot: Pt[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = lerp(t0, t1, i / n);
    const q = at(t);
    const th = thick * Math.pow(Math.sin(Math.PI * (i / n)), 0.8);
    top.push({ x: q.x, y: q.y });
    bot.push({ x: q.x, y: q.y + th });
  }
  return path(smoothClosed([...top, ...bot.reverse().slice(1, -1)]), { fill: color, opacity });
}

function blobPath(cx: number, cy: number, rx: number, ry: number, rot: number): string {
  const pts: Pt[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push({ x: cx + x * cr - y * sr, y: cy + x * sr + y * cr });
  }
  return smoothClosed(pts);
}

/** Depth of the notches between bang locks, in head heights. */
const BANG_DEPTH: Record<AnimeParams['hairFront'], number> = {
  straight: 0.09, side: 0.09, parted: 0.09, curtain: 0.07, blunt: 0.014, swept: 0.1, spiky: 0.12, forehead: 0.03,
};

function skullArc(g: Geo, rx: number, yc: number, vTop: number, from: number, to: number, n = 10): Pt[] {
  const ry = yc - (g.yTop - vTop);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const th = lerp(from, to, i / n);
    pts.push({ x: rx * Math.cos(th), y: yc - ry * Math.sin(th) });
  }
  return pts;
}

interface HairMetrics {
  rx: number;
  yc: number;
  vTop: number;
}

function metrics(ctx: Ctx): HairMetrics {
  const { g, p } = ctx;
  const t = 0.34;
  return { rx: faceRel(g, p.faceShape, t) * g.hw + g.hw * 0.085, yc: g.yTop + t * g.u, vTop: g.u * 0.06 };
}

const isLong = (p: AnimeParams): boolean => p.hairBack === 'long' || p.hairBack === 'wavy' || p.hairBack === 'hime';

/** Lowest y reached by the hair at the back (used for the colour gradient and clamping). */
function hairEnd(ctx: Ctx): number {
  const { g, p } = ctx;
  const L01 = p.hairLength / 100;
  switch (p.hairBack) {
    case 'short': return g.yTop + g.u * 0.82;
    case 'bob': return g.yChin + g.u * 0.13;
    case 'long':
    case 'hime':
    case 'wavy': return Math.min(-14, g.yShoulder + g.torsoLen * lerp(0.1, 1.0, L01));
    case 'messy': return g.yTop + g.u * 0.82;
    case 'sidetail': return Math.min(-14, g.yTop + g.u * lerp(1.3, 2.5, L01));
    case 'braid': return Math.min(-14, g.yShoulder + g.torsoLen * lerp(0.12, 0.8, L01));
    case 'drills': return Math.min(-14, g.yTop + g.u * lerp(1.0, 2.1, L01));
    case 'ponytail': return Math.min(-14, g.yTop + g.u * lerp(0.9, 2.4, L01));
    case 'twintails': return Math.min(-14, g.yTop + g.u * lerp(0.95, 2.3, L01));
    case 'buns': return g.yTop + g.u * 0.82;
  }
}

/** Lowest y of the hair mass behind the head (tails and braids hang separately). */
function massEnd(ctx: Ctx): number {
  const { g, p } = ctx;
  switch (p.hairBack) {
    case 'sidetail':
    case 'braid': return g.yChin + g.u * 0.13;
    case 'drills': return g.yTop + g.u * 0.9;
    default: return hairEnd(ctx);
  }
}

/** Fill for hair: plain colour or a vertical gradient towards the tip colour. */
function hairFills(ctx: Ctx): { defs: string; fill: string; shade: string } {
  const { p, g } = ctx;
  const s = p.tipStrength / 100;
  if (s < 0.02) return { defs: '', fill: p.hairColor, shade: ctx.hairShade };
  const id = ctx.uid('hg');
  const ids = ctx.uid('hgs');
  const y0 = g.yTop + g.u * 0.34;
  const y1 = Math.max(y0 + 20, hairEnd(ctx));
  const mk = (gid: string, a: string, b: string): string =>
    `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0.toFixed(1)}" x2="0" y2="${y1.toFixed(1)}">` +
    `<stop offset="${lerp(0.9, 0.18, s).toFixed(2)}" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const tip = p.hairTip;
  return {
    defs: mk(id, p.hairColor, tip) + mk(ids, ctx.hairShade, shade(tip, 1.2)),
    fill: `url(#${id})`,
    shade: `url(#${ids})`,
  };
}

// ---- back hair --------------------------------------------------------------------------------

function backMass(ctx: Ctx): { d: string; yEnd: number } {
  const { g, p } = ctx;
  const m = metrics(ctx);
  const hw = g.hw;
  const style = p.hairBack;
  const yEnd = massEnd(ctx);
  let wTop = hw * 1.14;
  let wEnd = hw * 1.05;
  let nTips = 6;
  let wave = 0;
  let inward = 0;
  if (style === 'bob' || style === 'sidetail' || style === 'braid') { wTop = hw * 1.2; wEnd = hw * 1.12; inward = hw * 0.08; }
  if (style === 'messy') { wTop = hw * 1.2; wEnd = hw * 1.1; nTips = 7; inward = hw * 0.04; }
  if (isLong(p)) {
    wTop = hw * 1.16;
    wEnd = Math.max(hw * 1.1, g.shHW * 0.95);
    nTips = style === 'hime' ? 3 : 7;
    if (style === 'wavy') wave = hw * 0.1;
  }
  if (style === 'short' || style === 'buns' || style === 'ponytail' || style === 'twintails' || style === 'drills') { wTop = hw * 1.12; wEnd = hw * 1.0; nTips = 5; }

  const y0 = m.yc;
  const left: Pt[] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const y = lerp(y0, yEnd, f);
    const base = f < 0.35 ? lerp(m.rx, wTop, f / 0.35) : lerp(wTop, wEnd, (f - 0.35) / 0.65);
    const w = base + (wave ? Math.sin(f * Math.PI * 3.2) * wave * f : 0);
    left.push({ x: -w, y });
  }
  const right = left.map((q) => ({ x: -q.x, y: q.y })).reverse();

  // pointed bottom
  const tips: Pt[] = [];
  const wb = left[left.length - 1].x;
  for (let i = 0; i < nTips; i++) {
    const f = i / (nTips - 1);
    const x = lerp(wb, -wb, f);
    const bump = (i % 2 === 0 ? 0 : -g.u * (style === 'messy' ? 0.1 : 0.045)) + (wave ? Math.sin(f * 6) * g.u * 0.03 : 0);
    const edgeIn = Math.sin(f * Math.PI);
    const blunt = style === 'hime';
    tips.push({ x: x * (1 - inward / Math.max(1, Math.abs(wb)) * (1 - edgeIn)), y: yEnd + (blunt ? 0 : bump + (1 - edgeIn) * g.u * 0.02) });
  }
  tips[0] = left[left.length - 1];
  tips[tips.length - 1] = { x: -left[left.length - 1].x, y: left[left.length - 1].y };

  const arcTop = skullArc(g, m.rx, m.yc, m.vTop, 0, Math.PI, 12);
  const d =
    M(left[0].x, left[0].y) + smoothOpen([...left.slice(0, -1), tips[0]], 1 / 6, false) +
    locks(tips, g.u * (style === 'hime' ? 0.014 : style === 'messy' ? 0.13 : 0.08), true) +
    smoothOpen([tips[tips.length - 1], ...right.slice(1)], 1 / 6, false) +
    smoothOpen(arcTop, 1 / 6, false) + 'Z';
  return { d, yEnd };
}

function tailPath(ctx: Ctx, side: 1 | -1, tie: Pt, endY: number, sway: number): string {
  const { g } = ctx;
  const hw = g.hw;
  const s = side;
  const len = endY - tie.y;
  const tipC: Pt = { x: tie.x + s * hw * sway, y: endY };
  const wEnd = hw * 0.34;
  const Tout: Pt = { x: tie.x + s * hw * 0.18, y: tie.y - g.u * 0.02 };
  const Tin: Pt = { x: tie.x - s * hw * 0.16, y: tie.y + g.u * 0.03 };
  const tips: Pt[] = [
    { x: tipC.x + s * wEnd, y: endY - g.u * 0.04 },
    { x: tipC.x, y: endY + g.u * 0.05 },
    { x: tipC.x - s * wEnd, y: endY - g.u * 0.02 },
  ];
  // outer edge (away from the head), then the lock tips, then the inner edge back up
  const outerEnd = tips[0];
  const innerEnd = tips[2];
  let d = M(Tout.x, Tout.y);
  d += C(tie.x + s * hw * (0.55 + sway * 0.55), tie.y + len * 0.04, tipC.x + s * hw * (0.5 + sway * 0.25), tie.y + len * 0.5, outerEnd.x, outerEnd.y);
  d += locks(tips, g.u * 0.1, true);
  d += C(innerEnd.x - s * hw * 0.2, endY - len * 0.4, tie.x - s * hw * 0.42, tie.y + len * 0.3, Tin.x, Tin.y);
  d += Q(tie.x - s * hw * 0.02, tie.y - g.u * 0.045, Tout.x, Tout.y) + 'Z';
  return d;
}

function bunPath(cx: number, cy: number, r: number): string {
  return (
    M(cx - r, cy) + C(cx - r, cy - r * 1.25, cx + r, cy - r * 1.25, cx + r, cy) +
    C(cx + r * 1.05, cy + r * 0.9, cx - r * 1.05, cy + r * 0.9, cx - r, cy) + 'Z'
  );
}

/** Pointed tufts sticking out around the head for the messy short cut (drawn behind the hair mass). */
function messyTufts(ctx: Ctx, fills: { fill: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const m = metrics(ctx);
  const u = g.u;
  const ring = skullArc(g, m.rx * 1.06, m.yc, m.vTop - u * 0.02, 0, Math.PI, 10);
  // [index on the ring, length in head heights, sideways lean]
  const spec: Array<[number, number, number]> = [[1, 0.16, 0.5], [2, 0.13, 0.3], [3, 0.17, 0.2], [4, 0.12, 0.1], [5, 0.16, -0.1], [6, 0.12, -0.2], [7, 0.17, -0.3], [8, 0.13, -0.4], [9, 0.16, -0.5]];
  let out = '';
  const tuft = (P: Pt, nx: number, ny: number, len: number, lean: number, half: number): string => {
    const tx = -ny, ty = nx; // tangent
    const B1: Pt = { x: P.x - tx * half, y: P.y - ty * half };
    const B2: Pt = { x: P.x + tx * half, y: P.y + ty * half };
    const T: Pt = { x: P.x + nx * len + tx * lean * len * 0.5, y: P.y + ny * len + ty * lean * len * 0.5 };
    return M(B1.x, B1.y) + Q(P.x + nx * len * 0.5 - tx * half * 0.4, P.y + ny * len * 0.5 - ty * half * 0.4, T.x, T.y) + Q(P.x + nx * len * 0.5 + tx * half * 0.6, P.y + ny * len * 0.5 + ty * half * 0.6, B2.x, B2.y) + 'Z';
  };
  for (const [i, len, lean] of spec) {
    const P = ring[i];
    const nx = P.x / (m.rx * 1.06), ny = (P.y - m.yc) / Math.max(1, m.yc - (g.yTop - u * 0.04));
    const l = Math.hypot(nx, ny) || 1;
    out += cel(ctx, tuft(P, nx / l, ny / l, len * u, lean, u * 0.075), fills.fill, opts);
  }
  // down-pointing tufts beside the cheeks
  for (const sd of [-1, 1] as const) {
    for (const [dy, len] of [[0.12, 0.2], [0.3, 0.17]] as const) {
      const P: Pt = { x: sd * m.rx * 1.02, y: m.yc + u * dy };
      out += cel(ctx, tuft(P, sd * 0.75, 0.66, len * u, sd * -0.3, u * 0.07), fills.fill, opts);
    }
  }
  return out;
}

/** Strand lines, shade and a shine stripe for a hanging tail (shared by tails and the side ponytail). */
function tailFinish(ctx: Ctx, fills: { shade: string }, side: 1 | -1, tie: Pt, endY: number, sway: number): string {
  const { g } = ctx;
  const hw = g.hw, s = side;
  const len = endY - tie.y;
  const tipX = tie.x + s * hw * sway;
  const line = (off: number, color: string, w: number, op: number): string =>
    stroke(ctx, `${M(tie.x + s * hw * off * 0.4, tie.y + len * 0.02)}${Q(tie.x + s * hw * (0.45 + sway * 0.45 + off), tie.y + len * 0.5, tipX + s * hw * off * 0.6, endY - g.u * 0.02)}`, color, w, { opacity: op });
  return (
    shadeOverlay(ctx, tie.y, endY, fills.shade, 0.5) +
    line(-0.12, ctx.hairShade, Math.max(0.7, g.lw * 0.7), 0.45) +
    line(0.1, ctx.hairShade, Math.max(0.7, g.lw * 0.7), 0.4) +
    line(-0.03, ctx.hairLight, Math.max(1, g.lw * 1.3), 0.4)
  );
}

/** One drill curl: a stack of tilted, shrinking coils hanging from the tie. */
function drillCurl(ctx: Ctx, fills: { fill: string; shade: string }, side: 1 | -1, tie: Pt, endY: number, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const hw = g.hw, s = side;
  const len = endY - tie.y;
  const n = Math.max(5, Math.round(len / (g.u * 0.13)));
  let out = '';
  // coils are drawn from the bottom up, so each upper coil overlaps the one below it
  for (let i = n - 1; i >= 0; i--) {
    const t = i / (n - 1);
    const cx = tie.x + s * hw * (0.3 + 0.1 * t) + s * Math.sin(t * Math.PI * 3) * hw * 0.04;
    const cy = tie.y + g.u * 0.05 + (len - g.u * 0.1) * t;
    const rx = hw * 0.4 * (1 - 0.55 * t);
    const ry = Math.max(rx * 0.7, (len / n) * 0.75);
    out += cel(ctx, blobPath(cx, cy, rx, ry, s * -1.15), fills.fill, {
      ...opts,
      inside: stroke(ctx, `${M(cx - rx * 0.5, cy - ry * 0.5)}${Q(cx - rx * 0.1, cy - ry * 0.1, cx - rx * 0.4, cy + ry * 0.4)}`, ctx.hairLight, g.lw * 1.4, { opacity: 0.45 }),
    });
  }
  return out;
}

/** A single braid hanging over the shoulder: overlapping links, a tuft and a tie. */
function braidSvg(ctx: Ctx, fills: { fill: string }, side: 1 | -1): string {
  const { g, p } = ctx;
  const hw = g.hw, s = side;
  const endY = hairEnd(ctx);
  const y0 = g.yTop + g.u * 0.52;
  const x0 = s * hw * 0.84;
  const x1 = s * hw * 0.9;
  const len = endY - y0;
  const n = Math.max(5, Math.round(len / (g.u * 0.12)));
  const opts = { line: ctx.hairLine, shadeColor: ctx.hairShade, dx: -g.lw * 1.4, dy: -g.lw * 0.9 };
  let out = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const cx = lerp(x0, x1, t) + Math.sin(t * Math.PI * 2) * hw * 0.05 * s;
    const cy = y0 + (len - g.u * 0.1) * t;
    const rx = hw * 0.22 * (1 - 0.4 * t);
    const ry = (len / n) * 0.78;
    const rot = (i % 2 === 0 ? 1 : -1) * 0.5;
    out += cel(ctx, blobPath(cx, cy, rx, ry, rot), fills.fill, {
      ...opts,
      inside: stroke(ctx, `${M(cx - rx * 0.2, cy - ry * 0.7)}${Q(cx + rx * 0.6, cy, cx - rx * 0.1, cy + ry * 0.6)}`, ctx.hairLight, g.lw * 1.2, { opacity: 0.4 }),
    });
  }
  // tuft below the last link
  const tx = lerp(x0, x1, 1);
  const ty = y0 + (len - g.u * 0.1);
  const w = hw * 0.15;
  const tuft = M(tx - w, ty) + Q(tx - w * 1.2, ty + g.u * 0.1, tx - w * 0.2, ty + g.u * 0.2) + Q(tx + w * 0.1, ty + g.u * 0.1, tx + w * 0.55, ty + g.u * 0.17) + Q(tx + w * 1.3, ty + g.u * 0.06, tx + w, ty) + 'Z';
  out += cel(ctx, tuft, fills.fill, opts);
  const tieColor = p.headAcc !== 'none' ? p.headAccColor : '#ff8fb1';
  out += ellipse(tx, ty - g.u * 0.01, w * 1.35, g.u * 0.032, { fill: tieColor, stroke: mix(tieColor, '#5a2040', 0.45), 'stroke-width': g.lw * 0.8 });
  return out;
}

export function hairBackSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const fills = hairFills(ctx);
  const line = ctx.hairLine;
  const hw = g.hw;
  const L01 = p.hairLength / 100;
  let out = fills.defs;
  const opts = { line, shadeColor: fills.shade, dx: -g.lw * 2.2, dy: -g.lw * 1.2 };
  const tieColor = p.headAcc !== 'none' ? p.headAccColor : '#ff8fb1';
  const tie = (x: number, y: number, rx: number, ry: number, rot: number): string =>
    ellipse(x, y, rx, ry, { fill: tieColor, stroke: mix(tieColor, '#5a2040', 0.45), 'stroke-width': g.lw * 0.8, transform: `rotate(${rot} ${x} ${y})` });

  if (p.hairBack === 'ponytail') {
    const t: Pt = { x: hw * 0.74, y: g.yTop + g.u * 0.12 };
    const endY = hairEnd(ctx);
    out += cel(ctx, tailPath(ctx, 1, t, endY, 0.72), fills.fill, { ...opts, inside: tailFinish(ctx, fills, 1, t, endY, 0.72) });
    out += tie(t.x + hw * 0.02, t.y + g.u * 0.01, hw * 0.2, g.u * 0.045, -25);
  } else if (p.hairBack === 'twintails') {
    const endY = hairEnd(ctx);
    for (const s of [-1, 1] as const) {
      const t: Pt = { x: s * hw * 0.9, y: g.yTop + g.u * 0.22 };
      const sway = lerp(0.45, 0.65, L01);
      out += cel(ctx, tailPath(ctx, s, t, endY, sway), fills.fill, { ...opts, inside: tailFinish(ctx, fills, s, t, endY, sway) });
      out += tie(t.x + s * hw * 0.02, t.y + g.u * 0.01, hw * 0.17, g.u * 0.04, s * 25);
    }
  } else if (p.hairBack === 'messy') {
    out += messyTufts(ctx, fills, opts);
  } else if (p.hairBack === 'drills') {
    const endY = hairEnd(ctx);
    for (const s of [-1, 1] as const) {
      const t: Pt = { x: s * hw * 0.9, y: g.yTop + g.u * 0.22 };
      out += drillCurl(ctx, fills, s, t, endY, opts);
      out += tie(t.x + s * hw * 0.02, t.y + g.u * 0.01, hw * 0.17, g.u * 0.04, s * 25);
    }
  } else if (p.hairBack === 'buns') {
    const r = hw * 0.31;
    for (const s of [-1, 1] as const) {
      const cx = s * hw * 0.68;
      const cy = g.yTop - g.u * 0.01;
      out += cel(ctx, bunPath(cx, cy - r * 0.2, r), fills.fill, {
        ...opts,
        inside: stroke(ctx, `${M(cx - r * 0.5, cy - r * 0.5)}${Q(cx, cy - r * 1.25, cx + r * 0.6, cy - r * 0.35)}`, lighten(p.hairColor, 0.18), g.lw * 1.6, { opacity: 0.5 }),
      });
      out += tie(cx - s * r * 0.1, cy + r * 0.55, r * 0.9, g.u * 0.032, 0);
    }
  }

  const { d, yEnd } = backMass(ctx);
  const m = metrics(ctx);
  const faceShadow = path(ctx.faceD, {
    fill: mix(ctx.hairShade, '#000000', 0.12),
    stroke: mix(ctx.hairShade, '#000000', 0.12),
    'stroke-width': g.u * 0.1,
    'stroke-linejoin': 'round',
    opacity: 0.55,
    transform: `translate(0 ${g.u * 0.045})`,
  });
  const inside =
    faceShadow +
    shadeOverlay(ctx, m.yc, yEnd, ctx.hairShade, 0.55) +
    strandLines(ctx, [-0.88, -0.64, -0.4, 0.4, 0.64, 0.88], hw * 1.1, m.yc + g.u * 0.1, yEnd - g.u * 0.04, 0.12, ctx.hairShade, Math.max(0.7, g.lw * 0.7), 0.4) +
    strandLines(ctx, [-0.76, -0.52, 0.52, 0.76], hw * 1.1, m.yc + g.u * 0.15, yEnd - g.u * 0.2, 0.1, ctx.hairLight, Math.max(0.8, g.lw * 0.8), 0.35) +
    strandLines(ctx, [-0.96, -0.82, -0.7, -0.58, -0.46, 0.46, 0.58, 0.7, 0.82, 0.96], hw * 1.1, m.yc + g.u * 0.05, yEnd - g.u * 0.08, 0.14, ctx.hairShade, Math.max(0.3, g.lw * 0.4), 0.35) +
    strandLines(ctx, [-0.9, -0.64, -0.5, 0.5, 0.64, 0.9], hw * 1.1, m.yc + g.u * 0.2, yEnd - g.u * 0.3, 0.12, ctx.hairRim, Math.max(0.3, g.lw * 0.4), 0.3) +
    lightSide(ctx) +
    rimLight(ctx, d);
  out += cel(ctx, d, fills.fill, { ...opts, inside });
  return out;
}

// ---- front hair (bangs + side locks + cap) ------------------------------------------------------

function bangTips(ctx: Ctx): { tips: Pt[]; crown: number } {
  const { g, p } = ctx;
  const hw = g.hw, u = g.u, top = g.yTop;
  const P = (fx: number, fy: number): Pt => ({ x: fx * hw, y: top + fy * u });
  switch (p.hairFront) {
    case 'straight':
      return { tips: [P(-0.7, 0.33), P(-0.5, 0.37), P(-0.28, 0.34), P(-0.06, 0.38), P(0.16, 0.34), P(0.38, 0.37), P(0.58, 0.34), P(0.7, 0.33)], crown: 0 };
    case 'side':
      return { tips: [P(-0.7, 0.3), P(-0.46, 0.21), P(-0.2, 0.26), P(0.06, 0.31), P(0.3, 0.38), P(0.52, 0.44), P(0.7, 0.4)], crown: -0.35 };
    case 'parted':
      return { tips: [P(-0.7, 0.36), P(-0.5, 0.38), P(-0.3, 0.33), P(-0.08, 0.2), P(0.08, 0.2), P(0.3, 0.33), P(0.5, 0.38), P(0.7, 0.36)], crown: 0 };
    case 'blunt':
      return { tips: [P(-0.7, 0.35), P(-0.26, 0.4), P(0.26, 0.4), P(0.7, 0.35)], crown: 0 };
    case 'swept':
      return { tips: [P(-0.7, 0.42), P(-0.5, 0.46), P(-0.28, 0.38), P(-0.02, 0.27), P(0.22, 0.2), P(0.46, 0.27), P(0.7, 0.34)], crown: 0.4 };
    case 'spiky':
      return { tips: [P(-0.7, 0.34), P(-0.44, 0.42), P(-0.17, 0.26), P(0.1, 0.43), P(0.38, 0.28), P(0.7, 0.34)], crown: 0 };
    case 'forehead':
      return { tips: [P(-0.7, 0.3), P(-0.44, 0.17), P(-0.14, 0.1), P(0.16, 0.11), P(0.45, 0.18), P(0.7, 0.3)], crown: 0 };
    case 'curtain':
      return { tips: [P(-0.7, 0.5), P(-0.5, 0.44), P(-0.3, 0.33), P(-0.1, 0.25), P(0.1, 0.25), P(0.3, 0.33), P(0.5, 0.44), P(0.7, 0.5)], crown: 0 };
  }
}

interface LockSpec { tipX: number; tipY: number; flick: number }

function sideLock(ctx: Ctx): LockSpec {
  const { g, p } = ctx;
  const hw = g.hw;
  const L01 = p.hairLength / 100;
  let ty: number;
  switch (p.hairBack) {
    case 'bob': ty = g.yChin + g.u * 0.07; break;
    case 'long':
    case 'wavy': ty = g.yShoulder + g.torsoLen * lerp(0.1, 0.8, L01); break;
    case 'hime': ty = g.yShoulder + g.torsoLen * lerp(0.0, 0.45, L01); break;
    case 'messy': ty = g.yTop + g.u * 0.72; break;
    default: ty = g.yTop + g.u * 0.78;
  }
  ty = Math.min(ty, -16);
  const t = (ty - g.yTop) / g.u;
  const tx = t <= 1 ? faceHalfWidthAt(g, p.faceShape, ty) - hw * 0.02 : hw * lerp(0.72, 0.6, clamp((t - 1) / 1.2, 0, 1));
  return { tipX: tx, tipY: ty, flick: p.hairBack === 'wavy' ? hw * 0.2 : 0 };
}

export function hairFrontSvg(ctx: Ctx): string {
  const { g, p } = ctx;
  const fills = hairFills(ctx);
  const hw = g.hw, u = g.u;
  const m = metrics(ctx);
  const { tips: rawTips, crown } = bangTips(ctx);
  const tips = styleBangTips(ctx, rawTips);
  const lock = sideLock(ctx);

  const jl = tips[0];
  const jr = tips[tips.length - 1];
  const A: Pt = { x: -m.rx, y: m.yc };
  const sx = lock.tipX;
  const ty = lock.tipY;
  const dyL = ty - A.y;

  const sidePath = (s: 1 | -1): { down: string; up: string } => {
    // outer edge goes from the temple down to the tip, the inner edge returns to the bangs
    const tipPt: Pt = { x: s * (sx + lock.flick), y: ty };
    const edge = (y: number): number => faceHalfWidthAt(g, p.faceShape, Math.min(y, g.yChin - u * 0.02));
    const o1: Pt = { x: s * (edge(A.y + dyL * 0.35) + hw * 0.1), y: A.y + dyL * 0.4 };
    const o2: Pt = { x: s * (edge(A.y + dyL * 0.8) + hw * 0.06 + lock.flick * 0.4), y: A.y + dyL * 0.82 };
    const i1: Pt = { x: s * (sx - hw * 0.1 + lock.flick), y: ty - dyL * 0.18 };
    const i2: Pt = { x: s * hw * 0.93, y: A.y + dyL * 0.38 };
    const j: Pt = { x: s * Math.abs(s === -1 ? jl.x : jr.x), y: s === -1 ? jl.y : jr.y };
    return {
      down: C(o1.x, o1.y, o2.x, o2.y, tipPt.x, tipPt.y),
      up: C(i1.x, i1.y, i2.x, i2.y, j.x, j.y),
    };
  };
  const left = sidePath(-1);
  const arcR = skullArc(g, m.rx, m.yc, m.vTop, 0, Math.PI, 12);
  // right side: from jr inner edge down to the tip, then outer edge back up to the temple
  const rightTipPt: Pt = { x: sx + lock.flick, y: ty };
  const rInner = (() => {
    const dy = ty - A.y;
    const i1: Pt = { x: sx - hw * 0.1 + lock.flick, y: ty - dy * 0.18 };
    const i2: Pt = { x: hw * 0.93, y: A.y + dy * 0.38 };
    return C(i2.x, i2.y, i1.x, i1.y, rightTipPt.x, rightTipPt.y);
  })();
  const rOuter = (() => {
    const dy = ty - A.y;
    const edge = (y: number): number => faceHalfWidthAt(g, p.faceShape, Math.min(y, g.yChin - u * 0.02));
    const o1: Pt = { x: edge(A.y + dy * 0.35) + hw * 0.1, y: A.y + dy * 0.4 };
    const o2: Pt = { x: edge(A.y + dy * 0.8) + hw * 0.06 + lock.flick * 0.4, y: A.y + dy * 0.82 };
    return C(o2.x, o2.y, o1.x, o1.y, m.rx, m.yc);
  })();

  const d =
    M(A.x, A.y) + left.down + left.up +
    bangLocks(tips, u * BANG_DEPTH[p.hairFront]) +
    rInner + rOuter +
    smoothOpen(arcR, 1 / 6, false) + 'Z';

  // texture strands from the crown to the tips (dark lines with a light twin beside them)
  let strands = '';
  const crownX = crown * hw;
  const sw = Math.max(0.4, g.lw * 0.55);
  for (let i = 1; i < tips.length - 1; i++) {
    const tp = tips[i];
    const line = (off: number, end: number): string =>
      `${M(crownX * 0.9 + (tp.x - crownX) * 0.12 + off, g.yTop - u * 0.02)}${Q(crownX + (tp.x - crownX) * 0.9 + off, g.yTop + (tp.y - g.yTop) * 0.35, tp.x * 0.98 + off, tp.y - u * end)}`;
    strands += stroke(ctx, line(0, 0.04), ctx.hairShade, sw, { opacity: 0.4 });
    strands += stroke(ctx, line(hw * 0.035, 0.07), ctx.hairLight, sw * 0.8, { opacity: 0.4 });
    strands += stroke(ctx, line(-hw * 0.03, 0.09), ctx.hairShade, sw * 0.7, { opacity: 0.25 });
  }
  // flow lines on the side locks
  for (const sd of [-1, 1] as const) {
    const lx = (f: number): number => sd * (hw * f);
    strands += stroke(ctx, `${M(sd * m.rx * 0.92, m.yc + u * 0.02)}${Q(lx(1.02), (m.yc + ty) / 2, sd * sx * 0.96, ty - u * 0.05)}`, ctx.hairShade, sw, { opacity: 0.45 });
    strands += stroke(ctx, `${M(sd * m.rx * 0.8, m.yc + u * 0.05)}${Q(lx(0.92), (m.yc + ty) / 2, sd * sx * 0.82, ty - u * 0.1)}`, ctx.hairLight, sw, { opacity: 0.35 });
  }
  // darker underside towards the tips, and the shine band (angel ring) with a bright core
  const underside = shadeOverlay(ctx, g.yTop + u * 0.12, Math.max(g.yTop + u * 0.5, ty), ctx.hairShade, 0.5);
  // soft sheen on the crown instead of a hard shine band, with a few fine bright strands in it
  const ring =
    group(shineBand(ctx, m, 0.05, 0.62, u * 0.09, ctx.hairLight, 0.5) + shineBand(ctx, m, 0.7, 0.95, u * 0.05, ctx.hairLight, 0.4), { filter: `url(#${ctx.soft})` }) +
    sheenStrands(ctx, m, crownX, tips);
  const ring2 = '';

  let out = fills.defs;
  if (p.hairBack === 'sidetail') {
    const t: Pt = { x: -hw * 0.93, y: g.yTop + g.u * 0.3 };
    const endY = hairEnd(ctx);
    const sway = 0.38;
    const tieColor = p.headAcc !== 'none' ? p.headAccColor : '#ff8fb1';
    out += cel(ctx, tailPath(ctx, -1, t, endY, sway), fills.fill, {
      line: ctx.hairLine, shadeColor: fills.shade, dx: g.lw * 2.2, dy: -g.lw * 1.2, inside: tailFinish(ctx, fills, -1, t, endY, sway),
    });
    out += ellipse(t.x - hw * 0.02, t.y + u * 0.01, hw * 0.2, u * 0.045, { fill: tieColor, stroke: mix(tieColor, '#5a2040', 0.45), 'stroke-width': g.lw * 0.8, transform: `rotate(25 ${t.x - hw * 0.02} ${t.y + u * 0.01})` });
  } else if (p.hairBack === 'braid') {
    out += braidSvg(ctx, fills, 1);
  }
  // ahoge (grows from under the cap)
  if (p.ahoge) {
    const x0 = hw * 0.02;
    const y0 = g.yTop - u * 0.015;
    const h = u * 0.32;
    const bw = hw * 0.07;
    const dAh =
      M(x0 - bw, y0 + u * 0.03) + C(x0 - bw * 1.6, y0 - h * 0.5, x0 - hw * 0.02, y0 - h * 0.9, x0 + hw * 0.22, y0 - h) +
      C(x0 + hw * 0.04, y0 - h * 0.62, x0 + bw * 1.6, y0 - h * 0.25, x0 + bw, y0 + u * 0.03) + 'Z';
    out += cel(ctx, dAh, fills.fill, { line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 1.2, dy: -g.lw * 0.6 });
  }
  // soft shadow of the bangs on the forehead
  out += group(
    path(d, { fill: mix(ctx.skinShade, '#a0606e', 0.45), opacity: 0.6, transform: `translate(${g.hw * 0.03} ${u * 0.06})`, filter: `url(#${ctx.soft})` }),
    { 'clip-path': `url(#${ctx.faceClip})` },
  );
  // see-through bang tips: the hair fades out towards the ends of the bangs (not the side locks)
  const fade = ctx.uid('bfade');
  const fadeG = ctx.uid('bfadeg');
  const tipTop = Math.min(...tips.map((q) => q.y));
  const tipBot = Math.max(...tips.map((q) => q.y)) + u * 0.05;
  const fadeOn = p.hairFront !== 'blunt' && p.hairFront !== 'forehead';
  if (fadeOn) {
    out +=
      `<linearGradient id="${fadeG}" gradientUnits="userSpaceOnUse" x1="0" y1="${(tipTop - u * 0.12).toFixed(1)}" x2="0" y2="${tipBot.toFixed(1)}">` +
      `<stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#999"/><stop offset="1" stop-color="#1a1a1a"/></linearGradient>` +
      `<mask id="${fade}" maskUnits="userSpaceOnUse" x="${(-g.hw * 4).toFixed(1)}" y="${(g.yTop - g.u * 2).toFixed(1)}" width="${(g.hw * 8).toFixed(1)}" height="${(g.u * 8).toFixed(1)}">` +
      `<rect x="${(-g.hw * 4).toFixed(1)}" y="${(g.yTop - g.u * 2).toFixed(1)}" width="${(g.hw * 8).toFixed(1)}" height="${(g.u * 8).toFixed(1)}" fill="#fff"/>` +
      `<rect x="${(jl.x + g.hw * 0.05).toFixed(1)}" y="${(tipTop - u * 0.12).toFixed(1)}" width="${(jr.x - jl.x - g.hw * 0.1).toFixed(1)}" height="${(tipBot - tipTop + u * 0.3).toFixed(1)}" fill="url(#${fadeG})" filter="url(#${ctx.soft})"/></mask>`;
  }
  const front = cel(ctx, d, fills.fill, {
    line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 2.4, dy: -g.lw * 1.3,
    inside: underside + lightSide(ctx) + strands + fineStrands(ctx, tips, crownX, m, sx, ty) + ring + ring2 + rimLight(ctx, smoothOpen(arcR)),
  });
  const wisps = bangWisps(ctx, mix(p.hairColor, ctx.hairShade, 0.55), tips);
  out += fadeOn ? group(front + wisps, { mask: `url(#${fade})` }) : front + wisps;
  out += flyaways(ctx, m, ty);
  return out;
}

/** Light from the upper left: lighter hair on that side, deeper shadow on the right. */
function lightSide(ctx: Ctx): string {
  const { g } = ctx;
  const id = ctx.uid('hls');
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(-g.hw * 1.2).toFixed(1)}" y1="${(g.yTop - g.u * 0.1).toFixed(1)}" x2="${(g.hw * 1.3).toFixed(1)}" y2="${(g.yTop + g.u * 0.9).toFixed(1)}">` +
    `<stop offset="0" stop-color="${ctx.hairLight}" stop-opacity="0.55"/><stop offset="0.45" stop-color="${ctx.hairLight}" stop-opacity="0"/>` +
    `<stop offset="0.6" stop-color="${ctx.hairShade}" stop-opacity="0"/><stop offset="1" stop-color="${darken(ctx.hairShade, 0.06)}" stop-opacity="0.6"/></linearGradient>` +
    `<rect x="${(-g.hw * 3).toFixed(1)}" y="${(g.yTop - g.u).toFixed(1)}" width="${(g.hw * 6).toFixed(1)}" height="${(g.u * 6).toFixed(1)}" fill="url(#${id})"/>`
  );
}

/** Deterministic pseudo-random number in 0..1 (the same character always looks the same). */
const hash = (i: number): number => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Many fine single strands from the crown to the bang tips and down the side locks, in dark, light and
 * warm back-lit tones: the painted look of real hair. Clipped to the hair shape by the caller.
 */
function fineStrands(ctx: Ctx, tips: Pt[], crownX: number, m: HairMetrics, lockX: number, lockY: number): string {
  const { g } = ctx;
  const u = g.u;
  const N = 30;
  const x0 = tips[0].x, x1 = tips[tips.length - 1].x;
  const tipY = (x: number): number => {
    for (let i = 0; i < tips.length - 1; i++) {
      const A = tips[i], B = tips[i + 1];
      if (x >= A.x && x <= B.x) return lerp(A.y, B.y, (x - A.x) / Math.max(1e-6, B.x - A.x));
    }
    return tips[0].y;
  };
  let out = '';
  for (let j = 0; j < N; j++) {
    const f = j / (N - 1);
    const r = hash(j);
    const tone = j % 3 === 0 ? ctx.hairLight : j % 3 === 1 ? darken(ctx.hairShade, 0.05) : ctx.hairRim;
    const op = j % 3 === 0 ? 0.55 : j % 3 === 1 ? 0.5 : 0.35;
    const w = Math.max(0.3, g.lw * (0.4 + 0.4 * r));
    let d: string;
    if (f > 0.12 && f < 0.88) {
      // bangs: from the crown down to just above the tip line
      const tx = lerp(x0, x1, (f - 0.12) / 0.76);
      const ty = tipY(tx) - u * (0.03 + 0.06 * r);
      const sx0 = crownX + (tx - crownX) * 0.1 + (r - 0.5) * g.hw * 0.08;
      d = `${M(sx0, g.yTop - u * 0.02)}${Q(crownX + (tx - crownX) * 0.95, g.yTop + (ty - g.yTop) * 0.3, tx, ty)}`;
    } else {
      // side locks: over the temple and down
      const s = f < 0.5 ? -1 : 1;
      const k = f < 0.5 ? f / 0.12 : (1 - f) / 0.12; // 0 = outer edge .. 1 = inner
      const ex = s * (lockX + g.hw * (0.1 - 0.2 * k));
      const ey = lockY - u * (0.04 + 0.12 * r);
      d = `${M(crownX + s * g.hw * (0.15 + 0.2 * r), g.yTop)}${C(s * m.rx * (1.0 - 0.15 * k), m.yc - u * 0.1, s * (lockX + g.hw * (0.2 - 0.25 * k)), lerp(m.yc, ey, 0.45), ex, ey)}`;
    }
    out += stroke(ctx, d, tone, w, { opacity: op });
  }
  return out;
}

/**
 * Warm back light along an outer edge of the hair: a wide blurred stroke, strongest on the upper left
 * (where the light comes from). Clipped to the hair shape by the caller.
 */
function rimLight(ctx: Ctx, d: string): string {
  const { g } = ctx;
  const id = ctx.uid('rim');
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(-g.hw * 1.3).toFixed(1)}" y1="${g.yTop.toFixed(1)}" x2="${(g.hw * 1.3).toFixed(1)}" y2="${(g.yTop + g.u).toFixed(1)}">` +
    `<stop offset="0" stop-color="${ctx.hairRim}" stop-opacity="0.9"/><stop offset="1" stop-color="${ctx.hairRim}" stop-opacity="0.25"/></linearGradient>` +
    path(d, { fill: 'none', stroke: `url(#${id})`, 'stroke-width': (g.u * 0.06).toFixed(2), filter: `url(#${ctx.soft})` })
  );
}

/** Fine bright strands running through the sheen on the crown. */
function sheenStrands(ctx: Ctx, m: HairMetrics, crownX: number, tips: Pt[]): string {
  const { g } = ctx;
  const u = g.u;
  let out = '';
  for (let i = 1; i < tips.length - 1; i += 2) {
    const tp = tips[i];
    const x0 = crownX + (tp.x - crownX) * 0.25;
    const y0 = m.yc - u * 0.2;
    out += stroke(ctx, `${M(x0, y0)}${Q(crownX + (tp.x - crownX) * 0.7, m.yc - u * 0.12, tp.x * 0.9, m.yc - u * 0.02)}`, lighten(ctx.hairLight, 0.12), Math.max(0.35, g.lw * 0.45), { opacity: 0.55 });
  }
  return out;
}

/**
 * Thin, tapered strands hanging a little below the bangs, curving to alternating sides: they break
 * up the even row of locks into a soft, see-through fringe.
 */
function bangWisps(ctx: Ctx, fill: string, tips: Pt[]): string {
  const { g, p } = ctx;
  if (p.hairFront === 'blunt' || p.hairFront === 'forehead') return '';
  const hw = g.hw, u = g.u;
  let out = '';
  for (let i = 1; i < tips.length - 1; i++) {
    const A = tips[i - 1], B = tips[i];
    const s = i % 2 ? 1 : -1;
    const base: Pt = { x: (A.x + B.x) / 2 - s * hw * 0.02, y: Math.min(A.y, B.y) - u * 0.07 };
    const end: Pt = { x: base.x + s * hw * 0.1, y: Math.max(A.y, B.y) + u * (0.01 + 0.025 * (i % 3)) };
    const w = hw * 0.035;
    // pointed at both ends, widest a third of the way down
    const d =
      M(base.x, base.y) +
      C(base.x - w * 1.4, lerp(base.y, end.y, 0.3), end.x - s * w * 0.8, lerp(base.y, end.y, 0.7), end.x, end.y) +
      C(end.x - s * w * 0.1, lerp(base.y, end.y, 0.65), base.x + w * 1.4, lerp(base.y, end.y, 0.3), base.x, base.y) + 'Z';
    out += path(d, { fill, opacity: 0.65 });
    out += stroke(ctx, `${M(lerp(base.x, end.x, 0.4), lerp(base.y, end.y, 0.4))}${Q(end.x - s * w * 0.6, lerp(base.y, end.y, 0.8), end.x, end.y)}`, ctx.hairLine, g.lw * 0.45, { opacity: 0.45 });
  }
  return out;
}

/** Loose single hairs around the head: the soft, natural edge of semi-realistic hair. */
function flyaways(ctx: Ctx, m: HairMetrics, lockEnd: number): string {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const col = ctx.p.hairColor;
  const w = Math.max(0.3, g.lw * 0.45);
  let out = '';
  for (const s of [-1, 1] as const) {
    const x = (f: number): number => s * hw * f;
    // lifting off the crown
    out += stroke(ctx, `${M(x(0.35), g.yTop + u * 0.0)}${Q(x(0.6), g.yTop - u * 0.035, x(0.82), g.yTop + u * 0.03)}`, col, w, { opacity: 0.7 });
    // off the temples
    out += stroke(ctx, `${M(s * m.rx * 0.98, m.yc)}${C(x(1.2), m.yc + u * 0.12, x(1.08), m.yc + u * 0.25, x(1.25), m.yc + u * 0.38)}`, col, w, { opacity: 0.7 });
    // along the side lock
    const y1 = Math.min(lockEnd, g.yChin + u * 0.3);
    out += stroke(ctx, `${M(x(1.0), m.yc + u * 0.3)}${C(x(1.18), lerp(m.yc, y1, 0.5), x(0.98), lerp(m.yc, y1, 0.75), x(1.12), y1)}`, col, w * 0.9, { opacity: 0.6 });
  }
  return out;
}
