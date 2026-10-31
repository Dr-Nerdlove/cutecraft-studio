import { darken, lighten, mix, shade } from '../../core/color';
import { C, L, M, Q, clamp, ellipse, group, lerp, path, smoothClosed, smoothOpen, type Pt } from '../../core/svg';
import { cel, stroke, type Ctx } from './context';
import { afroDims, faceHalfWidthAt, faceRel, type Geo } from './geometry';
import type { AnimeParams } from './schema';

// ---- shared helpers ---------------------------------------------------------------------------

/**
 * Fewer, wider bang locks: neighbouring interior tips are merged in pairs (the two outer tips join the
 * side locks and stay where they are). Blunt bangs keep their single smooth line.
 */
function mergeBangTips(ctx: Ctx, tips: Pt[]): Pt[] {
  const style = ctx.p.hairFront;
  if (style === 'blunt' || style === 'spiky') return tips;
  if (style !== 'straight' || tips.length < 6) {
    // other styles keep their shape, but neighbouring tips even out a little (no angular steps)
    return tips.map((t, i) => (i === 0 || i === tips.length - 1 ? t : { x: t.x, y: t.y * 0.55 + (tips[i - 1].y + tips[i + 1].y) * 0.225 }));
  }
  const inner = tips.slice(1, -1);
  const merged: Pt[] = [];
  for (let i = 0; i < inner.length; i += 2) {
    const a = inner[i], b = inner[i + 1];
    merged.push({ x: b ? (a.x + b.x) / 2 : a.x, y: Math.max(a.y, b.y ?? a.y) + ctx.g.u * [0.02, -0.01, 0.03][(i / 2) % 3] });
  }
  return [tips[0], ...merged, tips[tips.length - 1]];
}

/**
 * Bangs: a few soft, flowing locks. Every interior tip is a gently tapered lock with convex edges and a
 * small round end; the gaps between locks are shallow, rounded U shapes (never V cuts). `smooth` draws
 * one clean, even line instead (blunt bangs). `r` is the tip radius, `depth` the gap depth.
 */
function bangLocks(tips: Pt[], depth: number, r: number, smooth = false): string {
  if (smooth) return smoothOpen(tips, 1 / 6, false);
  const n = tips.length;
  let d = '';
  // points between two locks (the first and last "gap" are the outer tips themselves)
  const gap = (i: number): Pt => (i === 0 ? tips[0] : i === n - 2 ? tips[n - 1] : {
    x: (tips[i].x + tips[i + 1].x) / 2,
    y: Math.min(tips[i].y, tips[i + 1].y) - depth,
  });
  for (let i = 1; i < n - 1; i++) {
    const T = tips[i];
    const L = gap(i - 1), R = gap(i);
    const tl: Pt = { x: T.x - r, y: T.y - r * 1.3 };
    const tr: Pt = { x: T.x + r, y: T.y - r * 1.3 };
    const dl = tl.x - L.x, dr = R.x - tr.x;
    // convex outer edge: drops first, then bends in towards the tip
    d += C(L.x + dl * 0.22, L.y + (tl.y - L.y) * 0.4, tl.x - dl * 0.4, tl.y - (tl.y - L.y) * 0.25, tl.x, tl.y);
    d += Q(T.x, T.y + r * 0.5, tr.x, tr.y);
    d += C(tr.x + dr * 0.4, tr.y - (tr.y - R.y) * 0.25, R.x - dr * 0.22, R.y + (tr.y - R.y) * 0.4, R.x, R.y);
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
  straight: 0.05, side: 0.05, parted: 0.045, curtain: 0.04, blunt: 0.014, swept: 0.05, spiky: 0.07, forehead: 0.03,
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
    case 'curls': return Math.min(-14, g.yShoulder + g.torsoLen * lerp(0.05, 0.85, L01));
    case 'dreads': return Math.min(-14, g.yShoulder + g.torsoLen * lerp(0.1, 0.9, L01));
    case 'afro': return g.yTop + g.u * 0.95;
    case 'pixie': return g.yTop + g.u * 0.6;
  }
}

/** Lowest y of the hair mass behind the head (tails and braids hang separately). */
function massEnd(ctx: Ctx): number {
  const { g, p } = ctx;
  switch (p.hairBack) {
    // tied styles: the hair is pulled back snugly, only the tail / braid / buns hang down
    case 'sidetail':
    case 'braid':
    case 'ponytail':
    case 'twintails':
    case 'buns': return g.yTop + g.u * 0.76;
    case 'drills': return g.yTop + g.u * 0.9;
    case 'curls': return g.yTop + g.u * 0.9;
    case 'dreads': return g.yTop + g.u * 0.9;
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

/**
 * Hair ends as slim, pointed locks: steep edges at every tip and a shallow notch between two tips
 * (`depths[i]` is the notch above the shorter tip of lock i). Tips run left to right.
 */
function taperLocks(tips: Pt[], depths: number[]): string {
  let d = '';
  for (let i = 0; i < tips.length - 1; i++) {
    const A = tips[i], B = tips[i + 1];
    const V: Pt = { x: (A.x + B.x) / 2, y: Math.min(A.y, B.y) - depths[i] };
    const dx1 = V.x - A.x, dx2 = B.x - V.x;
    const dy1 = V.y - A.y, dy2 = B.y - V.y;
    d += C(A.x + dx1 * 0.05, A.y + dy1 * 0.45, V.x - dx1 * 0.34, V.y - dy1 * 0.08, V.x, V.y);
    d += C(V.x + dx2 * 0.34, V.y + dy2 * 0.08, B.x - dx2 * 0.05, B.y - dy2 * 0.45, B.x, B.y);
  }
  return d;
}

interface TipSpec {
  /** Count of tips including the two outer corners. */
  n: number;
  /** How much shorter than the longest lock a tip may be, in head heights. */
  varLen: number;
  /** Sideways wander of the tips, as a fraction of the lock spacing. */
  lean: number;
  /** Notch depth between tips, in head heights. */
  depth: number;
  salt: number;
}

/** Tips of uneven length, from `from` (left corner) to `to` (right corner), around the line y = yEnd. */
function unevenTips(ctx: Ctx, from: Pt, to: Pt, yEnd: number, spec: TipSpec, wave = 0): { tips: Pt[]; depths: number[] } {
  const u = ctx.g.u;
  const tips: Pt[] = [from];
  const spacing = (to.x - from.x) / (spec.n - 1);
  for (let i = 1; i < spec.n - 1; i++) {
    const f = i / (spec.n - 1);
    // alternate long / short locks and add a random part, so the row never looks like a comb
    const short = (i % 2 ? 0.55 : 0) + 0.45 * hash(i * 3.7 + spec.salt);
    const len = u * (0.035 - spec.varLen * short) + (wave ? Math.sin(f * 6) * u * 0.03 : 0);
    const x = lerp(from.x, to.x, f) + (hash(i * 5.3 + spec.salt) - 0.5) * 2 * spacing * spec.lean;
    tips.push({ x, y: yEnd + len });
  }
  tips.push(to);
  const depths = tips.slice(1).map((_, i) => u * spec.depth * (0.75 + 0.5 * hash(i * 2.1 + spec.salt + 9)));
  return { tips, depths };
}

/** Mask that makes the lowest part of a hair part slightly see-through (the ends fade out). */
function endFade(ctx: Ctx, yEnd: number, reach: number, end = '#808080'): { defs: string; attrs: Record<string, string> } {
  const { g } = ctx;
  const id = ctx.uid('efade');
  const gid = ctx.uid('efadeg');
  const x = -g.hw * 6, w = g.hw * 12;
  const y = g.yTop - g.u * 3, h = yEnd - g.yTop + g.u * 6;
  return {
    defs:
      `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${(yEnd - reach).toFixed(1)}" x2="0" y2="${(yEnd + g.u * 0.05).toFixed(1)}">` +
      `<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${end}"/></linearGradient>` +
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}">` +
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#${gid})"/></mask>`,
    attrs: { mask: `url(#${id})` },
  };
}

/** A thin curved sliver, widest at its base and pointed at the end: one loose strand of hair. */
function wispD(b: Pt, e: Pt, bend: number, w: number): string {
  const dx = e.x - b.x, dy = e.y - b.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  const c: Pt = { x: (b.x + e.x) / 2 + nx * bend, y: (b.y + e.y) / 2 + ny * bend };
  return (
    M(b.x - nx * w, b.y - ny * w) + Q(c.x - nx * w * 0.5, c.y - ny * w * 0.5, e.x, e.y) +
    Q(c.x + nx * w * 0.5, c.y + ny * w * 0.5, b.x + nx * w, b.y + ny * w) + 'Z'
  );
}

/** Draws curves in tone groups (one path per tone and width), so many strands stay cheap. */
class StrandSet {
  private groups = new Map<string, { color: string; w: number; op: number; d: string }>();
  add(d: string, color: string, w: number, op: number): void {
    const key = `${color}|${w.toFixed(2)}|${op}`;
    const e = this.groups.get(key);
    if (e) e.d += d;
    else this.groups.set(key, { color, w, op, d });
  }
  /** All strands; with `glow` the light ones are also drawn wide and blurred (one filtered group). */
  svg(ctx: Ctx, glow = false): string {
    let out = '';
    let halo = '';
    for (const e of this.groups.values()) {
      out += stroke(ctx, e.d, e.color, e.w, { opacity: e.op });
      if (glow && e.color !== ctx.hairShade && e.op >= 0.35 && (e.color === ctx.hairLight || e.color === ctx.hairRim)) halo += stroke(ctx, e.d, e.color, e.w * 3.2, { opacity: e.op * 0.45 });
    }
    return (halo ? group(halo, { filter: `url(#${ctx.soft})` }) : '') + out;
  }
}

/** Interpolates y along a polyline of points sorted by x. */
function polyY(pts: Pt[], x: number): number {
  if (x <= pts[0].x) return pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    if (x <= B.x) return lerp(A.y, B.y, (x - A.x) / Math.max(1e-6, B.x - A.x));
  }
  return pts[pts.length - 1].y;
}

