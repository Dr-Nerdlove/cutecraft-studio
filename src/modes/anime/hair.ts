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

/**
 * Inside of a small hair part drawn in the soft style: darker towards `dark` (where it meets the head or
 * hides under other hair), the light side, fine strands and the warm rim light. Clipped by the caller.
 */
function softInside(ctx: Ctx, d: string, strands: StrandSet, dark: { cx: number; cy: number; r: number; inner: number }, reach: number): string {
  const id = ctx.uid('hdk');
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${dark.cx.toFixed(1)}" cy="${dark.cy.toFixed(1)}" r="${dark.r.toFixed(1)}">` +
    `<stop offset="${dark.inner.toFixed(2)}" stop-color="${darken(ctx.hairShade, 0.08)}" stop-opacity="0.75"/><stop offset="1" stop-color="${ctx.hairShade}" stop-opacity="0"/></radialGradient>` +
    `<rect x="${(dark.cx - dark.r).toFixed(1)}" y="${(dark.cy - dark.r).toFixed(1)}" width="${(dark.r * 2).toFixed(1)}" height="${(dark.r * 2).toFixed(1)}" fill="url(#${id})"/>` +
    strands.svg(ctx) +
    rimLight(ctx, d, reach, 0.5)
  );
}

/** Adds a strand in one of the three hair tones (light, warm rim, dark), picked by `r` in 0..1. */
function toneStrand(ctx: Ctx, set: StrandSet, d: string, r: number, sw: number): void {
  if (r > 0.7) set.add(d, ctx.hairLight, sw, 0.45);
  else if (r > 0.52) set.add(d, ctx.hairRim, sw * 0.8, 0.35);
  else set.add(d, darken(ctx.hairShade, 0.06), sw, 0.55);
}

/** One soft lock for the messy cut: a curved sliver from base P along the normal, bending sideways. */
function messyLock(P: Pt, nx: number, ny: number, len: number, lean: number, half: number): { d: string; axis: [Pt, Pt, Pt] } {
  const tx = -ny, ty = nx; // tangent
  const B: Pt = { x: P.x - nx * half * 0.8, y: P.y - ny * half * 0.8 };
  const E: Pt = { x: P.x + nx * len + tx * lean * len * 0.55, y: P.y + ny * len + ty * lean * len * 0.55 };
  // the lock curls a little: its middle bows towards the lean side
  const Cm: Pt = { x: (B.x + E.x) / 2 + tx * lean * len * 0.3 - nx * len * 0.05, y: (B.y + E.y) / 2 + ty * lean * len * 0.3 - ny * len * 0.05 };
  const w = half;
  const d =
    M(B.x - tx * w, B.y - ty * w) +
    C(Cm.x - tx * w * 0.75, Cm.y - ty * w * 0.75, E.x - tx * w * 0.35 - nx * len * 0.12, E.y - ty * w * 0.35 - ny * len * 0.12, E.x, E.y) +
    C(E.x + tx * w * 0.15 - nx * len * 0.22, E.y + ty * w * 0.15 - ny * len * 0.22, Cm.x + tx * w * 0.8, Cm.y + ty * w * 0.8, B.x + tx * w, B.y + ty * w) +
    'Z';
  return { d, axis: [B, Cm, E] };
}

