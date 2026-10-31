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
    case 'curls': return curlEnd(ctx);
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
    if (style === 'wavy') wave = hw * 0.22;
    if (style === 'hime') { spec.n = 7; spec.varLen = 0.05; spec.depth = 0.035; spec.lean = 0.1; }
  }
  if (style === 'dreads') { wTop = hw * 1.04; wEnd = hw * 0.96; spec.n = 6; spec.varLen = 0.1; }
  if (style === 'pixie') { wTop = hw * 1.1; wEnd = hw * 0.98; spec.n = 9; spec.varLen = 0.2; spec.depth = 0.14; spec.lean = 0.45; }
  if (style === 'short' || style === 'buns' || style === 'ponytail' || style === 'twintails' || style === 'drills' || style === 'sidetail' || style === 'braid') { wTop = hw * 1.12; wEnd = hw * 1.0; spec.n = 6; spec.varLen = 0.08; }
  if (style === 'sidetail' || style === 'braid' || style === 'ponytail' || style === 'twintails' || style === 'buns') { wTop = hw * 1.08; wEnd = hw * 0.97; }

  const y0 = m.yc;
  const left: Pt[] = [];
  let right: Pt[];
  // wavy hair: medium, even S-waves; both edges sway the same way and the width breathes a little
  const wavy = style === 'wavy';
  const lambda = g.u * 0.95;
  const n = wavy ? Math.max(8, Math.round(((yEnd - y0) / lambda) * 6)) : 5;
  const sway = (y: number, f: number): number => {
    const env = Math.min(1, Math.max(0, (y - y0) / (g.u * 0.35)));
    return env * env * (3 - 2 * env) * (wave * Math.sin(((y - y0) / lambda) * Math.PI * 2) * (0.6 + 0.4 * f));
  };
  const breathe = (y: number, f: number): number => {
    const env = Math.min(1, Math.max(0, (y - y0) / (g.u * 0.35)));
    return env * env * (3 - 2 * env) * wave * 0.5 * Math.cos(((y - y0) / lambda) * Math.PI * 2) * (0.6 + 0.4 * f);
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
  if (p.hairBack === 'curls') return out + curlsBack(ctx, fills, opts);
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
  } else if (p.hairBack === 'dreads') {
    out += dreadsBack(ctx, fills, opts);
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
  out += fade.defs + (p.hairBack === 'pixie' ? '' : looseStrands(ctx, bm, fills.fill));
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
    case 'bob': ty = g.yChin + g.u * 0.07; break;
    case 'pixie': ty = g.yTop + g.u * 0.5; break;
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
  if (p.hairBack === 'curls') return fills.defs + curlsFront(ctx, fills, m) + (p.ahoge ? ahogeSvg(ctx, fills, g.yTop + u * (CURL_TOP + 0.03)) : '');
  if (p.hairBack === 'dreads') return fills.defs + dreadsFront(ctx, fills, m) + (p.ahoge ? ahogeSvg(ctx, fills, g.yTop - u * 0.015) : '');
  const pixie = p.hairBack === 'pixie';
  const { tips: rawTips, crown } = bangTips(ctx);
  let tips = pixie ? styleBangTips(ctx, rawTips) : mergeBangTips(ctx, styleBangTips(ctx, rawTips));
  if (pixie) {
    // a short, piecey fringe: tips closer to the hairline, uneven in length and a little swept to one side
    tips = tips.map((t, i) => (i === 0 || i === tips.length - 1 ? t : { x: t.x + hw * 0.03, y: g.yTop + (t.y - g.yTop) * 0.86 + (hash(i * 3.9 + 1) - 0.5) * u * 0.05 }));
  }
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
    bangLocks(tips, u * (pixie ? Math.max(0.05, BANG_DEPTH[p.hairFront] * 1.8) : BANG_DEPTH[p.hairFront]), hw * (pixie ? 0.012 : p.hairFront === 'spiky' ? 0.02 : 0.035), !pixie && p.hairFront === 'blunt') +
    rInner + rOuter +
    (pixie ? pixieTop(ctx, m) : smoothOpen(arcR, 1 / 6, false)) + 'Z';
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
  const fadeOn = p.hairFront !== 'blunt' && p.hairFront !== 'forehead' && !pixie;
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
    inside: underside + lightSide(ctx) + strands + waveLines + (pixie ? pixieSlivers(ctx, m, tips) : '') + fineStrands(ctx, tips, crownX, m, sx, ty) + ring + ring2 + rimLight(ctx, smoothOpen(arcR)),
  });
  const wisps = pixie ? '' : bangWisps(ctx, mix(p.hairColor, ctx.hairShade, 0.55), tips);
  out += fadeOn ? group(front + wisps, { mask: `url(#${fade})` }) : front + wisps;
  if (!pixie) out += flyaways(ctx, m, ty);
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

// ---- curls: a voluminous mass of loose spiral curls ---------------------------------------------

/** Half width of the curly mass (in head half widths) at a depth below the skull top (in head heights). */
const CURL_W: ReadonlyArray<readonly [number, number]> = [[0.34, 1.38], [0.62, 1.6], [0.95, 1.78], [1.35, 1.86], [4, 1.88]];
/** Apex of the curly volume above the skull top, in head heights. */
const CURL_TOP = -0.1;