/**
 * Fine single strands flowing down the back hair (dark, light and warm back-lit ones), converging
 * into the lock tips at the bottom. Light strands sit mostly on the lit left, dark ones on the right.
 */
function backStrands(ctx: Ctx, bm: BackMass, m: HairMetrics, count: number): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  const set = new StrandSet();
  const y0 = m.yc + u * 0.02;
  const sw = Math.max(0.45, g.lw * 0.65);
  const tipsEnd = bm.tips;
  for (let j = 0; j < count; j++) {
    const r = hash(j * 1.9 + 4);
    const r2 = hash(j * 7.1 + 1);
    const f = clamp(-0.97 + 1.94 * ((j + 0.5 * r) / count), -0.97, 0.97);
    const ys = y0 + r2 * u * 0.35;
    const xAt = (y: number): number => bm.mid(y) + f * bm.half(y);
    const nearest = tipsEnd.reduce((a, b) => (Math.abs(b.x - xAt(bm.yEnd)) < Math.abs(a.x - xAt(bm.yEnd)) ? b : a));
    const xe = lerp(xAt(bm.yEnd), nearest.x, 0.55);
    const ye = Math.min(polyY(tipsEnd, xe), bm.yEnd + u * 0.03) - u * (0.02 + 0.1 * r);
    const pts: Pt[] = [];
    for (const t of [0, 0.3, 0.6, 0.85, 1]) {
      const y = lerp(ys, ye, t);
      const wob = Math.sin(t * 4 + j * 1.7) * hw * 0.012;
      pts.push({ x: lerp(xAt(y), xe, Math.pow(t, 3)) + wob, y });
    }
    const d = M(pts[0].x, pts[0].y) + curveThroughOpen(pts);
    const left = f < 0;
    const pick = (hash(j * 3.3 + 8) + (left ? 0.25 : -0.25));
    if (pick > 0.62) set.add(d, ctx.hairLight, sw * (0.8 + r), left ? 0.55 : 0.4);
    else if (pick > 0.3) set.add(d, ctx.hairRim, sw * 0.7, left ? 0.45 : 0.28);
    else set.add(d, darken(ctx.hairShade, 0.06), sw * (0.7 + r), left ? 0.4 : 0.55);
  }
  return set.svg(ctx, true);
}

const curveThroughOpen = (pts: Pt[]): string => smoothOpen(pts, 1 / 6, false);

/**
 * Loose single hairs: slim slivers poking out past the ends of some locks and the outer sides.
 * Drawn behind the hair mass so only the part outside shows.
 */
function looseStrands(ctx: Ctx, bm: BackMass, fill: string): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  let d = '';
  const w = Math.max(0.45, g.lw * 0.5);
  // past the ends: from inside a lock, a little beyond its tip, drifting sideways
  bm.tips.forEach((t, i) => {
    if (i === 0 || i === bm.tips.length - 1 || hash(i * 4.4 + 2) < 0.4) return;
    const s = hash(i * 1.3) < 0.5 ? -1 : 1;
    const b: Pt = { x: t.x - s * hw * 0.03, y: t.y - u * 0.16 };
    const e: Pt = { x: t.x + s * hw * (0.1 + 0.1 * hash(i * 6.1)), y: t.y + u * (0.06 + 0.1 * hash(i * 2.9)) };
    d += wispD(b, e, s * hw * 0.05, w);
  });
  // out of the sides: lifting off the outer edge and falling back down
  for (const s of [-1, 1] as const) {
    for (const f of [0.3, 0.62, 0.85]) {
      const y = lerp(m0(bm), bm.yEnd, f);
      const edge = bm.half(y), c = bm.mid(y);
      const b: Pt = { x: c + s * (edge - hw * 0.08), y: y - u * 0.04 };
      const e: Pt = { x: c + s * (edge + hw * (0.12 + 0.1 * hash(f * 50 + s))), y: y + u * (0.1 + 0.08 * hash(f * 30 + s)) };
      d += wispD(b, e, s * hw * 0.06, w);
    }
  }
  return path(d, { fill, opacity: 0.8 });
}

const m0 = (bm: BackMass): number => bm.left[0].y;

/** Warm back light along the outer side edges of the back hair, fading towards the ends. */
function backRim(ctx: Ctx, bm: BackMass): string {
  const { g } = ctx;
  const gid = (a: number, b: number): string => {
    const id = ctx.uid('brim');
    ctxDefs += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${m0(bm).toFixed(1)}" x2="0" y2="${bm.yEnd.toFixed(1)}">` +
      `<stop offset="0" stop-color="${ctx.hairRim}" stop-opacity="${a}"/><stop offset="1" stop-color="${ctx.hairRim}" stop-opacity="${b}"/></linearGradient>`;
    return id;
  };
  let ctxDefs = '';
  const idL = gid(0.9, 0.3);
  const idR = gid(0.4, 0.1);
  const wRim = (g.u * 0.05).toFixed(2);
  const edgeL = path(smoothOpen(bm.left), { fill: 'none', stroke: `url(#${idL})`, 'stroke-width': wRim });
  const edgeR = path(smoothOpen(bm.right.slice().reverse()), { fill: 'none', stroke: `url(#${idR})`, 'stroke-width': wRim });
  return ctxDefs + group(edgeL + edgeR, { filter: `url(#${ctx.soft})` });
}

interface BackMass {
  d: string;
  yEnd: number;
  /** Outer edge points, top to bottom (left) and bottom to top (right). */
  left: Pt[];
  right: Pt[];
  tips: Pt[];
  /** Half width of the mass at height y. */
  half(y: number): number;
  /** Centre line of the mass at height y (it sways for wavy hair). */
  mid(y: number): number;
}