/** Tousled locks sticking out around the head for the messy short cut (drawn behind the hair mass). */
function messyTufts(ctx: Ctx, fills: { fill: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const m = metrics(ctx);
  const u = g.u;
  const ring = skullArc(g, m.rx * 1.02, m.yc, m.vTop - u * 0.04, 0, Math.PI, 10);
  // [index on the ring, length in head heights, how much the tip droops sideways]
  const spec: Array<[number, number, number]> = [[1, 0.17, 0.95], [2, 0.14, 0.85], [3, 0.15, 0.7], [4, 0.09, 0.6], [5, 0.08, -0.6], [6, 0.09, 0.6], [7, 0.15, 0.7], [8, 0.14, 0.85], [9, 0.17, 0.95]];
  const locks: Array<{ d: string; axis: [Pt, Pt, Pt]; half: number }> = [];
  for (const [i, len, lean] of spec) {
    const P = ring[i];
    const nx = P.x / (m.rx * 1.02), ny = (P.y - m.yc) / Math.max(1, m.yc - (g.yTop - u * 0.04));
    const l = Math.hypot(nx, ny) || 1;
    const half = u * 0.1;
    // the tips droop towards the outside and down (the lean sign follows the side of the head)
    const droop = Math.abs(P.x) < m.rx * 0.15 ? 1 : Math.sign(nx);
    locks.push({ ...messyLock(P, nx / l, ny / l, len * u, lean * droop, half), half });
  }
  // locks falling beside the cheeks, curling outwards
  for (const sd of [-1, 1] as const) {
    for (const [dy, len] of [[0.1, 0.17], [0.28, 0.15]] as const) {
      const P: Pt = { x: sd * m.rx * 0.98, y: m.yc + u * dy };
      const half = u * 0.085;
      locks.push({ ...messyLock(P, sd * 0.7, 0.71, len * u, sd * -0.55, half), half });
    }
  }
  const d = locks.map((k) => k.d).join('');
  const set = new StrandSet();
  const sw = Math.max(0.45, g.lw * 0.6);
  locks.forEach((k, i) => {
    const [B, Cm, E] = k.axis;
    for (let j = 0; j < 3; j++) {
      const r = hash(i * 7.1 + j * 2.9);
      const off = (j - 1) * k.half * 0.45;
      const dx = (Cm.y - B.y), dy = -(Cm.x - B.x);
      const l = Math.hypot(dx, dy) || 1;
      const ox = (dx / l) * off, oy = (dy / l) * off;
      const f = 0.72 + 0.2 * r; // strands stop before the tip at different lengths
      const end: Pt = { x: lerp(Cm.x, E.x, f) + ox * 0.3, y: lerp(Cm.y, E.y, f) + oy * 0.3 };
      toneStrand(ctx, set, M(B.x + ox, B.y + oy) + Q(Cm.x + ox, Cm.y + oy, end.x, end.y), hash(i * 3.3 + j * 5.7), sw * (0.8 + 0.6 * r));
    }
  });
  const inside = softInside(ctx, d, set, { cx: 0, cy: m.yc, r: Math.max(m.rx, m.yc - g.yTop) * 1.3, inner: 0.7 }, u * 0.9);
  return cel(ctx, d, fills.fill, { ...opts, inside });
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

/**
 * One drill curl: a smooth, glossy spiral hanging from the tie. The outline bulges once per turn, the
 * turns are separated by soft dark grooves, a light band runs down the lit side and fine strands follow
 * each turn.
 */
function drillCurl(ctx: Ctx, fills: { fill: string; shade: string }, side: 1 | -1, tie: Pt, endY: number, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const hw = g.hw, s = side, u = g.u;
  const len = endY - tie.y;
  const turns = Math.max(4, Math.round(len / (u * 0.15)));
  const y0 = tie.y + u * 0.02;
  const axisX = (t: number): number => tie.x + s * hw * (0.3 + 0.1 * t);
  const axisY = (t: number): number => y0 + (endY - u * 0.02 - y0) * t;
  // narrow at the tie, full after the first turn, then tapering to the end
  const width = (t: number): number => hw * 0.4 * (1 - 0.6 * t) * (0.45 + 0.55 * Math.min(1, Math.sqrt(t * turns)));
  // the turns are tilted: a groove starts higher on the outer side than on the inner side
  const tilt = (u * 0.05) * s;
  const steps = turns * 6;
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = t * turns;
    const w = width(t);
    // bulge per turn, offset between the two sides by half a turn (that makes it read as a spiral)
    const bl = 0.84 + 0.16 * Math.sin(Math.PI * (k % 1));
    const br = 0.84 + 0.16 * Math.sin(Math.PI * ((k + 0.5) % 1));
    left.push({ x: axisX(t) - w * bl, y: axisY(t) });
    right.push({ x: axisX(t) + w * br, y: axisY(t) });
  }
  const tip: Pt = { x: axisX(1) + s * hw * 0.03, y: endY + u * 0.04 };
  const top: Pt = { x: axisX(0), y: tie.y - u * 0.02 };
  const d = smoothClosed([top, ...left, tip, ...right.reverse()]);
  const set = new StrandSet();
  const sw = Math.max(0.45, g.lw * 0.6);
  let grooves = '';
  let gloss = '';
  for (let i = 1; i <= turns; i++) {
    const t = i / turns;
    const tm = (i - 0.5) / turns;
    const w = width(Math.min(1, t)) * 1.05;
    const x = axisX(t), y = axisY(t);
    // groove: a curve across the drill, lower in the middle (seen from slightly above)
    const sag = (len / turns) * 0.28;
    if (i < turns) grooves += M(x - w, y - tilt) + Q(x, y + sag, x + w, y + tilt);
    // light band on the lit side of every turn
    const wm = width(tm);
    const xm = axisX(tm), ym = axisY(tm);
    gloss += M(xm - wm * 0.55, ym - (len / turns) * 0.3) + Q(xm - wm * 0.25, ym - (len / turns) * 0.05, xm + wm * 0.15, ym + (len / turns) * 0.3);
    // strands follow the turn
    for (let j = 0; j < 4; j++) {
      const r = hash(i * 4.3 + j * 1.7 + (s > 0 ? 50 : 0));
      const fy = ym + (len / turns) * (-0.35 + 0.22 * j);
      toneStrand(ctx, set, M(xm - wm * 0.95, fy - tilt * 0.8) + Q(xm, fy + sag * (0.6 + 0.4 * r), xm + wm * (0.6 + 0.35 * r), fy + tilt * 0.8), r, sw * (0.7 + 0.6 * hash(j + i)));
    }
  }
  const inside =
    shadeOverlay(ctx, tie.y, endY, fills.shade, 0.45) +
    group(stroke(ctx, grooves, darken(ctx.hairShade, 0.12), u * 0.05, { opacity: 0.7 }), { filter: `url(#${ctx.soft})` }) +
    stroke(ctx, grooves, darken(ctx.hairShade, 0.15), Math.max(0.5, g.lw * 0.7), { opacity: 0.45 }) +
    group(stroke(ctx, gloss, ctx.hairLight, u * 0.035, { opacity: 0.75 }), { filter: `url(#${ctx.soft})` }) +
    lightSide(ctx) +
    set.svg(ctx, true) +
    rimLight(ctx, d, len, 0.6);
  return cel(ctx, d, fills.fill, { ...opts, inside });
}

/**
 * A single braid hanging over the shoulder, in the soft style: the links form one shape, separated by soft
 * dark grooves, with strands following every link, a sheen on the lit side and rim light. Ends in a tuft
 * and a tie.
 */
function braidSvg(ctx: Ctx, fills: { fill: string; shade: string }, side: 1 | -1): string {
  const { g, p } = ctx;
  const hw = g.hw, s = side, u = g.u;
  const endY = hairEnd(ctx);
  const y0 = g.yTop + u * 0.52;
  const x0 = s * hw * 0.84;
  const x1 = s * hw * 0.9;
  const len = endY - y0;
  const n = Math.max(5, Math.round(len / (u * 0.12)));
  const opts = { line: ctx.hairLine, shadeColor: ctx.hairShade, dx: -g.lw * 1.4, dy: -g.lw * 0.9 };
  let d = '';
  let grooves = '';
  let gloss = '';
  const set = new StrandSet();
  const sw = Math.max(0.45, g.lw * 0.55);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const cx = lerp(x0, x1, t) + Math.sin(t * Math.PI * 2) * hw * 0.05 * s;
    const cy = y0 + (len - u * 0.1) * t;
    const rx = hw * 0.22 * (1 - 0.4 * t);
    const ry = (len / n) * 0.78;
    const flip = i % 2 === 0 ? 1 : -1;
    d += blobPath(cx, cy, rx, ry, flip * 0.5);
    // local frame of the link: x across (mirrored on every other link), y down
    const P = (lx: number, ly: number): Pt => ({ x: cx + flip * lx * rx, y: cy + ly * ry });
    const ptxt = (q: Pt): string => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    // groove along the upper edge, where the link comes out from under the one above
    if (i > 0) {
      const a = P(-1.0, 0.05), b = P(-0.15, -1.15), c = P(0.95, -0.7);
      grooves += `M${ptxt(a)}Q${ptxt(b)} ${ptxt(c)}`;
    }
    for (let j = 0; j < 4; j++) {
      const k = j / 3 - 0.5;
      const r = hash(i * 6.1 + j * 2.3);
      const a = P(-0.9, -0.55 + 0.6 * k), b = P(0.05, -0.25 + 0.7 * k), c = P(0.85, 0.5 + 0.5 * k);
      toneStrand(ctx, set, `M${ptxt(a)}Q${ptxt(b)} ${ptxt(c)}`, r, sw * (0.7 + 0.6 * hash(i + j * 3)));
    }
    const a = P(-0.55, -0.35), b = P(-0.1, -0.15), c = P(0.25, 0.3);
    gloss += `M${ptxt(a)}Q${ptxt(b)} ${ptxt(c)}`;
  }
  // tuft below the last link
  const tx = lerp(x0, x1, 1);
  const ty = y0 + (len - u * 0.1);
  const w = hw * 0.15;
  const tuft = M(tx - w, ty) + Q(tx - w * 1.2, ty + u * 0.1, tx - w * 0.2, ty + u * 0.2) + Q(tx + w * 0.1, ty + u * 0.1, tx + w * 0.55, ty + u * 0.17) + Q(tx + w * 1.3, ty + u * 0.06, tx + w, ty) + 'Z';
  for (let j = 0; j < 6; j++) {
    const f = j / 5;
    const r = hash(j * 9.7 + 4);
    const bx = tx + w * lerp(-0.8, 0.8, f);
    toneStrand(ctx, set, M(bx, ty - u * 0.01) + Q(bx + w * (f - 0.5) * 0.4, ty + u * 0.08, tx + w * lerp(-0.4, 0.6, f), ty + u * (0.12 + 0.05 * r)), r, sw);
  }
  const all = d + tuft;
  const fade = endFade(ctx, ty + u * 0.2, u * 0.12, '#b0b0b0');
  const inside =
    shadeOverlay(ctx, y0, ty + u * 0.2, fills.shade, 0.45) +
    group(stroke(ctx, grooves, darken(ctx.hairShade, 0.12), u * 0.045, { opacity: 0.75 }), { filter: `url(#${ctx.soft})` }) +
    stroke(ctx, grooves, darken(ctx.hairShade, 0.15), Math.max(0.5, g.lw * 0.7), { opacity: 0.4 }) +
    group(stroke(ctx, gloss, ctx.hairLight, u * 0.03, { opacity: 0.6 }), { filter: `url(#${ctx.soft})` }) +
    lightSide(ctx) +
    set.svg(ctx, true) +
    rimLight(ctx, all, len, 0.5);
  let out = fade.defs + group(cel(ctx, all, fills.fill, { ...opts, inside }), fade.attrs);
  const tieColor = p.headAcc !== 'none' ? p.headAccColor : '#ff8fb1';
  out += ellipse(tx, ty - u * 0.01, w * 1.35, u * 0.032, { fill: tieColor, stroke: mix(tieColor, '#5a2040', 0.45), 'stroke-width': g.lw * 0.8 });
  return out;
}