/** Half width of the curly mass at height y (a dome on top, widening to the shoulders: a pear shape). */
function curlHalf(ctx: Ctx, y: number, inset = 0): number {
  const { g } = ctx;
  const t = (y - g.yTop) / g.u;
  let w = CURL_W[CURL_W.length - 1][1];
  if (t <= CURL_W[0][0]) {
    const s = clamp((t - CURL_TOP) / (CURL_W[0][0] - CURL_TOP), 0, 1);
    w = CURL_W[0][1] * Math.sqrt(1 - (1 - s) * (1 - s));
  } else {
    for (let i = 0; i < CURL_W.length - 1; i++) {
      const [t0, w0] = CURL_W[i], [t1, w1] = CURL_W[i + 1];
      if (t <= t1) { w = lerp(w0, w1, (1 - Math.cos((Math.PI * (t - t0)) / (t1 - t0))) / 2); break; }
    }
  }
  return Math.max(0, w * g.hw - inset);
}

/** Where the curly hair ends at the back (and, a little higher, at the front). */
function curlEnd(ctx: Ctx): number {
  const { g, p } = ctx;
  const L = p.hairLength / 100;
  const chin = g.yChin + g.u * 0.1;
  const collar = g.yShoulder + g.torsoLen * 0.04;
  const back = g.yShoulder + g.torsoLen * 0.42;
  return Math.min(-14, L < 0.55 ? lerp(chin, collar, L / 0.55) : lerp(collar, back, (L - 0.55) / 0.45));
}

/**
 * Outline of the curly mass as a dense polyline: from the bottom of the left side up over the dome
 * and down the right side. `inset` pulls the outline inwards, `yBottom` is where the sides end.
 */
function curlSides(ctx: Ctx, yBottom: number, inset: number): Pt[] {
  const { g } = ctx;
  const topY = g.yTop + g.u * CURL_TOP + inset * 0.8;
  const yc = g.yTop + g.u * CURL_W[0][0];
  const asym = (y: number, s: number): number => 1 + 0.035 * Math.sin(y * 0.07 + (s > 0 ? 4 : 1));
  const left: Pt[] = [];
  const lowN = Math.max(3, Math.round((yBottom - yc) / (g.u * 0.1)));
  for (let i = 0; i <= lowN; i++) {
    const y = lerp(yBottom, yc, i / lowN);
    left.push({ x: -curlHalf(ctx, y, inset) * asym(y, -1), y });
  }
  const wc = curlHalf(ctx, yc, inset);
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    left.push({ x: -wc * Math.cos(a), y: lerp(yc, topY, Math.sin(a)) });
  }
  const right = left.slice().reverse().map((q) => ({ x: -q.x * (asym(q.y, 1) / asym(q.y, -1)), y: q.y }));
  return [...left, ...right.slice(1)];
}