function backMass(ctx: Ctx): BackMass {
  const { g, p } = ctx;
  const m = metrics(ctx);
  const hw = g.hw;
  const style = p.hairBack;
  const yEnd = massEnd(ctx);
  let wTop = hw * 1.14;
  let wEnd = hw * 1.05;
  let wave = 0;
  let inward = 0;
  const spec: TipSpec = { n: 7, varLen: 0.1, lean: 0.25, depth: 0.075, salt: 1 };
  if (style === 'bob') { wTop = hw * 1.2; wEnd = hw * 1.12; inward = hw * 0.08; spec.n = 8; spec.varLen = 0.09; }
  if (style === 'messy') { wTop = hw * 1.2; wEnd = hw * 1.1; inward = hw * 0.04; spec.n = 8; spec.varLen = 0.16; spec.depth = 0.12; spec.lean = 0.35; }
  if (isLong(p)) {
    wTop = hw * 1.16;
    wEnd = Math.max(hw * 1.1, g.shHW * 0.95);
    spec.n = 9;
    spec.varLen = 0.14;
    spec.depth = 0.09;
    if (style === 'wavy') { wave = hw * 0.3; wTop = hw * 1.3; wEnd = Math.max(hw * 1.25, g.shHW * 1.28); }
    if (style === 'hime') { spec.n = 7; spec.varLen = 0.05; spec.depth = 0.035; spec.lean = 0.1; }
  }
  if (style === 'curls') { wTop = hw * 1.2; wEnd = hw * 1.1; spec.n = 7; spec.varLen = 0.06; }
  if (style === 'dreads') { wTop = hw * 1.24; wEnd = hw * 1.02; spec.n = 6; spec.varLen = 0.1; }
  if (style === 'pixie') { wTop = hw * 1.12; wEnd = hw * 1.06; spec.n = 9; spec.varLen = 0.2; spec.depth = 0.14; spec.lean = 0.45; }
  if (style === 'short' || style === 'buns' || style === 'ponytail' || style === 'twintails' || style === 'drills' || style === 'sidetail' || style === 'braid') { wTop = hw * 1.12; wEnd = hw * 1.0; spec.n = 6; spec.varLen = 0.08; }
  if (style === 'sidetail' || style === 'braid' || style === 'ponytail' || style === 'twintails' || style === 'buns') { wTop = hw * 1.08; wEnd = hw * 0.97; }

  const y0 = m.yc;
  const left: Pt[] = [];
  let right: Pt[];
  // wavy hair: medium, even S-waves; both edges sway the same way and the width breathes a little
  const wavy = style === 'wavy';
  const lambda = g.u * 0.85;
  const n = wavy ? Math.max(8, Math.round(((yEnd - y0) / lambda) * 6)) : 5;
  const sway = (y: number, f: number): number => {
    const env = Math.min(1, Math.max(0, (y - y0) / (g.u * 0.35)));
    return env * env * (3 - 2 * env) * (wave * Math.sin(((y - y0) / lambda) * Math.PI * 2) * (0.6 + 0.4 * f));
  };
  const breathe = (y: number, f: number): number => {
    const env = Math.min(1, Math.max(0, (y - y0) / (g.u * 0.35)));
    return env * env * (3 - 2 * env) * wave * 0.7 * Math.cos(((y - y0) / lambda) * Math.PI * 2) * (0.6 + 0.4 * f);
  };
  const rightTD: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const y = lerp(y0, yEnd, f);
    const base = f < 0.35 ? lerp(m.rx, wTop, f / 0.35) : lerp(wTop, wEnd, (f - 0.35) / 0.65);
    if (wavy) {
      const w = base + breathe(y, f), sw = sway(y, f);
      left.push({ x: -w + sw, y });
      rightTD.push({ x: w + sw, y });
    } else {
      left.push({ x: -base, y });
      rightTD.push({ x: base, y });
    }
  }
  // the outer corner ends a little above the longest lock
  left[n].y = yEnd - g.u * spec.varLen * 0.4;
  rightTD[n].y = left[n].y;
  right = rightTD.slice().reverse();

  // pointed bottom: slim locks of uneven length
  const wb = left[n].x;
  const { tips, depths } = unevenTips(ctx, left[n], right[0], yEnd, spec, wavy ? 0.5 : 0);
  for (let i = 1; i < tips.length - 1; i++) {
    const edgeIn = Math.sin((i / (tips.length - 1)) * Math.PI);
    tips[i].x *= 1 - (inward / Math.max(1, Math.abs(wb))) * (1 - edgeIn);
  }

  const arcTop = skullArc(g, m.rx, m.yc, m.vTop, 0, Math.PI, 12);
  const d =
    M(left[0].x, left[0].y) + smoothOpen([...left.slice(0, -1), tips[0]], 1 / 6, false) +
    taperLocks(tips, depths) +
    smoothOpen([tips[tips.length - 1], ...right.slice(1)], 1 / 6, false) +
    smoothOpen(arcTop, 1 / 6, false) + 'Z';
  const at = (arr: Pt[], y: number): number => {
    if (y <= arr[0].y) return arr[0].x;
    for (let i = 0; i < arr.length - 1; i++) {
      if (y <= arr[i + 1].y) return lerp(arr[i].x, arr[i + 1].x, (y - arr[i].y) / Math.max(1e-6, arr[i + 1].y - arr[i].y));
    }
    return arr[arr.length - 1].x;
  };
  const half = (y: number): number => (at(rightTD, y) - at(left, y)) / 2;
  const mid = (y: number): number => (at(rightTD, y) + at(left, y)) / 2;
  return { d, yEnd, left, right, tips, half, mid };
}

/** Outline of a hanging tail and its lock tips (used for strands and loose hairs). */
function tailGeo(ctx: Ctx, side: 1 | -1, tie: Pt, endY: number, sway: number): { d: string; tips: Pt[] } {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const s = side;
  const len = endY - tie.y;
  const tipC: Pt = { x: tie.x + s * hw * sway, y: endY };
  const wEnd = hw * 0.38;
  const Tout: Pt = { x: tie.x + s * hw * 0.18, y: tie.y - u * 0.02 };
  const Tin: Pt = { x: tie.x - s * hw * 0.16, y: tie.y + u * 0.03 };
  // slim, uneven locks from the outer to the inner side
  const tips: Pt[] = [
    { x: tipC.x + s * wEnd, y: endY - u * 0.07 },
    { x: tipC.x + s * wEnd * 0.4, y: endY + u * 0.04 },
    { x: tipC.x - s * wEnd * 0.2, y: endY - u * 0.02 },
    { x: tipC.x - s * wEnd * 0.62, y: endY + u * 0.07 },
    { x: tipC.x - s * wEnd, y: endY - u * 0.06 },
  ];
  const depths = [0.08, 0.09, 0.07, 0.08].map((v) => v * u);
  const outerEnd = tips[0];
  const innerEnd = tips[tips.length - 1];
  let d = M(Tout.x, Tout.y);
  d += C(tie.x + s * hw * (0.55 + sway * 0.55), tie.y + len * 0.04, tipC.x + s * hw * (0.5 + sway * 0.25), tie.y + len * 0.5, outerEnd.x, outerEnd.y);
  d += taperLocks(tips, depths);
  d += C(innerEnd.x - s * hw * 0.2, endY - len * 0.4, tie.x - s * hw * 0.42, tie.y + len * 0.3, Tin.x, Tin.y);
  d += Q(tie.x - s * hw * 0.02, tie.y - u * 0.045, Tout.x, Tout.y) + 'Z';
  return { d, tips };
}