/** Both buns in the soft style: hair wound around the centre, darker underneath, a sheen and rim light. */
function bunsSvg(ctx: Ctx, fills: { fill: string; shade: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }, tie: (x: number, y: number, rx: number, ry: number, rot: number) => string): string {
  const { g } = ctx;
  const hw = g.hw, u = g.u;
  const r = hw * 0.31;
  const cy = g.yTop - u * 0.01;
  let d = '';
  let ties = '';
  let sheen = '';
  const set = new StrandSet();
  const sw = Math.max(0.45, g.lw * 0.6);
  for (const s of [-1, 1] as const) {
    const cx = s * hw * 0.68;
    const by = cy - r * 0.2;
    d += bunPath(cx, by, r);
    // strands wound around the bun: arcs around a centre a little above the middle
    const wx = cx + r * 0.05, wy = by - r * 0.25;
    for (let j = 0; j < 9; j++) {
      const q = hash(j * 3.7 + s * 11);
      const rr = r * (0.3 + 0.08 * j) ;
      const a0 = Math.PI * (0.85 + 0.3 * q), a1 = a0 + Math.PI * (0.9 + 0.5 * hash(j * 1.3 + s));
      const P0: Pt = { x: wx + Math.cos(a0) * rr, y: wy + Math.sin(a0) * rr * 0.8 };
      const am = (a0 + a1) / 2;
      const P2: Pt = { x: wx + Math.cos(a1) * rr, y: wy + Math.sin(a1) * rr * 0.8 };
      const k = 1 / Math.cos((a1 - a0) / 2);
      const P1: Pt = { x: wx + Math.cos(am) * rr * k, y: wy + Math.sin(am) * rr * 0.8 * k };
      toneStrand(ctx, set, M(P0.x, P0.y) + Q(P1.x, P1.y, P2.x, P2.y), hash(j * 5.1 + s * 3), sw * (0.7 + 0.6 * q));
    }
    sheen += M(cx - r * 0.62, by - r * 0.35) + Q(cx - r * 0.2, by - r * 1.05, cx + r * 0.45, by - r * 0.65);
    ties += tie(cx - s * r * 0.1, cy + r * 0.55, r * 0.9, u * 0.032, 0);
  }
  const inside =
    shadeOverlay(ctx, cy - r * 0.9, cy + r * 0.6, fills.shade, 0.6) +
    group(stroke(ctx, sheen, ctx.hairLight, u * 0.04, { opacity: 0.65 }), { filter: `url(#${ctx.soft})` }) +
    lightSide(ctx) +
    set.svg(ctx, true) +
    rimLight(ctx, d, r * 2);
  return cel(ctx, d, fills.fill, { ...opts, inside }) + ties;
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
  // dreadlocks hang as single locks: no closed hair mass behind the head (it showed as a patch beside the ears)
  if (p.hairBack === 'dreads') return out + dreadsBack(ctx, fills, opts);
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
  } else if (p.hairBack === 'buns') {
    out += bunsSvg(ctx, fills, opts, tie);
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
  if (p.hairBack === 'curls') return fills.defs + curlsFront(ctx, fills, m) + (p.ahoge ? ahogeSvg(ctx, fills, g.yTop - g.accLift + u * 0.05) : '');
  if (p.hairBack === 'dreads') return fills.defs + dreadsFront(ctx, fills, m) + (p.ahoge ? ahogeSvg(ctx, fills, g.yTop - g.accLift + u * 0.05) : '');
  const pixie = p.hairBack === 'pixie';
  const { tips: rawTips, crown } = bangTips(ctx);
  let tips = pixie ? styleBangTips(ctx, rawTips) : mergeBangTips(ctx, styleBangTips(ctx, rawTips));
  if (pixie) {
    // a short, piecey fringe: tips closer to the hairline, uneven in length and a little swept to one side
    tips = tips.map((t, i) => (i === 0 || i === tips.length - 1 ? t : {
      x: t.x + hw * (0.04 + 0.05 * (hash(i * 5.3 + 2) - 0.5)),
      y: g.yTop + (t.y - g.yTop) * 0.86 + (hash(i * 3.9 + 1) - 0.5) * u * 0.08,
    }));
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
    bangLocks(tips, u * (pixie ? Math.max(0.05, BANG_DEPTH[p.hairFront] * 1.8) : BANG_DEPTH[p.hairFront]), hw * (pixie ? 0.022 : p.hairFront === 'spiky' ? 0.02 : 0.035), !pixie && p.hairFront === 'blunt') +
    rInner + rOuter +
    (pixie ? pixieTufts(ctx, m).d : smoothOpen(arcR, 1 / 6, false)) + 'Z';
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
function rimLight(ctx: Ctx, d: string, reach = ctx.g.u, strength = 1): string {
  const { g } = ctx;
  const id = ctx.uid('rim');
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(-g.hw * 1.3).toFixed(1)}" y1="${g.yTop.toFixed(1)}" x2="${(g.hw * 1.3).toFixed(1)}" y2="${(g.yTop + Math.max(g.u, reach * 0.6)).toFixed(1)}">` +
    `<stop offset="0" stop-color="${ctx.hairRim}" stop-opacity="0.9"/><stop offset="1" stop-color="${ctx.hairRim}" stop-opacity="0.25"/></linearGradient>` +
    path(d, { fill: 'none', stroke: `url(#${id})`, 'stroke-width': (g.u * 0.06).toFixed(2), filter: `url(#${ctx.soft})`, opacity: strength < 1 ? strength : undefined })
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
  const back = g.yShoulder + g.torsoLen * 0.58;
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

/**
 * A smooth path through points (Catmull-Rom as cubic Béziers) with coordinates rounded to one decimal:
 * ringlets have many points, and the gallery shows many pictures at once.
 */
function compactPath(pts: Pt[], closed: boolean): string {
  const f = (v: number): string => (Math.round(v * 10) / 10).toString();
  const len = pts.length;
  if (len < 2) return '';
  const at = (i: number): Pt => (closed ? pts[(i + len) % len] : pts[clamp(i, 0, len - 1)]);
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  const segs = closed ? len : len - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return closed ? d + 'Z' : d;
}

/** Smooth step from 0 (at a) to 1 (at b). */
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** `n + 1` points spread evenly along the smooth curve through `ctrl`, and its length. */
function evenCurve(ctrl: Pt[], n: number): { pts: Pt[]; len: number } {
  const raw = catmull(ctrl, 8);
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  const len = cum[cum.length - 1] || 1;
  const pts: Pt[] = [];
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    while (j < raw.length - 1 && cum[j] < s) j++;
    const f = clamp((s - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]), 0, 1);
    pts.push({ x: lerp(raw[j - 1].x, raw[j].x, f), y: lerp(raw[j - 1].y, raw[j].y, f) });
  }
  return { pts, len };
}