/** Round bumps along a polyline: arcs between junction points about `spacing` apart (the loose curly edge). */
function bumps(poly: Pt[], spacing: number, salt: number, round = 0.62): { d: string; pts: Pt[] } {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const total = cum[cum.length - 1];
  const at = (s: number): Pt => {
    let i = 1;
    while (i < poly.length - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return { x: lerp(poly[i - 1].x, poly[i].x, f), y: lerp(poly[i - 1].y, poly[i].y, f) };
  };
  const pts: Pt[] = [poly[0]];
  let s = 0;
  for (let k = 0; ; k++) {
    s += spacing * (0.8 + 0.45 * hash(k * 2.3 + salt));
    if (s >= total - spacing * 0.45) break;
    pts.push(at(s));
  }
  pts.push(poly[poly.length - 1]);
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const chord = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const r = Math.max(chord * 0.56, chord * (round + 0.14 * (hash(i * 1.7 + salt + 3) - 0.5)));
    d += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return { d, pts };
}

/** A path drawn at an offset (the same shape is drawn twice: as a shadow and as a highlight). */
type Shifted = (dx: number, dy: number) => string;

/**
 * One curl as a chain of round arcs, `d` wide, turned by `rot`: 0 = spiral (one and a half turns),
 * 1 = C (a half circle), 2 = S (two half circles the other way round). `flip` mirrors it.
 */
function curlArcs(cx: number, cy: number, d: number, kind: number, rot: number, flip: number): Shifted {
  const c = Math.cos(rot), s = Math.sin(rot);
  const widths = kind === 0 ? [d, d * 0.62, d * 0.38] : kind === 1 ? [d] : [d, d];
  return (dx, dy) => {
    const P = (a: number): string => {
      const x = cx + a * c + dx, y = cy + a * s + dy;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    };
    let a = -d / 2;
    let out = `M${P(a)}`;
    widths.forEach((w, i) => {
      const dir = kind === 0 ? (i % 2 ? -1 : 1) : 1;
      a += dir * w;
      const sweep = kind === 2 && i === 1 ? 1 - (flip > 0 ? 1 : 0) : flip > 0 ? 1 : 0;
      out += `A${(w / 2).toFixed(1)} ${(w / 2).toFixed(1)} 0 0 ${sweep} ${P(a)}`;
    });
    return out;
  };
}

/** An ellipse as a path piece (so many lobes can share one path). */
const blobD = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)}a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)} 0a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)} 0Z`;

/**
 * Curl texture inside the mass (clipped to it by the caller): soft light and shadow lobes and many
 * C-, S- and spiral-shaped strands, each as a shadow stroke with a bright line beside it.
 */
function curlTexture(ctx: Ctx, area: { x0: number; x1: number; y0: number; y1: number }, inside: (x: number, y: number) => boolean, step: number, salt: number): string {
  const { g } = ctx;
  const u = g.u;
  const set = new StrandSet();
  const dark = darken(ctx.hairShade, 0.1);
  const sw = Math.max(0.6, u * 0.0145);
  let litD = '';
  let darkD = '';
  let row = 0;
  for (let y = area.y0; y <= area.y1; y += step * 0.85, row++) {
    for (let x = area.x0 + (row % 2) * step * 0.5; x <= area.x1; x += step) {
      const cx = x + (hash(x * 0.37 + y * 1.13 + salt) - 0.5) * step * 0.9;
      const cy = y + (hash(x * 0.91 + y * 0.57 + salt + 3) - 0.5) * step * 0.9;
      if (!inside(cx, cy)) continue;
      const hh = (a: number): number => hash(cx * 0.31 * a + cy * 0.77 + salt);
      const dd = u * (0.07 + 0.06 * hh(1.7));
      const kind = Math.floor(hh(2.9) * 3);
      const gen = curlArcs(cx, cy, dd, kind, hh(4.1) * Math.PI * 2, hh(5.3) < 0.5 ? 1 : -1);
      const lit = cx < -g.hw * 0.1 && cy < g.yTop + u * 0.9;
      const pick = hh(6.7) + (lit ? 0.3 : -0.2);
      set.add(gen(sw * 0.4, sw * 0.55), dark, sw * 1.3, 0.55);
      if (pick > 0.5) set.add(gen(0, 0), ctx.hairLight, sw * 0.75, 0.75);
      else if (pick > 0.3) set.add(gen(0, 0), ctx.hairRim, sw * 0.55, 0.45);
      if (hh(8.1) < 0.5) litD += pick > 0.45 ? blobD(cx - dd * 0.15, cy - dd * 0.2, dd * 0.8, dd * 0.6) : '';
      else darkD += pick < 0.5 ? blobD(cx + dd * 0.2, cy + dd * 0.25, dd * 0.75, dd * 0.6) : '';
    }
  }
  const lobes = group(path(darkD, { fill: dark, opacity: 0.4 }) + path(litD, { fill: ctx.hairLight, opacity: 0.38 }), { filter: `url(#${ctx.soft})` });
  return lobes + set.svg(ctx, true);
}

/** Curls drawn as strokes: outline, body, shadow and highlight, grouped into a few paths. */
function ringletStrokes(ctx: Ctx, fills: { fill: string; shade: string }, curves: Shifted[], w: number, outline = true): string {
  const { g } = ctx;
  if (!curves.length) return '';
  const join = (dx: number, dy: number): string => curves.map((c) => c(dx, dy)).join('');
  return (
    (outline ? stroke(ctx, join(0, 0), ctx.hairLine, w + g.lw * 1.4, { opacity: 0.4 }) : '') +
    stroke(ctx, join(0, 0), fills.fill, w) +
    stroke(ctx, join(w * 0.18, w * 0.25), fills.shade, w * 0.42, { opacity: 0.5 }) +
    stroke(ctx, join(-w * 0.17, -w * 0.24), ctx.hairLight, w * 0.3, { opacity: 0.65 })
  );
}

/** Curls around the outline: small spirals curling out of the edge and loops at the bottom. */
function curlEdgeCurls(ctx: Ctx, fills: { fill: string; shade: string }, edge: Pt[], bottom: Pt[], salt: number): string {
  const { g } = ctx;
  const u = g.u;
  const thin: Shifted[] = [];
  const thick: Shifted[] = [];
  edge.forEach((P, i) => {
    if (i < 2 || i > edge.length - 3 || hash(i * 3.7 + salt) < 0.4) return;
    const nx0 = P.x, ny0 = P.y - (g.yTop + u * 0.55);
    const l = Math.hypot(nx0, ny0) || 1;
    const d = u * (0.08 + 0.07 * hash(i * 1.1 + salt));
    const c: Pt = { x: P.x + (nx0 / l) * d * 0.35, y: P.y + (ny0 / l) * d * 0.35 };
    thin.push(curlArcs(c.x, c.y, d, hash(i * 4.4 + salt) < 0.6 ? 0 : 1, Math.atan2(ny0, nx0) + (hash(i * 9.1 + salt) - 0.5) * 2.2, hash(i * 2.2 + salt) < 0.5 ? 1 : -1));
  });
  bottom.forEach((P, i) => {
    if (i === 0 || i === bottom.length - 1 || hash(i * 5.1 + salt) < 0.2) return;
    const d = u * (0.12 + 0.05 * hash(i * 1.9 + salt));
    thick.push(curlArcs(P.x + (hash(i * 7.7 + salt) - 0.5) * u * 0.05, P.y - d * 0.1, d, 0, Math.PI / 2 + (hash(i * 3.3 + salt) - 0.5) * 0.7, hash(i * 2.6 + salt) < 0.5 ? 1 : -1));
  });
  return ringletStrokes(ctx, fills, thin, Math.max(0.9, u * 0.02)) + ringletStrokes(ctx, fills, thick, u * 0.034);
}