function bunPath(cx: number, cy: number, r: number): string {
  return (
    M(cx - r, cy) + C(cx - r, cy - r * 1.25, cx + r, cy - r * 1.25, cx + r, cy) +
    C(cx + r * 1.05, cy + r * 0.9, cx - r * 1.05, cy + r * 0.9, cx - r, cy) + 'Z'
  );
}

/** Pointed tufts sticking out around the head for the messy short cut (drawn behind the hair mass). */
function tuftD(P: Pt, nx: number, ny: number, len: number, lean: number, half: number): string {
  const tx = -ny, ty = nx; // tangent
  const B1: Pt = { x: P.x - tx * half, y: P.y - ty * half };
  const B2: Pt = { x: P.x + tx * half, y: P.y + ty * half };
  const T: Pt = { x: P.x + nx * len + tx * lean * len * 0.5, y: P.y + ny * len + ty * lean * len * 0.5 };
  return M(B1.x, B1.y) + Q(P.x + nx * len * 0.5 - tx * half * 0.4, P.y + ny * len * 0.5 - ty * half * 0.4, T.x, T.y) + Q(P.x + nx * len * 0.5 + tx * half * 0.6, P.y + ny * len * 0.5 + ty * half * 0.6, B2.x, B2.y) + 'Z';
}

function messyTufts(ctx: Ctx, fills: { fill: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const m = metrics(ctx);
  const u = g.u;
  const ring = skullArc(g, m.rx * 1.06, m.yc, m.vTop - u * 0.02, 0, Math.PI, 10);
  // [index on the ring, length in head heights, sideways lean]
  const spec: Array<[number, number, number]> = [[1, 0.16, 0.5], [2, 0.13, 0.3], [3, 0.17, 0.2], [4, 0.12, 0.1], [5, 0.16, -0.1], [6, 0.12, -0.2], [7, 0.17, -0.3], [8, 0.13, -0.4], [9, 0.16, -0.5]];
  let out = '';
  const tuft = tuftD;
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

/**
 * Shade and many fine strands for a hanging tail (shared by tails and the side ponytail). The strands
 * run between the two edges of the tail and converge into the lock tips.
 */
function tailFinish(ctx: Ctx, fills: { shade: string }, side: 1 | -1, tie: Pt, endY: number, sway: number): string {
  const { g } = ctx;
  const hw = g.hw, s = side, u = g.u;
  const len = endY - tie.y;
  const tipC: Pt = { x: tie.x + s * hw * sway, y: endY };
  const wEnd = hw * 0.38;
  const outer = { p0: { x: tie.x + s * hw * 0.18, y: tie.y - u * 0.02 }, p1: { x: tie.x + s * hw * (0.55 + sway * 0.55), y: tie.y + len * 0.04 }, p2: { x: tipC.x + s * hw * (0.5 + sway * 0.25), y: tie.y + len * 0.5 }, p3: { x: tipC.x + s * wEnd, y: endY - u * 0.07 } };
  const inner = { p0: { x: tie.x - s * hw * 0.16, y: tie.y + u * 0.03 }, p1: { x: tie.x - s * hw * 0.42, y: tie.y + len * 0.3 }, p2: { x: tipC.x - s * wEnd - s * hw * 0.2, y: endY - len * 0.4 }, p3: { x: tipC.x - s * wEnd, y: endY - u * 0.06 } };
  const mixP = (a: Pt, b: Pt, f: number): Pt => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) });
  const set = new StrandSet();
  const sw = Math.max(0.45, g.lw * 0.65);
  const N = 18;
  for (let j = 0; j < N; j++) {
    const f = (j + 0.5 + (hash(j * 2.3) - 0.5) * 0.6) / N;
    const r = hash(j * 1.9 + 6);
    // shorten the end of the strand towards its control point, so the ends differ in length
    const k = 0.04 + 0.2 * r;
    const P0 = mixP(outer.p0, inner.p0, f), P1 = mixP(outer.p1, inner.p1, f), P2 = mixP(outer.p2, inner.p2, f), P3 = mixP(outer.p3, inner.p3, f);
    const E = mixP(P3, P2, k);
    const d = `${M(P0.x, P0.y)}${C(P1.x, P1.y, P2.x, P2.y, E.x, E.y)}`;
    // the side facing the head (inner) is in shadow, the outer side catches the light
    const pick = hash(j * 3.1 + 2) + (0.5 - f) * 0.5;
    if (pick > 0.62) set.add(d, ctx.hairLight, sw * (0.8 + r), 0.5);
    else if (pick > 0.4) set.add(d, ctx.hairRim, sw * 0.7, 0.35);
    else set.add(d, darken(ctx.hairShade, 0.06), sw * (0.7 + r), 0.5);
  }
  return shadeOverlay(ctx, tie.y, endY, fills.shade, 0.5) + set.svg(ctx, true);
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