interface Ringlet {
  /** Centre line from the root to the tip. */
  ctrl: Pt[];
  /** Width at the root. */
  w: number;
  /** Which way the turns of the spiral slant. */
  hand: 1 | -1;
  /** Where the first turn sits (0..1 of a turn). */
  phase: number;
  /** Further back: darker and with less gloss. */
  back?: boolean;
  /** Length of one turn, in widths. */
  pitch?: number;
}

/**
 * One spiral ringlet (a defined clump of curls) along its centre line: the turns bulge out
 * alternately on both sides and are separated by slanted dark creases; each turn has a shadow above
 * the crease below it and a glossy highlight arc across its crest. The tip is round, the lock tapers.
 */
function ringletSvg(ctx: Ctx, fills: { fill: string; shade: string }, r: Ringlet): string {
  const { g } = ctx;
  const turns = Math.max(1, evenCurve(r.ctrl, 8).len / (r.w * (r.pitch ?? 1.2)));
  const n = Math.max(10, Math.round(turns * 6));
  const c = evenCurve(r.ctrl, n).pts;
  const tan = c.map((_, i) => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const half = (t: number): number => (r.w / 2) * (1 - 0.42 * Math.pow(t, 1.3)) * (0.84 + 0.16 * smooth(0, 0.15, t));
  const fr = (v: number): number => v - Math.floor(v);
  // the turns bulge out between the creases; a crease meets the two edges at different heights (slant)
  const lobe = (t: number, a: number): number => Math.pow(Math.sin(Math.PI * fr(turns * t - r.phase - r.hand * a * 0.22)), 0.8);
  const env = (t: number): number => smooth(0.02, 0.16, t);
  const edgeAt = (t: number, side: number): number => half(t) * (0.84 + 0.36 * env(t) * lobe(t, side));
  // the lock zigzags a little towards the side that bulges: an S-shaped spiral, not a straight rope
  const sway = (t: number): number => r.w * 0.17 * env(t) * Math.sin(2 * Math.PI * (turns * t - r.phase - r.hand * 0.22 - 0.25));
  /** A point across the lock at t (0 = root .. 1 = tip): a = +1 and -1 are its two edges. */
  const at = (t: number, a: number): Pt => {
    const f = clamp(t, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(f)), k = f - i;
    const x = lerp(c[i].x, c[i + 1].x, k), y = lerp(c[i].y, c[i + 1].y, k);
    const tx = lerp(tan[i].x, tan[i + 1].x, k), ty = lerp(tan[i].y, tan[i + 1].y, k);
    const e = edgeAt(t, a >= 0 ? 1 : -1) * a + sway(t);
    return { x: x - ty * e, y: y + tx * e };
  };
  const A: Pt[] = [], B: Pt[] = [];
  for (let i = 0; i <= n; i++) { A.push(at(i / n, 1)); B.push(at(i / n, -1)); }
  const te = c[n], tt = tan[n], hE = half(1) * 0.85;
  const nx = -tt.y, ny = tt.x;
  const tip: Pt[] = [
    { x: te.x + tt.x * hE * 0.6 + nx * hE * 0.72, y: te.y + tt.y * hE * 0.6 + ny * hE * 0.72 },
    { x: te.x + tt.x * hE * 1.0, y: te.y + tt.y * hE * 1.0 },
    { x: te.x + tt.x * hE * 0.6 - nx * hE * 0.72, y: te.y + tt.y * hE * 0.6 - ny * hE * 0.72 },
  ];
  const t0 = tan[0];
  const root: Pt = { x: c[0].x - t0.x * half(0) * 0.5, y: c[0].y - t0.y * half(0) * 0.5 };
  const d = compactPath([...A, ...tip, ...B.reverse(), root], true);
  // creases, the shadow above each crease and the gloss on each crest, all following the slant
  let crease = '', shadow = '', gloss = '';
  for (let k = -1; k <= Math.ceil(turns) + 1; k++) {
    const tsOf = (as: number[], off: number): number[] => as.map((a) => (k + r.phase + r.hand * a * 0.22 + (1 - a * a) * 0.16 + off) / turns);
    const line = (as: number[], off: number, scale: number, lo: number): string => {
      const ts = tsOf(as, off);
      if (Math.min(...ts) < lo || Math.max(...ts) > 0.97) return '';
      return compactPath(as.map((a, i) => at(ts[i], a * scale)), false);
    };
    crease += line([1, 0.5, 0, -0.5, -1], 0, 0.84, 0.08);
    shadow += line([1, 0.4, -0.2, -0.8], -0.16, 0.6, 0.1);
    // the gloss: a slim crescent across the crest of the turn, widest in its middle, on the lit side
    const big = hash(k * 2.7 + r.phase * 9) * 0.5 + 0.5;
    const as = [0.9, 0.62, 0.3, 0.0, -0.3 * big];
    const th = as.map((_, i) => (i === 0 || i === as.length - 1 ? 0 : 0.07 * big));
    const ts = tsOf(as, -0.55);
    if (Math.min(...ts) > 0.06 && Math.max(...ts) < 0.95) {
      const up = as.map((a, i) => at(ts[i] - th[i] / turns, a * 0.82));
      const lo = as.map((a, i) => at(ts[i] + th[i] / turns, a * 0.82)).slice(1, -1).reverse();
      gloss += compactPath([...up, ...lo], true);
    }
  }
  // the shaded side of the lock (light comes from the upper left)
  const sideLine: Pt[] = [];
  for (let i = 1; i < n; i += 2) sideLine.push(at(i / n, -0.62));
  shadow += compactPath(sideLine, false);
  const deep = darken(ctx.hairShade, 0.16);
  const lit = c[Math.round(n * 0.3)].x < 0 ? 1 : 0.7;
  const shine = mix(lighten(ctx.p.hairColor, 0.3), ctx.hairRim, 0.35);
  return (
    path(d, { fill: fills.fill, stroke: ctx.hairLine, 'stroke-width': g.lw * 0.9, 'stroke-opacity': 0.55, 'stroke-linejoin': 'round' }) +
    (r.back ? path(d, { fill: deep, opacity: 0.35 }) : '') +
    stroke(ctx, shadow, deep, r.w * 0.22, { opacity: r.back ? 0.32 : 0.28 }) +
    (crease ? stroke(ctx, crease, deep, r.w * 0.075, { opacity: 0.75 }) : '') +
    (gloss ? path(gloss, { fill: shine, opacity: (r.back ? 0.5 : 0.85) * lit }) : '')
  );
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

/** A few loose single curls springing out of the outline (thin spirals, behind the mass). */
function strayCurls(ctx: Ctx, fills: { fill: string; shade: string }, edge: Pt[], salt: number, every: number): string {
  const { g } = ctx;
  const u = g.u;
  const cy = g.yTop + u * 0.6;
  const list: Shifted[] = [];
  edge.forEach((P, i) => {
    if (i < 2 || i > edge.length - 3 || hash(i * 3.7 + salt) > every) return;
    const nx0 = P.x, ny0 = P.y - cy;
    const l = Math.hypot(nx0, ny0) || 1;
    const d = u * (0.07 + 0.06 * hash(i * 1.1 + salt));
    list.push(curlArcs(P.x + (nx0 / l) * d * 0.45, P.y + (ny0 / l) * d * 0.45, d, hash(i * 4.4 + salt) < 0.6 ? 0 : 1, Math.atan2(ny0, nx0) + (hash(i * 9.1 + salt) - 0.5) * 2, hash(i * 2.2 + salt) < 0.5 ? 1 : -1));
  });
  return ringletStrokes(ctx, fills, list, Math.max(0.8, u * 0.016));
}

/** Curly hair behind the head and shoulders: a shadowed underlayer with ringlets hanging from it. */
function curlsBack(ctx: Ctx, fills: { fill: string; shade: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }): string {
  const { g } = ctx;
  const u = g.u, hw = g.hw;
  const m = metrics(ctx);
  const yEnd = curlEnd(ctx);
  // the underlayer ends above the ringlet tips, so the ends hang as separate ringlets
  const yMass = yEnd - Math.min(u * 0.34, (yEnd - m.yc) * 0.32);
  const sides = curlSides(ctx, yMass, hw * 0.16);
  const wl = -sides[0].x, wr = sides[sides.length - 1].x;
  const bottom: Pt[] = [];
  for (let i = 0; i <= 6; i++) bottom.push({ x: lerp(wr, -wl, i / 6), y: i === 0 || i === 6 ? yMass : yMass + u * (0.02 + 0.06 * hash(i * 2.3 + 5)) });
  const sb = bumps(sides, u * 0.2, 1, 0.66);
  const bb = bumps(bottom, u * 0.22, 7, 0.66);
  const d = M(sides[0].x, sides[0].y) + sb.d + bb.d + 'Z';
  const deep = darken(ctx.hairShade, 0.1);
  const faceShadow = path(ctx.faceD, { fill: darken(deep, 0.1), stroke: darken(deep, 0.1), 'stroke-width': u * 0.12, 'stroke-linejoin': 'round', opacity: 0.6, transform: `translate(0 ${u * 0.04})` });
  let out = strayCurls(ctx, fills, sb.pts, 3, 0.35);
  out += cel(ctx, d, deep, { ...opts, shadeColor: darken(deep, 0.12), inside: lightSide(ctx) + faceShadow });
  // ringlets hanging from all around the head, from the nape (furthest back) to the outer sides
  const N = 6;
  for (let i = 0; i < N; i++) {
    for (const s of [-1, 1] as const) {
      const f = i / (N - 1);
      const h = (a: number): number => hash(i * a + (s > 0 ? 11 : 3));
      const R: Pt = { x: s * hw * lerp(0.45, 1.2, f), y: g.yTop + u * lerp(0.2, 0.5, f) };
      const ye = Math.max(R.y + u * 0.45, yEnd - u * (0.02 + 0.16 * h(2.3)));
      const xe = s * curlHalf(ctx, ye) * lerp(0.3, 0.9, f) + (h(5.1) - 0.5) * hw * 0.16;
      const ym = lerp(R.y, ye, 0.45);
      const xm = s * curlHalf(ctx, ym) * lerp(0.5, 0.86, f);
      out += ringletSvg(ctx, fills, { ctrl: [R, { x: xm, y: ym }, { x: xe, y: ye }], w: hw * (0.3 + 0.18 * h(1.7)), hand: s, phase: h(3.7), back: f < 0.5, pitch: 1.05 + 0.35 * h(6.1) });
    }
  }
  return out;
}

/**
 * Curly hair in front: a dark cap over the head, crown ringlets falling outwards from the part,
 * curls over the forehead, ringlets framing the face, and a loose curl at each temple.
 */
function curlsFront(ctx: Ctx, fills: { fill: string; shade: string }, m: HairMetrics): string {
  const { g, p } = ctx;
  const u = g.u, hw = g.hw;
  const yEnd = curlEnd(ctx);
  const hl = curlHairline(ctx);
  const px = hl.px;
  const xs = hw * 0.9;
  const ySide = Math.max(hl.hy(xs), hl.hy(-xs), g.yTop + u * 0.42);
  const sides = curlSides(ctx, ySide, hw * 0.12);
  const hair: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = lerp(xs, -xs, i / 10);
    hair.push({ x, y: hl.hy(x) });
  }
  const sb = bumps(sides, u * 0.18, 5, 0.64);
  const hb = bumps(hair, u * 0.15, 21, 0.6);
  const d = M(sides[0].x, sides[0].y) + sb.d + L(hair[0].x, hair[0].y) + hb.d + 'Z';
  const deep = darken(ctx.hairShade, 0.06);
  let out = '';
  // the hairline softly shades the forehead
  const hairlineD = M(hair[0].x, hair[0].y) + hb.d;
  out += group(
    path(hairlineD + L(-xs, hl.hy(-xs) - u * 0.3) + L(xs, hl.hy(xs) - u * 0.3) + 'Z', { fill: mix(ctx.skinShade, '#a0606e', 0.45), opacity: 0.6, transform: `translate(${hw * 0.02} ${u * 0.06})`, filter: `url(#${ctx.soft})` }),
    { 'clip-path': `url(#${ctx.faceClip})` },
  );
  out += strayCurls(ctx, fills, sb.pts, 17, 0.3);
  out += cel(ctx, d, deep, { line: ctx.hairLine, shadeColor: darken(deep, 0.1), dx: -g.lw * 2.4, dy: -g.lw * 1.3, inside: lightSide(ctx) });
  const rings: Ringlet[] = [];
  // crown: ringlets from the part falling outwards over the dome, the outer ones lowest
  for (const s of [-1, 1] as const) {
    for (let j = 3; j >= 0; j--) {
      const h = (a: number): number => hash(j * a + (s > 0 ? 7 : 2));
      const R: Pt = { x: px + s * hw * (0.06 + 0.2 * j), y: g.yTop - u * 0.01 + u * 0.05 * j };
      const yE = g.yTop + u * (0.0 + 0.15 * j + 0.05 * h(1.3));
      const E: Pt = { x: s * (curlHalf(ctx, yE) - hw * (0.04 + 0.06 * h(2.7))), y: yE };
      const Mid: Pt = { x: lerp(R.x, E.x, 0.5), y: lerp(R.y, E.y, 0.5) - u * (0.1 - 0.02 * j) };
      rings.push({ ctrl: [R, Mid, E], w: hw * (0.32 + 0.16 * h(3.1)), hand: s, phase: h(4.3), pitch: 0.9 + 0.3 * h(5.9) });
    }
  }
  // ringlets framing the face (outer ones first) and falling over the shoulders
  const face = (y: number): number => faceHalfWidthAt(g, p.faceShape, Math.min(y, g.yChin));
  for (const s of [-1, 1] as const) {
    const h = (a: number): number => hash(a + (s > 0 ? 5 : 1));
    const y3 = g.yTop + u * 0.44;
    rings.push({ ctrl: [{ x: s * hw * 1.3, y: y3 }, { x: s * hw * 1.42, y: lerp(y3, yEnd, 0.5) }, { x: s * curlHalf(ctx, yEnd) * 0.86, y: yEnd + u * 0.02 }], w: hw * 0.4, hand: s, phase: h(1.1) });
    const y2 = g.yTop + u * 0.32;
    const e2 = yEnd - u * (0.04 + 0.08 * h(2.2));
    rings.push({ ctrl: [{ x: s * hw * 1.1, y: y2 }, { x: s * hw * 1.2, y: lerp(y2, e2, 0.45) }, { x: s * hw * 1.18, y: e2 }], w: hw * 0.38, hand: -s as 1 | -1, phase: h(3.3) });
  }
  const forehead: number[] = [-0.78, -0.45, -0.12, 0.2, 0.5, 0.8];
  forehead.forEach((fx, i) => {
    const x = fx * xs;
    const s = x < px ? -1 : 1;
    const h = (a: number): number => hash(i * a + 13);
    const E: Pt = { x: x + s * hw * 0.04, y: hl.hy(x) + u * (0.04 + 0.07 * h(1.9)) };
    const R: Pt = { x: px + (x - px) * 0.55, y: g.yTop + u * 0.02 };
    const Mid: Pt = { x: lerp(R.x, E.x, 0.55) + s * hw * 0.08, y: lerp(R.y, E.y, 0.5) - u * 0.02 };
    rings.push({ ctrl: [R, Mid, E], w: hw * (0.26 + 0.16 * h(2.9)), hand: s as 1 | -1, phase: h(3.7), pitch: 0.95 + 0.3 * h(4.9) });
  });
  for (const s of [-1, 1] as const) {
    const h = (a: number): number => hash(a + (s > 0 ? 9 : 4));
    const R: Pt = { x: s * xs * 0.98, y: hl.hy(s * xs) - u * 0.06 };
    const yA = g.yTop + u * 0.62;
    const e1 = Math.max(yA + u * 0.2, lerp(g.yChin, yEnd, 0.55) - u * 0.06 * h(1.3));
    rings.push({
      ctrl: [R, { x: s * (face(yA) + hw * 0.05), y: yA }, { x: s * (Math.max(face(e1), hw * 0.62) + hw * 0.14), y: e1 }],
      w: hw * 0.32, hand: s, phase: h(2.1),
    });
  }
  out += rings.map((r) => ringletSvg(ctx, fills, r)).join('');
  void m;
  return out;
}

// ---- dreadlocks ---------------------------------------------------------------------------------

/** The gold gradient of the cuffs: bright on the lit left, deep at the turned-away edges (shared by all cuffs). */
function goldDefs(id: string): string {
  return (
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#8a5c12"/><stop offset="0.22" stop-color="#ffe9a0"/><stop offset="0.42" stop-color="#f3c54e"/>` +
    `<stop offset="0.78" stop-color="#c08a22"/><stop offset="1" stop-color="#6e4a0e"/></linearGradient>`
  );
}

/**
 * A gold cuff wrapped around a lock, drawn upright at (cx, cy) for a lock running downwards (the caller
 * turns it along the lock): a band a little wider than the lock, its rims curved like the front of a
 * ring, with an engraved groove, the far rim peeking out above, and a small highlight.
 */
function goldCuff(ctx: Ctx, cx: number, cy: number, halfW: number, gid: string): string {
  const { g } = ctx;
  const bw = halfW * 1.2, bh = halfW * 1.3, sag = bw * 0.26;
  const t = cy - bh / 2, b = cy + bh / 2;
  const band =
    M(cx - bw, t) + Q(cx, t + sag * 2, cx + bw, t) + L(cx + bw * 1.01, b) + Q(cx, b + sag * 2, cx - bw * 1.01, b) + 'Z';
  const far = `${M(cx - bw * 0.96, t + sag * 0.05)}${Q(cx, t - sag * 1.1, cx + bw * 0.96, t + sag * 0.05)}`;
  const groove = `${M(cx - bw * 0.98, cy - bh * 0.02)}${Q(cx, cy + sag * 1.96, cx + bw * 0.98, cy - bh * 0.02)}`;
  const hi = `${M(cx - bw * 0.56, t + sag * 0.95 + bh * 0.12)}${Q(cx - bw * 0.58, cy, cx - bw * 0.52, cy + bh * 0.22)}`;
  return (
    stroke(ctx, far, '#7a5210', g.lw * 1.1, { opacity: 0.8 }) +
    path(band, { fill: `url(#${gid})`, stroke: '#7a5210', 'stroke-width': g.lw * 0.8, 'stroke-linejoin': 'round' }) +
    stroke(ctx, groove, '#9a6a16', g.lw * 0.7, { opacity: 0.8 }) +
    stroke(ctx, hi, '#fffbe8', g.lw * 0.75, { opacity: 0.85 })
  );
}

/**
 * A loose, hanging lock from `R` down to `E`: it keeps falling outwards a little (spread) and sways in a
 * gentle, uneven curve, so neighbouring locks are never parallel. `head` are fixed points after the root.
 */
function looseLock(R: Pt, head: Pt[], E: Pt, amp: number, seed: number): Pt[] {
  const S = head.length ? head[head.length - 1] : R;
  const pts: Pt[] = [R, ...head];
  const waves = 0.8 + 0.7 * hash(seed * 1.3);
  const ph = hash(seed * 2.9) * Math.PI * 2;
  for (const t of [0.3, 0.55, 0.8, 1]) {
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15));
    pts.push({ x: lerp(S.x, E.x, Math.pow(t, 1.15)) + amp * env * Math.sin(t * Math.PI * waves + ph), y: lerp(S.y, E.y, t) });
  }
  return pts;
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
 * root, rounded at the tip, with subtle twist marks and a lit and a shaded edge. A gold cuff wraps it
 * at `o.ring` (0 = root .. 1 = tip) when given.
 */