/** The hairline of the curly hair, by fringe style: x in head half widths, `a` the height at the middle. */
function curlHairline(ctx: Ctx): { px: number; hy: (x: number) => number } {
  const { g, p } = ctx;
  const u = g.u, hw = g.hw;
  const xs = hw * 0.9;
  const S: Record<AnimeParams['hairFront'], { a: number; b: number; e: number; px: number; tilt: number }> = {
    straight: { a: 0.28, b: 0.05, e: 2, px: 0, tilt: 0 },
    side: { a: 0.2, b: 0.12, e: 2, px: -0.35, tilt: 0.1 },
    parted: { a: 0.17, b: 0.17, e: 2.2, px: 0, tilt: 0 },
    curtain: { a: 0.14, b: 0.2, e: 1.1, px: 0, tilt: 0 },
    blunt: { a: 0.36, b: 0.0, e: 2, px: 0, tilt: 0 },
    swept: { a: 0.22, b: 0.1, e: 2, px: 0.3, tilt: -0.12 },
    spiky: { a: 0.24, b: 0.08, e: 2, px: 0, tilt: 0 },
    forehead: { a: 0.1, b: 0.16, e: 2.2, px: 0, tilt: 0 },
  };
  const s = S[p.hairFront];
  return { px: s.px * hw, hy: (x) => g.yTop + u * (s.a + s.b * Math.pow(Math.min(1, Math.abs(x) / xs), s.e) + s.tilt * clamp(x / xs, -1, 1)) };
}

/** Inner edge of the front curls (towards the face / neck) at height y, as a positive distance from the centre. */
function curlInner(ctx: Ctx, y: number): number {
  const { g, p } = ctx;
  const f = faceHalfWidthAt(g, p.faceShape, Math.min(y, g.yChin)) * 0.94;
  const neck = g.hw * lerp(0.34, 0.58, clamp((y - g.yChin) / (g.u * 1.3), 0, 1));
  return Math.max(f, neck);
}

/** Curly hair behind the head and shoulders. */
function curlsBack(ctx: Ctx, fills: { fill: string; shade: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  const m = metrics(ctx);
  const yEnd = curlEnd(ctx);
  const sides = curlSides(ctx, yEnd, 0);
  const wl = -sides[0].x, wr = sides[sides.length - 1].x;
  const bottom: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    bottom.push({ x: lerp(wr, -wl, f), y: i === 0 ? yEnd : i === 8 ? yEnd : yEnd + u * (-0.02 + 0.08 * hash(i * 2.3 + 5)) });
  }
  const sb = bumps(sides, u * 0.16, 1);
  const bb = bumps(bottom, u * 0.15, 7);
  const d = M(sides[0].x, sides[0].y) + sb.d + bb.d + 'Z';
  const topY = g.yTop + u * CURL_TOP;
  const faceShadow = path(ctx.faceD, { fill: mix(ctx.hairShade, '#000000', 0.15), stroke: mix(ctx.hairShade, '#000000', 0.15), 'stroke-width': u * 0.12, 'stroke-linejoin': 'round', opacity: 0.6, transform: `translate(0 ${u * 0.04})` });
  const rid = ctx.uid('crg');
  const radial =
    `<radialGradient id="${rid}" gradientUnits="userSpaceOnUse" cx="0" cy="${(m.yc + u * 0.5).toFixed(1)}" r="${(hw * 2.1).toFixed(1)}">` +
    `<stop offset="0" stop-color="${darken(ctx.hairShade, 0.08)}" stop-opacity="0.85"/><stop offset="0.55" stop-color="${ctx.hairShade}" stop-opacity="0.4"/><stop offset="1" stop-color="${ctx.hairShade}" stop-opacity="0"/></radialGradient>` +
    `<rect x="${(-hw * 3).toFixed(1)}" y="${(topY - u).toFixed(1)}" width="${(hw * 6).toFixed(1)}" height="${(yEnd - topY + u * 2).toFixed(1)}" fill="url(#${rid})"/>`;
  const inside =
    radial + lightSide(ctx) + faceShadow +
    curlTexture(ctx, { x0: -hw * 2, x1: hw * 2, y0: topY, y1: yEnd + u * 0.1 }, (x, y) => y > topY + 2 && y < yEnd && Math.abs(x) < curlHalf(ctx, y, 1.5), u * 0.16, 11) +
    rimLight(ctx, d, yEnd - g.yTop);
  const edge = sb.pts;
  return curlEdgeCurls(ctx, fills, edge, bb.pts, 3) + cel(ctx, d, fills.fill, { ...opts, inside });
}