/** One hanging tail: loose hairs behind, the shaded shape with strands and rim light, fading at the ends. */
function tailSvg(ctx: Ctx, fills: { fill: string; shade: string }, side: 1 | -1, tie: Pt, endY: number, sway: number, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const { d, tips } = tailGeo(ctx, side, tie, endY, sway);
  const fade = endFade(ctx, endY, Math.min(g.u * 0.3, (endY - tie.y) * 0.3));
  // loose hairs poking out past the tips
  let loose = '';
  tips.forEach((t, i) => {
    if (i === 0 || i === tips.length - 1 || i % 2 === 0) return;
    const sd = i === 1 ? side : -side;
    loose += wispD({ x: t.x - sd * g.hw * 0.03, y: t.y - g.u * 0.14 }, { x: t.x + sd * g.hw * 0.1, y: t.y + g.u * (0.07 + 0.04 * i) }, sd * g.hw * 0.05, Math.max(0.45, g.lw * 0.5));
  });
  const inside = tailFinish(ctx, fills, side, tie, endY, sway) + rimLight(ctx, d, endY - g.yTop);
  return fade.defs + path(loose, { fill: fills.fill, opacity: 0.8 }) + group(cel(ctx, d, fills.fill, { ...opts, inside }), fade.attrs);
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
  if (p.hairBack === 'afro') {
    const a = afroGeo(ctx);
    return out + cel(ctx, a.d, fills.fill, { ...opts, inside: afroInterior(ctx, a) + rimLight(ctx, a.d, a.ry * 2) });
  }
  const tie = (x: number, y: number, rx: number, ry: number, rot: number): string =>
    ellipse(x, y, rx, ry, { fill: tieColor, stroke: mix(tieColor, '#5a2040', 0.45), 'stroke-width': g.lw * 0.8, transform: `rotate(${rot} ${x} ${y})` });

  if (p.hairBack === 'ponytail') {
    const t: Pt = { x: hw * 0.74, y: g.yTop + g.u * 0.12 };
    const endY = hairEnd(ctx);
    out += tailSvg(ctx, fills, 1, t, endY, 0.72, opts);
    out += tie(t.x + hw * 0.02, t.y + g.u * 0.01, hw * 0.2, g.u * 0.045, -25);
  } else if (p.hairBack === 'twintails') {
    const endY = hairEnd(ctx);
    for (const s of [-1, 1] as const) {
      const t: Pt = { x: s * hw * 0.9, y: g.yTop + g.u * 0.22 };
      out += tailSvg(ctx, fills, s, t, endY, lerp(0.45, 0.65, L01), opts);
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
  } else if (p.hairBack === 'curls') {
    out += curlsSvg(ctx, fills, false);
  } else if (p.hairBack === 'dreads') {
    out += dreadsSvg(ctx, fills, false, opts);
  } else if (p.hairBack === 'pixie') {
    out += pixieTufts(ctx, fills, opts);
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

  const bm = backMass(ctx);
  const m = metrics(ctx);
  const { d, yEnd } = bm;
  const faceShadow = path(ctx.faceD, {
    fill: mix(ctx.hairShade, '#000000', 0.12),
    stroke: mix(ctx.hairShade, '#000000', 0.12),
    'stroke-width': g.u * 0.1,
    'stroke-linejoin': 'round',
    opacity: 0.55,
    transform: `translate(0 ${g.u * 0.045})`,
  });
  const strandCount = Math.round(clamp(26 + ((yEnd - m.yc) / g.u) * 7, 26, 56));
  const inside =
    faceShadow +
    shadeOverlay(ctx, m.yc, yEnd, ctx.hairShade, 0.55) +
    lightSide(ctx) +
    backStrands(ctx, bm, m, strandCount) +
    (p.hairBack === 'wavy' ? waveSheen(ctx, bm, m) : '') +
    backRim(ctx, bm) +
    rimLight(ctx, d, yEnd - g.yTop);
  const shortCut = ['short', 'buns', 'messy', 'drills', 'bob', 'sidetail', 'braid', 'pixie', 'curls', 'dreads'].includes(p.hairBack);
  const fade = endFade(ctx, yEnd, Math.min(g.u * 0.28, (yEnd - m.yc) * 0.4), shortCut ? '#b0b0b0' : '#808080');
  out += fade.defs + looseStrands(ctx, bm, fills.fill);
  out += group(cel(ctx, d, fills.fill, { ...opts, inside }), fade.attrs);
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
      return { tips: [P(-0.7, 0.375), P(-0.46, 0.395), P(-0.2, 0.405), P(0.2, 0.405), P(0.46, 0.395), P(0.7, 0.375)], crown: 0 };
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
    case 'bob':
    case 'curls':
    case 'dreads': ty = g.yChin + g.u * 0.07; break;
    case 'pixie': ty = g.yTop + g.u * 0.6; break;
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
  if (p.hairBack === 'afro') return fills.defs + afroFront(ctx, fills, m);
  const { tips: rawTips, crown } = bangTips(ctx);
  const tips = mergeBangTips(ctx, styleBangTips(ctx, rawTips));
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
  const wavy = p.hairBack === 'wavy';
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

  let d =
    M(A.x, A.y) + left.down + left.up +
    bangLocks(tips, u * BANG_DEPTH[p.hairFront], hw * (p.hairFront === 'spiky' ? 0.02 : 0.035), p.hairFront === 'blunt') +
    rInner + rOuter +
    smoothOpen(arcR, 1 / 6, false) + 'Z';
  let waveLines = '';
  if (wavy) {
    // wavy side locks: the same two edges, but swaying in medium S-waves down to the tip
    const amp = hw * 0.2;
    const sway = (side: number, f: number): number => {
      const env = clamp(f / 0.22, 0, 1);
      return side * amp * env * env * (3 - 2 * env) * Math.sin(f * Math.PI * 2 * 2.5);
    };
    const bez = (P0: Pt, P1: Pt, P2: Pt, P3: Pt, t: number): Pt => {
      const k = 1 - t;
      return {
        x: k * k * k * P0.x + 3 * k * k * t * P1.x + 3 * k * t * t * P2.x + t * t * t * P3.x,
        y: k * k * k * P0.y + 3 * k * k * t * P1.y + 3 * k * t * t * P2.y + t * t * t * P3.y,
      };
    };
    const edge = (side: number, P0: Pt, P1: Pt, P2: Pt, P3: Pt, f0: number, f1: number, rec?: Pt[][]): string => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const q = bez(P0, P1, P2, P3, t);
        pts.push({ x: q.x + sway(side, lerp(f0, f1, t)), y: q.y });
      }
      if (rec) rec.push(pts);
      return smoothOpen(pts, 1 / 6, false);
    };
    const wide = hw * 0.2;
    const fl = lock.flick * 0.6;
    const parts = ([-1, 1] as const).map((sd) => {
      const tipP: Pt = { x: sd * (sx + fl), y: ty };
      const e = (y: number): number => faceHalfWidthAt(g, p.faceShape, Math.min(y, g.yChin - u * 0.02));
      const o1: Pt = { x: sd * (e(A.y + dyL * 0.35) + hw * 0.1 + wide), y: A.y + dyL * 0.4 };
      const o2: Pt = { x: sd * (e(A.y + dyL * 0.8) + hw * 0.06 + wide), y: A.y + dyL * 0.82 };
      const i1: Pt = { x: sd * (sx - hw * 0.1 + fl), y: ty - dyL * 0.18 };
      const i2: Pt = { x: sd * hw * 0.93, y: A.y + dyL * 0.38 };
      const jj: Pt = sd === -1 ? jl : jr;
      const T0: Pt = { x: sd * m.rx, y: A.y };
      const J: Pt = { x: jj.x, y: jj.y };
      const oR: Pt[][] = [], iR: Pt[][] = [];
      const r = { outerDown: edge(sd, T0, o1, o2, tipP, 0, 1, oR), innerUp: edge(sd, tipP, i1, i2, J, 1, 0), innerDown: edge(sd, J, i2, i1, tipP, 0, 1), outerUp: edge(sd, tipP, o2, o1, T0, 1, 0) };
      edge(sd, J, i2, i1, tipP, 0, 1, iR);
      // S-shaped strands between the two edges
      for (const [k, tone, op] of [[0.2, ctx.hairShade, 0.5], [0.4, ctx.hairLight, 0.5], [0.6, ctx.hairShade, 0.4], [0.8, ctx.hairLight, 0.4]] as const) {
        const a = oR[0], b = iR[0];
        const line = a.map((q, i) => ({ x: lerp(q.x, b[i].x, k), y: lerp(q.y, b[i].y, k) })).slice(2, 15);
        waveLines += stroke(ctx, smoothOpen(line, 1 / 6), tone, Math.max(0.4, g.lw * 0.6), { opacity: op });
      }
      return r;
    });
    d =
      M(A.x, A.y) + parts[0].outerDown + parts[0].innerUp +
      bangLocks(tips, u * BANG_DEPTH[p.hairFront], hw * 0.035, false) +
      parts[1].innerDown + parts[1].outerUp +
      smoothOpen(arcR, 1 / 6, false) + 'Z';
  }

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
    out += tailSvg(ctx, fills, -1, t, endY, sway, { line: ctx.hairLine, shadeColor: fills.shade, dx: g.lw * 2.2, dy: -g.lw * 1.2 });
    out += ellipse(t.x - hw * 0.02, t.y + u * 0.01, hw * 0.2, u * 0.045, { fill: tieColor, stroke: mix(tieColor, '#5a2040', 0.45), 'stroke-width': g.lw * 0.8, transform: `rotate(25 ${t.x - hw * 0.02} ${t.y + u * 0.01})` });
  } else if (p.hairBack === 'braid') {
    out += braidSvg(ctx, fills, 1);
  } else if (p.hairBack === 'curls') {
    out += curlsSvg(ctx, fills, true);
  } else if (p.hairBack === 'dreads') {
    out += dreadsSvg(ctx, fills, true, { line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 2.2, dy: -g.lw * 1.2 });
  } else if (p.hairBack === 'pixie') {
    out += pixieSideburns(ctx, fills, lock);
  }
  // ahoge (grows from under the cap)
  if (p.ahoge) out += ahogeSvg(ctx, fills, g.yTop - u * 0.015);
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
    inside: underside + lightSide(ctx) + strands + waveLines + fineStrands(ctx, tips, crownX, m, sx, ty) + ring + ring2 + rimLight(ctx, smoothOpen(arcR)),
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
function rimLight(ctx: Ctx, d: string, reach = ctx.g.u): string {
  const { g } = ctx;
  const id = ctx.uid('rim');
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(-g.hw * 1.3).toFixed(1)}" y1="${g.yTop.toFixed(1)}" x2="${(g.hw * 1.3).toFixed(1)}" y2="${(g.yTop + Math.max(g.u, reach * 0.6)).toFixed(1)}">` +
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