function ropeSvg(ctx: Ctx, fills: { fill: string; shade: string }, ctrl: Pt[], o: { w: number; taper: number; phase: number; ring?: number; gold?: string }, opts: { line: string; shadeColor: string; dx: number; dy: number }, rings?: string[]): string {
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
  if (o.ring !== undefined && o.gold) {
    const i = Math.round(clamp(o.ring, 0, 1) * N);
    const deg = (Math.atan2(tan[i].y, tan[i].x) * 180) / Math.PI - 90;
    const ring = group(goldCuff(ctx, c[i].x, c[i].y, hwAt(i), o.gold), { transform: `rotate(${deg.toFixed(1)} ${c[i].x.toFixed(1)} ${c[i].y.toFixed(1)})` });
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
    const s = f < 0 ? -1 : 1;
    // the ends spread out a little (the outer locks most) and every lock sways in its own gentle curve
    const E: Pt = { x: f * hw * (1.02 + 0.12 * h(4.1)) + s * hw * 0.22 * (Math.abs(f) - 0.7), y: Math.max(y1, m.yc + u * 0.6) };
    const ctrl = looseLock({ x: f * hw * 0.55, y: m.yc - u * 0.22 }, [{ x: f * hw * 0.92, y: m.yc + u * 0.12 }], E, hw * (0.08 + 0.1 * h(5.3)), i * 1.7 + 3);
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
  const gold = ctx.uid('gold');
  out += goldDefs(gold);
  const rings: string[] = [];
  const hang: Array<{ s: -1 | 1; x: number; end: number; ring?: number; w: number; xm: number; xe: number }> = [];
  for (const s of [-1, 1] as const) {
    hang.push({ s, x: 0.86, end: endY - u * (s > 0 ? 0.08 : 0), ring: s > 0 ? 0.66 : 0.6, w: 0.27, xm: 1.05, xe: 1.2 });
    hang.push({ s, x: 0.72, end: lerp(g.yChin, endY, s > 0 ? 0.5 : 0.4), ring: s > 0 ? 0.5 : 0.56, w: 0.24, xm: 0.98, xe: 0.86 });
    hang.push({ s, x: 0.94, end: g.yChin + u * (s > 0 ? 0.22 : 0.12), w: 0.22, xm: 1.1, xe: 1.3 });
  }
  hang.forEach((h, i) => {
    const s = h.s;
    const yA = g.yTop + u * 0.58;
    const ctrl = looseLock({ x: s * h.x * hw, y: hy(xs) - u * 0.05 }, [{ x: s * hw * h.xm, y: yA }], { x: s * hw * h.xe, y: h.end }, hw * (0.1 + 0.08 * hash(i * 3.3)), i * 2.3 + 1);
    out += ropeSvg(ctx, fills, ctrl, { w: hw * h.w, taper: 0.45, phase: i * 1.9 + 4, ring: h.ring, gold }, opts, rings);
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

/** Tufts of the pixie top, walking from the right temple to the left one: [share of the arc, height in head heights]. */
const PIXIE_TUFTS: ReadonlyArray<readonly [number, number]> = [
  [1.7, 0], [0.9, 0.03], [1.4, 0.075], [0.6, 0.035], [1.8, 0.1], [0.7, 0.05], [1.2, 0.085], [0.8, 0.045], [1.0, 0.06], [0.7, 0.028], [1.5, 0],
];

interface PixieTuft { base: Pt; tip: Pt; end: Pt; h: number }

/**
 * The top outline of the pixie cut, from the right temple over the crown to the left one: irregular,
 * feathered tufts of different sizes, all swept forward to the right (each leans over its right foot,
 * with a long soft back slope), tallest on top and almost flat at the short sides.
 */
function pixieTufts(ctx: Ctx, m: HairMetrics): { d: string; tufts: PixieTuft[] } {
  const { g } = ctx;
  const u = g.u;
  const K = 60;
  const arc = skullArc(g, m.rx, m.yc, m.vTop + u * 0.04, 0, Math.PI, K);
  const total = PIXIE_TUFTS.reduce((a, t) => a + t[0], 0);
  const ry = m.yc - (g.yTop - m.vTop - u * 0.04);
  const at = (f: number): Pt => arc[clamp(Math.round(f * K), 0, K)];
  const out = (q: Pt): Pt => {
    const ox = q.x / (m.rx || 1), oy = (q.y - m.yc) / Math.max(1, ry);
    const l = Math.hypot(ox, oy) || 1;
    return { x: ox / l, y: oy / l };
  };
  let d = '';
  let acc = 0;
  const tufts: PixieTuft[] = [];
  PIXIE_TUFTS.forEach(([w, h0], i) => {
    const f0 = acc / total, f1 = (acc + w) / total;
    acc += w;
    const P0 = at(f0);
    // the foot between two tufts dips in a little, so every tuft reads as its own piece
    const n1 = out(at(f1));
    const dip = i === PIXIE_TUFTS.length - 1 || PIXIE_TUFTS[i + 1][1] === 0 ? 0 : u * 0.012;
    const P1: Pt = { x: at(f1).x - n1.x * dip, y: at(f1).y - n1.y * dip };
    if (h0 === 0) {
      // the short sides: smooth and close to the head
      d += smoothOpen(arc.slice(Math.round(f0 * K), Math.round(f1 * K) + 1), 1 / 6, false);
      return;
    }
    const h = u * h0 * (0.9 + 0.2 * hash(i * 3.1 + 4));
    const fm = f0 + (f1 - f0) * 0.32;
    const Pm = at(fm);
    const n = out(Pm);
    // along the head towards the right temple: the sweep (forward and to the right) follows the skull
    const a = at(fm - 0.03), b = at(fm + 0.03);
    const tl = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const tx = (a.x - b.x) / tl, ty = (a.y - b.y) / tl;
    const tip: Pt = { x: Pm.x + n.x * h + tx * h * 0.75, y: Pm.y + n.y * h + ty * h * 0.75 };
    const back = at(f0 + (f1 - f0) * 0.64);
    const nb = out(back);
    const r0: Pt = { x: tip.x - tx * h * 0.32 + n.x * h * 0.02, y: tip.y - ty * h * 0.32 + n.y * h * 0.02 };
    d +=
      C(P0.x + n.x * h * 0.5, P0.y + n.y * h * 0.5, tip.x - n.x * h * 0.3 + tx * h * 0.05, tip.y - n.y * h * 0.3 + ty * h * 0.05, tip.x, tip.y) +
      // a soft point, then the back slope down to the next foot
      Q(tip.x + n.x * h * 0.08 - tx * h * 0.1, tip.y + n.y * h * 0.08 - ty * h * 0.1, r0.x, r0.y);
    if (h0 >= 0.07) {
      // big pieces are feathered: a smaller point sits on their back slope
      const S: Pt = { x: back.x + nb.x * h * 0.5 + tx * h * 0.35, y: back.y + nb.y * h * 0.5 + ty * h * 0.35 };
      d +=
        C(lerp(r0.x, S.x, 0.5) + nb.x * h * 0.12, lerp(r0.y, S.y, 0.5) + nb.y * h * 0.12, S.x - nb.x * h * 0.12, S.y - nb.y * h * 0.12, S.x, S.y) +
        C(S.x - tx * h * 0.2, S.y - ty * h * 0.2, P1.x + n1.x * h * 0.25, P1.y + n1.y * h * 0.25, P1.x, P1.y);
    } else {
      d += C(back.x + nb.x * h * 0.75, back.y + nb.y * h * 0.75, P1.x + n1.x * h * 0.3, P1.y + n1.y * h * 0.3, P1.x, P1.y);
    }
    tufts.push({ base: Pm, tip, end: P1, h });
  });
  return { d, tufts };
}

/**
 * Inside the pixie cut: layered, piecey strands. Every tuft gets a light strand along its lit back slope
 * and a dark crease under its tip; finer texture lines sweep forward over the top and the sides.
 */
function pixieSlivers(ctx: Ctx, m: HairMetrics, tips: Pt[]): string {
  const { g } = ctx;
  const u = g.u;
  const sorted = tips.slice().sort((a, b) => a.x - b.x);
  const { tufts } = pixieTufts(ctx, m);
  const centre: Pt = { x: -m.rx * 0.1, y: g.yTop + u * 0.38 };
  let lit = '', dark = '', fine = '';
  tufts.forEach((t, i) => {
    if (t.h < u * 0.02) return;
    // a light piece along each tuft (from inside the hair out to just below its tip) ...
    const into = (q: Pt, k: number): Pt => ({ x: lerp(q.x, centre.x, k), y: lerp(q.y, centre.y, k) });
    lit += wispD(into(t.tip, 0.3), { x: lerp(t.tip.x, t.end.x, 0.25), y: lerp(t.tip.y, t.end.y, 0.25) + u * 0.01 }, u * 0.01, u * (0.016 + 0.01 * hash(i * 2.3)));
    // ... and a dark crease from the notch after it, where the next piece lies over it
    dark += wispD(into(t.end, 0.24), { x: t.end.x, y: t.end.y + u * 0.004 }, -u * 0.008, u * 0.012);
  });
  // texture lines: from the crown forward and to the right, ending above the fringe tips
  const n = 16;
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5 + (hash(k * 3.3) - 0.5) * 0.7) / n;
    const x = lerp(-m.rx * 0.9, m.rx * 0.8, f);
    const b: Pt = { x, y: g.yTop + u * (0.0 + 0.06 * hash(k * 1.9)) + u * 0.08 * Math.pow(Math.abs(f - 0.5) * 2, 2) };
    const len = u * (0.12 + 0.1 * hash(k * 5.1));
    let e: Pt = { x: b.x + len * 0.55, y: b.y + len * 0.85 };
    const lim = polyY(sorted, e.x) - u * 0.03;
    if (e.y > lim) e = { x: b.x + (lim - b.y) * 0.65, y: lim };
    if (e.y - b.y < u * 0.05) continue;
    fine += `${M(b.x, b.y)}${Q(b.x + len * 0.12, lerp(b.y, e.y, 0.55), e.x, e.y)}`;
  }
  return (
    path(dark, { fill: darken(ctx.hairShade, 0.1), opacity: 0.45 }) +
    path(lit, { fill: ctx.hairLight, opacity: 0.6 }) +
    stroke(ctx, fine, darken(ctx.hairShade, 0.05), Math.max(0.4, g.lw * 0.55), { opacity: 0.35 })
  );
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