/** Curly hair in front: the dome on top with its curly part, and the curls framing the face and falling over the shoulders. */
function curlsFront(ctx: Ctx, fills: { fill: string; shade: string }, m: HairMetrics): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  const yEnd = curlEnd(ctx) - u * 0.1;
  const inset = hw * 0.07;
  const hl = curlHairline(ctx);
  const xs = hw * 0.9;
  const hyT = hl.hy(xs);
  const sides = curlSides(ctx, yEnd, inset);
  const wl = -sides[0].x, wr = sides[sides.length - 1].x;
  // the bottom edges, outer to inner on the right and inner to outer on the left
  const xin = (y: number): number => curlInner(ctx, y);
  const botR: Pt[] = [], botL: Pt[] = [];
  for (let i = 0; i <= 3; i++) {
    const f = i / 3;
    const yy = i === 0 || i === 3 ? yEnd : yEnd + u * (0.0 + 0.06 * hash(i * 3.1 + 2));
    botR.push({ x: lerp(wr, xin(yEnd), f), y: yy });
    botL.push({ x: lerp(-xin(yEnd), -wl, f), y: i === 0 || i === 3 ? yEnd : yEnd + u * (0.0 + 0.06 * hash(i * 4.1 + 6)) });
  }
  // inner edges: up from the bottom to the temple (right), down from the temple (left)
  const innerR: Pt[] = [];
  const nI = 10;
  for (let i = 0; i <= nI; i++) {
    const y = lerp(yEnd, hyT, i / nI);
    innerR.push({ x: i === nI ? xs : xin(y), y });
  }
  const innerL = innerR.slice().reverse().map((q) => ({ x: -q.x, y: q.y }));
  innerL[0] = { x: -xs, y: hl.hy(-xs) };
  // hairline: from the right temple to the part, then on to the left temple
  const hair = (x0: number, x1: number): Pt[] => {
    const pts: Pt[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const x = lerp(x0, x1, i / n);
      pts.push({ x, y: hl.hy(x) });
    }
    return pts;
  };
  const px = hl.px;
  const hr = bumps(hair(xs, px), u * 0.16, 21, 0.6);
  const hlf = bumps(hair(px, -xs), u * 0.16, 23, 0.6);
  const sb = bumps(sides, u * 0.16, 5);
  const br = bumps(botR, u * 0.16, 9);
  const bl = bumps(botL, u * 0.16, 13);
  const ir = bumps(innerR, u * 0.2, 17, 0.6);
  const il = bumps(innerL, u * 0.2, 19, 0.6);
  const startPt = sides[0];
  const d = M(startPt.x, startPt.y) + sb.d + br.d + ir.d + hr.d + hlf.d + il.d + bl.d + 'Z';
  const topY = g.yTop + u * CURL_TOP;
  const inside = (x: number, y: number): boolean => {
    if (y < topY + 2 || y > yEnd - 2 || Math.abs(x) > curlHalf(ctx, y, inset + 1.5)) return false;
    return y < hl.hy(x) - 3 || Math.abs(x) > xin(y) + 2;
  };
  const rid = ctx.uid('crf');
  const radial =
    `<radialGradient id="${rid}" gradientUnits="userSpaceOnUse" cx="0" cy="${(m.yc + u * 0.45).toFixed(1)}" r="${(hw * 1.9).toFixed(1)}">` +
    `<stop offset="0.25" stop-color="${darken(ctx.hairShade, 0.06)}" stop-opacity="0.75"/><stop offset="0.7" stop-color="${ctx.hairShade}" stop-opacity="0.25"/><stop offset="1" stop-color="${ctx.hairShade}" stop-opacity="0"/></radialGradient>` +
    `<rect x="${(-hw * 3).toFixed(1)}" y="${(topY - u).toFixed(1)}" width="${(hw * 6).toFixed(1)}" height="${(yEnd - topY + u * 2).toFixed(1)}" fill="url(#${rid})"/>`;
  const hairlineD = M(xs, hl.hy(xs)) + hr.d + hlf.d;
  let out = '';
  // the hairline softly shades the forehead
  out += group(
    path(hairlineD + L(-xs, hl.hy(-xs) - u * 0.3) + L(xs, hl.hy(xs) - u * 0.3) + 'Z', { fill: mix(ctx.skinShade, '#a0606e', 0.45), opacity: 0.6, transform: `translate(${hw * 0.02} ${u * 0.05})`, filter: `url(#${ctx.soft})` }),
    { 'clip-path': `url(#${ctx.faceClip})` },
  );
  // stray curls and loops at the edge, behind the front mass
  out += curlEdgeCurls(ctx, fills, sb.pts, [...br.pts.slice(0, -1), ...bl.pts.slice(1)], 31);
  // the part: a dark soft line from the crown to the hairline, with a light edge
  const part = `${M(px * 0.7, topY + u * 0.06)}${Q(px * 0.9, lerp(topY, hl.hy(px), 0.55), px, hl.hy(px) - u * 0.01)}`;
  const body =
    radial + lightSide(ctx) +
    curlTexture(ctx, { x0: -hw * 2, x1: hw * 2, y0: topY, y1: yEnd }, inside, u * 0.105, 41) +
    stroke(ctx, part, darken(ctx.hairShade, 0.15), g.lw * 1.5, { opacity: 0.45 }) +
    stroke(ctx, part, ctx.hairLight, g.lw * 0.8, { opacity: 0.45, transform: `translate(${-g.lw * 1.4} 0)` }) +
    rimLight(ctx, d, u * 2);
  out += cel(ctx, d, fills.fill, { line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 2.4, dy: -g.lw * 1.3, inside: body });
  out += stroke(ctx, hairlineD, ctx.hairLight, g.lw * 0.8, { opacity: 0.4, transform: `translate(0 ${-g.lw * 1.4})` });
  // a loose ringlet at each temple, curling in front of the cheek
  const tendrils: Shifted[] = [];
  for (const s of [-1, 1] as const) {
    const P: Pt = { x: s * xs * 1.08, y: hl.hy(s * xs) + u * 0.05 };
    tendrils.push(curlArcs(P.x, P.y + u * 0.07, u * 0.13, 0, Math.PI / 2, s));
    tendrils.push(curlArcs(P.x + s * u * 0.01, P.y + u * 0.24, u * 0.1, 1, Math.PI / 2, -s));
  }
  out += ringletStrokes(ctx, fills, tendrils, u * 0.026);
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