/** The ahoge: one stray lock growing up from the crown (`y0` is where it starts). */
function ahogeSvg(ctx: Ctx, fills: { fill: string; shade: string }, y0: number): string {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const x0 = hw * 0.02;
  const h = u * 0.32;
  const bw = hw * 0.07;
  const dAh =
    M(x0 - bw, y0 + u * 0.03) + C(x0 - bw * 1.6, y0 - h * 0.5, x0 - hw * 0.02, y0 - h * 0.9, x0 + hw * 0.22, y0 - h) +
    C(x0 + hw * 0.04, y0 - h * 0.62, x0 + bw * 1.6, y0 - h * 0.25, x0 + bw, y0 + u * 0.03) + 'Z';
  return cel(ctx, dAh, fills.fill, { line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 1.2, dy: -g.lw * 0.6 });
}

// ---- wavy hair: broad S-shaped light and shadow bands ------------------------------------------

/** Soft light and shadow bands that follow the waves of the hair mass (clipped to it by the caller). */
function waveSheen(ctx: Ctx, bm: BackMass, m: HairMetrics): string {
  const { g } = ctx;
  const u = g.u;
  const y0 = m.yc + u * 0.25, y1 = bm.yEnd - u * 0.12;
  let lit = '';
  let dark = '';
  const band = (f: number): string => {
    const pts: Pt[] = [];
    const n = Math.max(6, Math.round(((y1 - y0) / u) * 6));
    for (let i = 0; i <= n; i++) {
      const y = lerp(y0, y1, i / n);
      pts.push({ x: bm.mid(y) + f * bm.half(y), y });
    }
    return smoothOpen(pts, 1 / 6);
  };
  for (const f of [-0.62, -0.2, 0.38]) lit += stroke(ctx, band(f), ctx.hairLight, u * 0.05, { opacity: f < 0 ? 0.4 : 0.22 });
  for (const f of [-0.42, 0.1, 0.66]) dark += stroke(ctx, band(f), darken(ctx.hairShade, 0.08), u * 0.06, { opacity: 0.32 });
  return group(dark + lit, { filter: `url(#${ctx.soft})` });
}

// ---- curls: corkscrew ringlets ----------------------------------------------------------------

/**
 * One corkscrew ringlet hanging from (x0, y0): a helix seen from slightly above, drawn half turn by
 * half turn (the far halves first, darker, then the near halves on top).
 */
function ringletSvg(ctx: Ctx, fills: { fill: string; shade: string }, x0: number, y0: number, len: number, o: { sway: number; r: number; phase: number }): string {
  const { g } = ctx;
  const u = g.u;
  const N = Math.max(5, Math.round((len / (u * 0.115)) * 2));
  const A0 = o.r, a0 = o.r * 0.7;
  const pt = (k: number): Pt => {
    const tt = k / N;
    const taper = 1 - 0.35 * tt;
    const phi = k * Math.PI + o.phase;
    return {
      x: x0 + o.sway * tt * len + Math.sin(tt * 3 + o.phase) * A0 * 0.2 + A0 * taper * Math.sin(phi),
      y: y0 + tt * len + a0 * taper * Math.cos(phi),
    };
  };
  let back = '';
  let front = '';
  for (let k = 0; k < N; k++) {
    const pts: Pt[] = [];
    for (let j = 0; j <= 4; j++) pts.push(pt(k + j / 4));
    const d = M(pts[0].x, pts[0].y) + smoothOpen(pts, 1 / 6, false);
    const w = u * 0.052 * (1 - 0.35 * (k / N));
    if (Math.cos((k + 0.5) * Math.PI + o.phase) > 0) {
      front +=
        stroke(ctx, d, ctx.hairLine, w + g.lw * 1.3, { opacity: 0.4 }) +
        stroke(ctx, d, fills.fill, w) +
        stroke(ctx, d, fills.shade, w * 0.38, { opacity: 0.5, transform: `translate(${w * 0.16} ${w * 0.2})` }) +
        stroke(ctx, d, ctx.hairLight, w * 0.3, { opacity: 0.6, transform: `translate(${-w * 0.14} ${-w * 0.2})` });
    } else {
      back += stroke(ctx, d, ctx.hairLine, w + g.lw * 1.3, { opacity: 0.4 }) + stroke(ctx, d, fills.shade, w);
    }
  }
  return back + front;
}

/** Ringlets behind the shoulders (`front` false) or hanging in front of them (`front` true). */
function curlsSvg(ctx: Ctx, fills: { fill: string; shade: string }, front: boolean): string {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const m = metrics(ctx);
  const endY = hairEnd(ctx);
  const xs = front ? [-1.38, -1.18, -0.98, 0.98, 1.18, 1.38] : [-1.3, -1.0, -0.7, 0.7, 1.0, 1.3];
  let out = '';
  xs.forEach((f, i) => {
    const y0 = m.yc + u * (front ? 0.2 + 0.08 * (i % 3) : 0.15);
    const k = (front ? 0.7 : 0.95) + 0.25 * hash(i * 2.7 + (front ? 3 : 1)) - 0.1 * (Math.abs(f) - 1);
    const len = Math.max(u * 0.5, (endY - y0) * Math.min(1, k));
    out += ringletSvg(ctx, fills, f * hw, y0, len, { sway: f * (front ? -0.02 : 0.05), r: hw * 0.15, phase: i * 1.9 + (front ? 1 : 0) });
  });
  return out;
}

// ---- dreadlocks ---------------------------------------------------------------------------------

/** A gold ring clasped around a lock (the near half in front, a dark sliver of the far half behind). */
function goldRing(ctx: Ctx, cx: number, cy: number, halfW: number): string {
  const { g } = ctx;
  const r = halfW * 1.22;
  const sag = halfW * 0.8;
  const front = `${M(cx - r, cy - sag * 0.1)}${Q(cx, cy + sag, cx + r, cy - sag * 0.1)}`;
  const back = `${M(cx - r, cy - sag * 0.1)}${Q(cx, cy - sag * 0.75, cx + r, cy - sag * 0.1)}`;
  const hi = `${M(cx - r * 0.78, cy + sag * 0.12)}${Q(cx - r * 0.4, cy + sag * 0.5, cx - r * 0.02, cy + sag * 0.52)}`;
  return (
    stroke(ctx, back, '#8a5f12', g.lw * 2.4, { opacity: 0.65 }) +
    stroke(ctx, front, '#8a5f12', g.lw * 5.2, { opacity: 0.9 }) +
    stroke(ctx, front, '#f0c24a', g.lw * 3.6) +
    stroke(ctx, front, '#ffe48a', g.lw * 1.5, { transform: `translate(0 ${-g.lw * 0.5})`, opacity: 0.8 }) +
    stroke(ctx, hi, '#fffbe6', g.lw * 1.3, { opacity: 0.95 })
  );
}

/** One soft, slightly tapered lock: a gently swaying S-curve, full at the root, with subtle twist marks. */
function dreadSvg(ctx: Ctx, fills: { fill: string; shade: string }, x0: number, y0: number, len: number, o: { sway: number; w: number; phase: number; ring?: number }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const n = 14;
  const cx = (t: number): number => x0 + o.sway * len * t + Math.sin(t * 3.1 + o.phase) * o.w * 0.9 * Math.min(1, t * 2);
  const hwAt = (t: number): number => (o.w / 2) * (1.1 - 0.62 * Math.pow(t, 1.1)) * (1 + 0.05 * Math.sin(t * 9 + o.phase * 1.7));
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    L.push({ x: cx(t) - hwAt(t), y: y0 + len * t });
    R.push({ x: cx(t) + hwAt(t), y: y0 + len * t });
  }
  const te: Pt = { x: cx(1), y: y0 + len };
  const hE = hwAt(1);
  const d = smoothClosed([
    ...L,
    { x: te.x - hE * 0.75, y: te.y + hE * 0.55 }, { x: te.x - hE * 0.1, y: te.y + hE * 0.95 }, { x: te.x + hE * 0.55, y: te.y + hE * 0.7 },
    ...R.slice().reverse(),
  ]);
  // faint twist marks: short slanted dashes, irregular and low in contrast (no full rings)
  let seg = '';
  const K = Math.max(4, Math.round(len / (g.u * 0.1)));
  for (let k = 0; k < K; k++) {
    const t = (k + 0.5 + 0.5 * (hash(k * 1.7 + o.phase) - 0.5)) / K;
    const y = y0 + len * t;
    const c = cx(t) + (hash(k * 3.3 + o.phase) - 0.5) * hwAt(t) * 0.4, h = hwAt(t);
    const s = k % 2 ? 1 : -1;
    const a = `${M(c - h * 0.7, y - h * 0.1 * s)}${Q(c, y + h * 0.35, c + h * 0.7, y + h * 0.1 * s)}`;
    seg += stroke(ctx, a, darken(ctx.hairShade, 0.08), g.lw * 0.6, { opacity: 0.18 });
  }
  const line = (f: number, a: number, b: number): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = lerp(a, b, i / 8);
      pts.push({ x: cx(t) + hwAt(t) * f, y: y0 + len * t });
    }
    return pts;
  };
  seg += stroke(ctx, smoothOpen(line(0.55, 0.05, 0.95), 1 / 6), darken(ctx.hairShade, 0.1), o.w * 0.16, { opacity: 0.35 });
  seg += stroke(ctx, smoothOpen(line(-0.42, 0.02, 0.85), 1 / 6), ctx.hairLight, o.w * 0.11, { opacity: 0.5 });
  let out = cel(ctx, d, fills.fill, { ...opts, inside: seg });
  if (o.ring !== undefined) out += goldRing(ctx, cx(o.ring), y0 + len * o.ring, hwAt(o.ring));
  return out;
}

/** Locks behind the shoulders (`front` false) or over them (`front` true); a few carry gold rings. */
function dreadsSvg(ctx: Ctx, fills: { fill: string; shade: string }, front: boolean, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const m = metrics(ctx);
  const endY = hairEnd(ctx);
  // back locks: drawn from the outside in, so the inner ones overlap; the extra ones fill the gaps
  const xs = front ? [-1.42, -1.2, -1.0, 1.0, 1.22, 1.42] : [-1.4, -1.18, -0.95, -0.72, 0.72, 0.95, 1.18, 1.4];
  // (index -> position of the gold ring along the lock); only the front locks carry rings
  const rings: Record<number, number> = { 1: 0.5, 2: 0.7, 3: 0.4, 5: 0.6 };
  let out = '';
  xs.forEach((f, i) => {
    const h = (a: number): number => hash(i * a + (front ? 5 : 2));
    const y0 = m.yc + u * (front ? 0.2 + 0.07 * (i % 3) : 0.1 + 0.05 * (i % 2));
    const k = (front ? 0.68 : 0.9) + 0.3 * h(3.1) - 0.1 * (Math.abs(f) - 1);
    const len = Math.max(u * 0.5, (endY - y0) * Math.min(1, k));
    const w = hw * (0.2 + 0.07 * h(1.3));
    out += dreadSvg(ctx, fills, f * hw, y0, len, { sway: f * (front ? -0.02 : 0.05) + (h(2.1) - 0.5) * 0.04, w, phase: i * 2.3, ring: front ? rings[i] : undefined }, opts);
  });
  return out;
}

// ---- pixie cut ------------------------------------------------------------------------------------

/**
 * Pointed flicks of the pixie cut behind the hair mass: lifted tufts around the crown, flicks behind
 * the ears and small wisps at the nape. Their bases sit inside the mass, only the points show.
 */
function pixieTufts(ctx: Ctx, fills: { fill: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const m = metrics(ctx);
  const u = g.u, hw = g.hw;
  let out = '';
  const flick = (b: Pt, e: Pt, bend: number, w: number): string => cel(ctx, wispD(b, e, bend, w), fills.fill, opts);
  // crown: lifted, slightly leaning tufts of uneven length
  const ring = skullArc(g, m.rx * 1.02, m.yc, m.vTop - u * 0.02, 0, Math.PI, 12);
  const crown: Array<[number, number, number]> = [[2, 0.07, 0.8], [3, 0.09, 0.7], [4, 0.06, 0.6], [5, 0.09, 0.7], [6, 0.06, 0.6], [7, 0.08, 0.7], [8, 0.07, 0.6]];
  for (const [i, len, lean] of crown) {
    const P = ring[Math.min(i, ring.length - 1)];
    const nx = P.x / (m.rx * 1.02), ny = (P.y - m.yc) / Math.max(1, m.yc - (g.yTop - u * 0.04));
    const l = Math.hypot(nx, ny) || 1;
    const dx = nx / l, dy = ny / l;
    const b: Pt = { x: P.x - dx * u * 0.06, y: P.y - dy * u * 0.06 };
    const e: Pt = { x: P.x + dx * len * u - dy * lean * len * u * 0.9, y: P.y + dy * len * u + dx * lean * len * u * 0.9 };
    out += flick(b, e, lean * len * u * 0.5, u * 0.055);
  }
  for (const sd of [-1, 1] as const) {
    // behind the ears: pointed flicks, down and out
    out += flick({ x: sd * hw * 0.9, y: m.yc + u * 0.02 }, { x: sd * hw * 1.1, y: m.yc + u * 0.5 }, sd * u * 0.05, u * 0.065);
    out += flick({ x: sd * hw * 0.85, y: m.yc + u * 0.18 }, { x: sd * hw * 0.93, y: m.yc + u * 0.66 }, sd * u * 0.045, u * 0.06);
    // nape: short wisps below the ears, along the neck
    out += flick({ x: sd * hw * 0.5, y: g.yTop + u * 0.7 }, { x: sd * hw * 0.62, y: g.yTop + u * 1.04 }, sd * u * 0.04, u * 0.055);
    out += flick({ x: sd * hw * 0.34, y: g.yTop + u * 0.74 }, { x: sd * hw * 0.4, y: g.yTop + u * 1.0 }, sd * u * 0.03, u * 0.045);
  }
  return out;
}

/** Pointed sideburn wisps in front of the ears (drawn with the front hair), for the pixie cut. */
function pixieSideburns(ctx: Ctx, fills: { fill: string; shade: string }, lock: LockSpec): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  const opts = { line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 2, dy: -g.lw * 1.2 };
  let out = '';
  const flick = (b: Pt, e: Pt, bend: number, w: number): string => cel(ctx, wispD(b, e, bend, w), fills.fill, opts);
  for (const sd of [-1, 1] as const) {
    const sx = lock.tipX, ty = lock.tipY;
    // long sideburn pointing down along the cheek, curling slightly towards the face
    out += flick({ x: sd * sx * 1.0, y: ty - u * 0.2 }, { x: sd * sx * 0.88, y: ty + u * 0.34 }, -sd * u * 0.05, u * 0.065);
    // a shorter flick in front of the ear, flicking outward
    out += flick({ x: sd * sx * 1.04, y: ty - u * 0.14 }, { x: sd * (sx * 1.1 + hw * 0.03), y: ty + u * 0.16 }, sd * u * 0.035, u * 0.045);
  }
  return out;
}

// ---- afro --------------------------------------------------------------------------------------

interface Afro {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Bump junction points around the cloud (clockwise from the top) and the radius of each arc. */
  pts: Pt[];
  rs: number[];
  d: string;
}