/** Points of a smooth (Catmull-Rom) curve through `ctrl`, `per` samples per segment. */
function catmull(ctrl: Pt[], per = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/**
 * One soft, slightly tapered lock along a curve through `ctrl` (from its root to its tip): full at the
 * root, rounded at the tip, with subtle twist marks and a lit and a shaded edge. A gold ring clasps it
 * at `o.ring` (0 = root .. 1 = tip) when given.
 */
function ropeSvg(ctx: Ctx, fills: { fill: string; shade: string }, ctrl: Pt[], o: { w: number; taper: number; phase: number; ring?: number }, opts: { line: string; shadeColor: string; dx: number; dy: number }, rings?: string[]): string {
  const { g } = ctx;
  const c = catmull(ctrl, 3);
  const N = c.length - 1;
  const tan = c.map((_, i) => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(N, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const hwAt = (i: number): number => {
    const t = i / N;
    return (o.w / 2) * (1 - (1 - o.taper) * Math.pow(t, 1.1)) * (1 + 0.05 * Math.sin(t * 9 + o.phase));
  };
  const off = (i: number, f: number): Pt => ({ x: c[i].x - tan[i].y * hwAt(i) * f, y: c[i].y + tan[i].x * hwAt(i) * f });
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i <= N; i++) { L.push(off(i, 1)); R.push(off(i, -1)); }
  const te = c[N], tt = tan[N], hE = hwAt(N);
  const nx = -tt.y, ny = tt.x;
  const cap: Pt[] = [
    { x: te.x + nx * hE * 0.8 + tt.x * hE * 0.55, y: te.y + ny * hE * 0.8 + tt.y * hE * 0.55 },
    { x: te.x + tt.x * hE * 0.98 + nx * hE * 0.1, y: te.y + tt.y * hE * 0.98 + ny * hE * 0.1 },
    { x: te.x - nx * hE * 0.7 + tt.x * hE * 0.5, y: te.y - ny * hE * 0.7 + tt.y * hE * 0.5 },
  ];
  const d = smoothClosed([...L, ...cap, ...R.slice().reverse()]);
  // faint twist marks: short slanted dashes, irregular and low in contrast (no full rings)
  let seg = '';
  let dashes = '';
  const len = c.reduce((s, q, i) => (i ? s + Math.hypot(q.x - c[i - 1].x, q.y - c[i - 1].y) : 0), 0);
  const K = Math.max(3, Math.round(len / (g.u * 0.1)));
  for (let k = 0; k < K; k++) {
    const i = Math.min(N - 1, Math.round(((k + 0.5 + 0.5 * (hash(k * 1.7 + o.phase) - 0.5)) / K) * N));
    const s = k % 2 ? 1 : -1;
    const A = off(i, 0.7), B = off(i, -0.7);
    const mid: Pt = { x: c[i].x + tan[i].x * hwAt(i) * 0.4 * s, y: c[i].y + tan[i].y * hwAt(i) * 0.4 * s };
    dashes += `${M(A.x, A.y)}${Q(mid.x, mid.y, B.x, B.y)}`;
  }
  seg += stroke(ctx, dashes, darken(ctx.hairShade, 0.08), g.lw * 0.6, { opacity: 0.2 });
  const edgeLine = (f: number, a: number, b: number): Pt[] => {
    const pts: Pt[] = [];
    for (let i = Math.round(a * N); i <= Math.round(b * N); i++) pts.push(off(i, f));
    return pts.length > 1 ? pts : [off(0, f), off(N, f)];
  };
  seg += stroke(ctx, smoothOpen(edgeLine(-0.55, 0.05, 0.95), 1 / 6), darken(ctx.hairShade, 0.1), o.w * 0.16, { opacity: 0.35 });
  seg += stroke(ctx, smoothOpen(edgeLine(0.42, 0.02, 0.85), 1 / 6), ctx.hairLight, o.w * 0.11, { opacity: 0.5 });
  let out = cel(ctx, d, fills.fill, { ...opts, inside: seg });
  if (o.ring !== undefined) {
    const i = Math.round(clamp(o.ring, 0, 1) * N);
    const deg = (Math.atan2(tan[i].y, tan[i].x) * 180) / Math.PI - 90;
    const ring = group(goldRing(ctx, c[i].x, c[i].y, hwAt(i)), { transform: `rotate(${deg.toFixed(1)} ${c[i].x.toFixed(1)} ${c[i].y.toFixed(1)})` });
    if (rings) rings.push(ring);
    else out += ring;
  }
  return out;
}

/** Dreadlocks falling behind the head and shoulders (roots hidden behind the head). */
function dreadsBack(ctx: Ctx, fills: { fill: string; shade: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const m = metrics(ctx);
  const endY = hairEnd(ctx);
  // drawn from the outside in, so the inner locks overlap; the extra ones fill the gaps
  const xs = [-1.4, -1.18, -0.95, -0.72, 0.72, 0.95, 1.18, 1.4];
  let out = '';
  xs.forEach((f, i) => {
    const h = (a: number): number => hash(i * a + 2);
    const y1 = m.yc + (endY - m.yc) * Math.min(1, 0.9 + 0.3 * h(3.1) - 0.1 * (Math.abs(f) - 1));
    const sway = (h(2.1) - 0.5) * 0.3 * hw;
    const ctrl: Pt[] = [
      { x: f * hw * 0.55, y: m.yc - u * 0.22 },
      { x: f * hw * 0.92, y: m.yc + u * 0.12 },
      { x: f * hw * 1.0 + sway, y: lerp(m.yc, y1, 0.5) },
      { x: f * hw * 1.04 + sway * 1.5, y: Math.max(y1, m.yc + u * 0.6) },
    ];
    out += ropeSvg(ctx, fills, ctrl, { w: hw * (0.21 + 0.07 * h(1.3)), taper: 0.4, phase: i * 2.3 }, opts);
  });
  return out;
}

/**
 * The front of the dreadlock hair: no cap and no fringe. The scalp is made of locks that grow out of
 * the hairline and the parting and run back over the head; a few locks start at the temples and fall
 * over the shoulders.
 */
function dreadsFront(ctx: Ctx, fills: { fill: string; shade: string }, m: HairMetrics): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  const opts = { line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 2.2, dy: -g.lw * 1.2 };
  const xs = m.rx * 0.98;
  const hy = (x: number): number => g.yTop + u * (0.2 + 0.17 * Math.pow(Math.min(1, Math.abs(x) / xs), 2.2));
  const endY = hairEnd(ctx);
  let out = '';
  // locks falling beside the face: they start at the hairline of the temple (the scalp locks cover their roots)
  const rings: string[] = [];
  const hang: Array<{ s: -1 | 1; x: number; end: number; ring?: number; w: number; xm: number; xe: number }> = [];
  for (const s of [-1, 1] as const) {
    hang.push({ s, x: 0.86, end: endY, ring: 0.62, w: 0.27, xm: 1.05, xe: 1.1 });
    hang.push({ s, x: 0.72, end: lerp(g.yChin, endY, 0.45), ring: 0.55, w: 0.24, xm: 0.98, xe: 0.93 });
    hang.push({ s, x: 0.94, end: g.yChin + u * 0.15, w: 0.22, xm: 1.1, xe: 1.16 });
  }
  hang.forEach((h, i) => {
    const s = h.s;
    const yA = g.yTop + u * 0.58;
    const ctrl: Pt[] = [
      { x: s * h.x * hw, y: hy(xs) - u * 0.05 },
      { x: s * hw * h.xm, y: yA },
      { x: s * hw * lerp(h.xm, h.xe, 0.5) + s * hw * 0.14 * Math.sin(i * 2.1 + 1), y: lerp(yA, h.end, 0.5) },
      { x: s * hw * h.xe, y: h.end },
    ];
    out += ropeSvg(ctx, fills, ctrl, { w: hw * h.w, taper: 0.45, phase: i * 1.9 + 4, ring: h.ring }, opts, rings);
  });
  out += rings.join('');
  // the scalp: a dark base between the locks, then locks fanning from the hairline towards the crown
  const rxS = m.rx * 1.04;
  const top = skullArc(g, rxS, m.yc, m.vTop, Math.PI, 0, 14);
  const hairline: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = lerp(xs, -xs, i / 10);
    hairline.push({ x, y: hy(x) });
  }
  const base = M(top[0].x, top[0].y) + smoothOpen(top, 1 / 6, false) + L(hairline[0].x, hairline[0].y) + smoothOpen(hairline, 1 / 6, false) + 'Z';
  out += group(
    path(base, { fill: mix(ctx.skinShade, '#a0606e', 0.45), opacity: 0.6, transform: `translate(${hw * 0.02} ${u * 0.06})`, filter: `url(#${ctx.soft})` }),
    { 'clip-path': `url(#${ctx.faceClip})` },
  );
  out += cel(ctx, base, fills.shade, { ...opts, line: null });
  const roots = [0.06, 0.25, 0.44, 0.63, 0.82];
  const arc = skullArc(g, rxS * 1.03, m.yc, m.vTop, 0, Math.PI, 40);
  const items: Array<{ s: -1 | 1; r: number; k: number }> = [];
  roots.forEach((r, k) => { items.push({ s: -1, r, k }); items.push({ s: 1, r, k }); });
  // outer locks first, so the ones next to the parting lie on top
  items.sort((a, b) => b.r - a.r);
  items.forEach(({ s, r, k }, i) => {
    const x = s * r * xs;
    const R: Pt = { x: x + (hash(i * 6.1) - 0.5) * hw * 0.04, y: hy(x) - u * (0.006 + 0.02 * hash(i * 4.7)) };
    const th = Math.PI / 2 - s * (r * 0.5 * Math.PI + 0.04 * Math.PI * hash(i * 1.7 + 3));
    const E = arc[clamp(Math.round((th / Math.PI) * 40), 0, 40)];
    const Em: Pt = { x: E.x + s * hw * 0.02, y: E.y + u * 0.005 };
    const mid: Pt = { x: lerp(R.x, Em.x, 0.45) + s * hw * 0.07 * (1 + r), y: lerp(R.y, Em.y, 0.5) };
    const w = hw * (0.25 + 0.05 * hash(i * 2.9 + 1));
    out += ropeSvg(ctx, fills, [R, mid, Em], { w, taper: 0.62, phase: k * 1.7 + (s > 0 ? 3 : 0) }, opts);
  });
  // the hairline: a soft light edge where the roots meet the forehead
  out += stroke(ctx, smoothOpen(hairline), ctx.hairLine, g.lw, { opacity: 0.5 });
  return out;
}

// ---- pixie cut ------------------------------------------------------------------------------------

/**
 * The top outline of the pixie cut, from the right temple over the crown to the left one: a row of
 * short pieces whose points lean to the right (the sweep), taller on top, close to the head at the sides.
 */
function pixieTop(ctx: Ctx, m: HairMetrics): string {
  const { g } = ctx;
  const u = g.u;
  const arc = skullArc(g, m.rx, m.yc, m.vTop, 0, Math.PI, 40);
  const n = 12;
  let d = '';
  for (let i = 0; i < n; i++) {
    const f0 = i / n, f1 = (i + 1) / n;
    const B1 = arc[Math.round(f1 * 40)];
    const Pm = arc[Math.round((f0 + 0.35 * (f1 - f0)) * 40)];
    const top = Math.sin((f0 + f1) * Math.PI / 2);
    const h = u * (0.02 + (0.04 + 0.045 * hash(i * 3.1 + 4)) * top);
    const ox = Pm.x / (m.rx || 1), oy = (Pm.y - m.yc) / Math.max(1, m.yc - (g.yTop - m.vTop));
    const l = Math.hypot(ox, oy) || 1;
    // the point leans back towards the right (towards the start of this walk)
    const tip: Pt = { x: Pm.x + (ox / l) * h + u * 0.07 * top, y: Pm.y + (oy / l) * h + u * 0.01 };
    d += Q((Pm.x + tip.x) / 2 + u * 0.01, (Pm.y + tip.y) / 2 - u * 0.005, tip.x, tip.y) + L(B1.x, B1.y);
  }
  return d;
}

/** Thin light and dark slivers inside the top of the pixie cut: the piecey, feathered layers. */
function pixieSlivers(ctx: Ctx, m: HairMetrics, tips: Pt[]): string {
  const { g } = ctx;
  const u = g.u;
  const sorted = tips.slice().sort((a, b) => a.x - b.x);
  let lit = '';
  let dark = '';
  const n = 22;
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5 + (hash(k * 3.3) - 0.5) * 0.6) / n;
    const x = lerp(-m.rx * 0.85, m.rx * 0.85, f);
    const row = k % 3;
    const b: Pt = { x, y: g.yTop - u * 0.02 + u * 0.06 * row + u * 0.05 * Math.pow(Math.abs(f - 0.5) * 2, 2) };
    const lean = 0.42 + 0.2 * (hash(k * 2.3) - 0.5);
    const len = u * (0.14 + 0.1 * hash(k * 5.1));
    let e: Pt = { x: b.x + lean * len, y: b.y + Math.sqrt(1 - lean * lean) * len };
    const lim = polyY(sorted, e.x) - u * 0.03;
    if (e.y > lim) e = { x: b.x + lean * len * ((lim - b.y) / (e.y - b.y)), y: lim };
    if (e.y - b.y < u * 0.05) continue;
    const w = u * 0.028;
    if (k % 2) lit += wispD(b, e, u * 0.012, w);
    else dark += wispD({ x: b.x + u * 0.025, y: b.y }, { x: e.x + u * 0.02, y: e.y }, -u * 0.01, w * 0.85);
  }
  return path(dark, { fill: darken(ctx.hairShade, 0.1), opacity: 0.5 }) + path(lit, { fill: ctx.hairLight, opacity: 0.7 });
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