/** The cloud: bump arcs between points on an ellipse, so the outline is round and bumpy. */
function afroGeo(ctx: Ctx): Afro {
  const { g, p } = ctx;
  const dm = afroDims(g.u, g.hw, p.hairLength);
  const cx = 0, cy = g.yTop + dm.cy;
  const N = 20;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const th = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / N;
    const j = 1 + 0.035 * (hash(i * 3.1 + 5) - 0.5) * 2;
    pts.push({ x: cx + dm.rx * j * Math.cos(th), y: cy + dm.ry * j * Math.sin(th) });
  }
  const rs: number[] = [];
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const A = pts[i], B = pts[(i + 1) % N];
    const r = Math.hypot(B.x - A.x, B.y - A.y) * (0.6 + 0.05 * hash(i * 1.9 + 3));
    rs.push(r);
    d += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
  }
  return { cx, cy, rx: dm.rx, ry: dm.ry, pts, rs, d: d + 'Z' };
}

/** Everything inside the cloud: shading, lobe shadows and many small curls (clipped by the caller). */
function afroInterior(ctx: Ctx, a: Afro): string {
  const { g } = ctx;
  const set = new StrandSet();
  const dark = darken(ctx.hairShade, 0.05);
  const sw = Math.max(0.5, g.lw * 0.8);
  // an inner arc along every bump: shadow on the lower right, light on the upper left
  const N = a.pts.length;
  for (let i = 0; i < N; i++) {
    const A = a.pts[i], B = a.pts[(i + 1) % N];
    const sc = (q: Pt): Pt => ({ x: lerp(a.cx, q.x, 0.9), y: lerp(a.cy, q.y, 0.9) });
    const A2 = sc(A), B2 = sc(B);
    const r = a.rs[i] * 0.88;
    const d = `M${A2.x.toFixed(1)} ${A2.y.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${B2.x.toFixed(1)} ${B2.y.toFixed(1)}`;
    const lit = (A.x + B.x) / 2 - a.cx < 0 && (A.y + B.y) / 2 - a.cy < a.ry * 0.3;
    if (lit) set.add(d, ctx.hairLight, sw * 1.6, 0.5);
    else set.add(d, dark, sw * 1.8, 0.45);
  }
  // small curls (open spirals) scattered over the whole cloud
  const K = 120;
  for (let j = 0; j < K; j++) {
    const ang = hash(j * 1.7 + 2) * Math.PI * 2;
    const rr = Math.sqrt(hash(j * 2.9 + 7)) * 0.86;
    const x = a.cx + a.rx * rr * Math.cos(ang), y = a.cy + a.ry * rr * Math.sin(ang);
    const cr = a.rx * 0.06 * (0.8 + 0.5 * hash(j * 5.1));
    const a0 = hash(j * 4.3) * Math.PI * 2;
    const pts: Pt[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const th = a0 + t * Math.PI * 2 * 1.3;
      const rad = cr * (1 - 0.7 * t);
      pts.push({ x: x + rad * Math.cos(th), y: y + rad * Math.sin(th) });
    }
    const d = M(pts[0].x, pts[0].y) + smoothOpen(pts, 1 / 6, false);
    const litSide = x < a.cx - a.rx * 0.1 && y < a.cy + a.ry * 0.2;
    const pick = hash(j * 8.1 + 1) + (litSide ? 0.3 : -0.2);
    if (pick > 0.7) set.add(d, ctx.hairLight, sw * 0.9, 0.6);
    else if (pick > 0.5) set.add(d, ctx.hairRim, sw * 0.8, 0.35);
    else set.add(d, dark, sw * 1.1, 0.55);
  }
  // darker towards the face, lit on the outer upper left; a soft glow on the lit lobes
  const rid = ctx.uid('afg');
  const radial =
    `<radialGradient id="${rid}" gradientUnits="userSpaceOnUse" cx="0" cy="${(a.cy + a.ry * 0.25).toFixed(1)}" r="${(a.rx * 0.98).toFixed(1)}">` +
    `<stop offset="0" stop-color="${ctx.hairShade}" stop-opacity="0.6"/><stop offset="0.6" stop-color="${ctx.hairShade}" stop-opacity="0.3"/><stop offset="1" stop-color="${ctx.hairShade}" stop-opacity="0"/></radialGradient>` +
    `<rect x="${(a.cx - a.rx * 1.3).toFixed(1)}" y="${(a.cy - a.ry * 1.3).toFixed(1)}" width="${(a.rx * 2.6).toFixed(1)}" height="${(a.ry * 2.6).toFixed(1)}" fill="url(#${rid})"/>`;
  let glow = '';
  for (let i = 0; i < N; i++) {
    const A = a.pts[i];
    if (A.x - a.cx < 0 && A.y - a.cy < a.ry * 0.3) {
      const q = { x: lerp(a.cx, A.x, 0.82), y: lerp(a.cy, A.y, 0.82) };
      glow += ellipse(q.x, q.y, a.rx * 0.13, a.rx * 0.09, { fill: ctx.hairRim, opacity: 0.35, transform: `rotate(${(Math.atan2(A.y - a.cy, A.x - a.cx) * 180) / Math.PI + 90} ${q.x.toFixed(1)} ${q.y.toFixed(1)})` });
    }
  }
  return radial + lightSide(ctx) + group(glow, { filter: `url(#${ctx.soft})` }) + set.svg(ctx, true);
}

/** The part of the afro in front of the face: a curly hairline instead of a fringe. */
function afroFront(ctx: Ctx, fills: { fill: string; shade: string }, m: HairMetrics): string {
  const { g, p } = ctx;
  const u = g.u;
  const a = afroGeo(ctx);
  const X = m.rx * 1.1;
  const xs = m.rx * 0.98;
  // hairline from the right temple to the left one: soft round scallops along a gentle arch
  const NS = 8;
  const hp: Pt[] = [];
  for (let i = 0; i <= NS; i++) {
    const x = lerp(xs, -xs, i / NS);
    hp.push({ x, y: g.yTop + u * (0.2 + 0.2 * Math.pow(Math.abs(x) / xs, 3)) });
  }
  let hairline = M(hp[0].x, hp[0].y);
  for (let i = 0; i < NS; i++) {
    const r = Math.hypot(hp[i + 1].x - hp[i].x, hp[i + 1].y - hp[i].y) * 0.6;
    hairline += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${hp[i + 1].x.toFixed(1)} ${hp[i + 1].y.toFixed(1)}`;
  }
  const top = skullArc(g, X, m.yc, u * 0.14, Math.PI, 0, 14);
  const d = M(top[0].x, top[0].y) + smoothOpen(top, 1 / 6, false) + L(hp[0].x, hp[0].y) + hairline.replace(/^M[^A]*/, '') + 'Z';
  const clip = ctx.uid('afc');
  let out = `<clipPath id="${clip}">${path(d)}</clipPath>`;
  // the hairline softly shades the forehead
  out += group(
    path(hairline + L(hp[NS].x, hp[NS].y - u * 0.3) + L(hp[0].x, hp[0].y - u * 0.3) + 'Z', { fill: mix(ctx.skinShade, '#a0606e', 0.45), opacity: 0.6, transform: `translate(${g.hw * 0.02} ${u * 0.05})`, filter: `url(#${ctx.soft})` }),
    { 'clip-path': `url(#${ctx.faceClip})` },
  );
  out += group(path(d, { fill: fills.fill }) + afroInterior(ctx, a), { 'clip-path': `url(#${clip})` });
  out += stroke(ctx, hairline, ctx.hairLine, g.lw, { opacity: 0.55 });
  out += stroke(ctx, hairline, ctx.hairLight, g.lw * 0.7, { opacity: 0.45, transform: `translate(0 ${-g.lw * 1.4})` });
  if (p.ahoge) out += ahogeSvg(ctx, fills, a.cy - a.ry * 1.07 + u * 0.03);
  return out;
}
