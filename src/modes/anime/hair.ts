import { lighten, mix, shade } from '../../core/color';
import { C, M, Q, clamp, ellipse, group, lerp, path, smoothOpen, type Pt } from '../../core/svg';
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

const isLong = (p: AnimeParams): boolean => p.hairBack === 'long' || p.hairBack === 'wavy';

/** Lowest y reached by the hair at the back (used for the colour gradient and clamping). */
function hairEnd(ctx: Ctx): number {
  const { g, p } = ctx;
  const L01 = p.hairLength / 100;
  switch (p.hairBack) {
    case 'short': return g.yTop + g.u * 0.82;
    case 'bob': return g.yChin + g.u * 0.13;
    case 'long':
    case 'wavy': return Math.min(-14, g.yShoulder + g.torsoLen * lerp(0.1, 1.0, L01));
    case 'ponytail': return Math.min(-14, g.yTop + g.u * lerp(0.9, 2.4, L01));
    case 'twintails': return Math.min(-14, g.yTop + g.u * lerp(0.95, 2.3, L01));
    case 'buns': return g.yTop + g.u * 0.82;
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

function backMass(ctx: Ctx): { d: string } {
  const { g, p } = ctx;
  const m = metrics(ctx);
  const hw = g.hw;
  const style = p.hairBack;
  const yEnd = hairEnd(ctx);
  let wTop = hw * 1.14;
  let wEnd = hw * 1.05;
  let nTips = 6;
  let wave = 0;
  let inward = 0;
  if (style === 'bob') { wTop = hw * 1.2; wEnd = hw * 1.12; inward = hw * 0.08; }
  if (isLong(p)) {
    wTop = hw * 1.16;
    wEnd = Math.max(hw * 1.1, g.shHW * 0.95);
    nTips = 7;
    if (style === 'wavy') wave = hw * 0.1;
  }
  if (style === 'short' || style === 'buns' || style === 'ponytail' || style === 'twintails') { wTop = hw * 1.12; wEnd = hw * 1.0; nTips = 5; }

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
    const bump = (i % 2 === 0 ? 0 : -g.u * 0.045) + (wave ? Math.sin(f * 6) * g.u * 0.03 : 0);
    const edgeIn = Math.sin(f * Math.PI);
    tips.push({ x: x * (1 - inward / Math.max(1, Math.abs(wb)) * (1 - edgeIn)), y: yEnd + bump + (1 - edgeIn) * g.u * 0.02 });
  }
  tips[0] = left[left.length - 1];
  tips[tips.length - 1] = { x: -left[left.length - 1].x, y: left[left.length - 1].y };

  const arcTop = skullArc(g, m.rx, m.yc, m.vTop, 0, Math.PI, 12);
  const d =
    M(left[0].x, left[0].y) + smoothOpen([...left.slice(0, -1), tips[0]], 1 / 6, false) +
    locks(tips, g.u * 0.08, true) +
    smoothOpen([tips[tips.length - 1], ...right.slice(1)], 1 / 6, false) +
    smoothOpen(arcTop, 1 / 6, false) + 'Z';
  return { d };
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
    out += cel(ctx, tailPath(ctx, 1, t, endY, 0.72), fills.fill, opts);
    out += tie(t.x + hw * 0.02, t.y + g.u * 0.01, hw * 0.2, g.u * 0.045, -25);
  } else if (p.hairBack === 'twintails') {
    const endY = hairEnd(ctx);
    for (const s of [-1, 1] as const) {
      const t: Pt = { x: s * hw * 0.9, y: g.yTop + g.u * 0.22 };
      out += cel(ctx, tailPath(ctx, s, t, endY, lerp(0.45, 0.65, L01)), fills.fill, opts);
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

  const { d } = backMass(ctx);
  const faceShadow = path(ctx.faceD, {
    fill: mix(ctx.hairShade, '#000000', 0.12),
    stroke: mix(ctx.hairShade, '#000000', 0.12),
    'stroke-width': g.u * 0.1,
    'stroke-linejoin': 'round',
    opacity: 0.55,
    transform: `translate(0 ${g.u * 0.045})`,
  });
  out += cel(ctx, d, fills.fill, { ...opts, inside: faceShadow });
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
    case 'curtain':
      return { tips: [P(-0.7, 0.48), P(-0.5, 0.42), P(-0.3, 0.3), P(-0.1, 0.17), P(0.1, 0.17), P(0.3, 0.3), P(0.5, 0.42), P(0.7, 0.48)], crown: 0 };
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
  const { tips, crown } = bangTips(ctx);
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
    locks(tips, u * 0.09, true) +
    rInner + rOuter +
    smoothOpen(arcR, 1 / 6, false) + 'Z';

  // texture strands from the crown to the tips
  let strands = '';
  const crownX = crown * hw;
  for (let i = 1; i < tips.length - 1; i++) {
    const tp = tips[i];
    strands += stroke(ctx, `${M(crownX * 0.9 + (tp.x - crownX) * 0.12, g.yTop - u * 0.02)}${Q(crownX + (tp.x - crownX) * 0.9, g.yTop + (tp.y - g.yTop) * 0.35, tp.x * 0.98, tp.y - u * 0.045)}`, ctx.hairShade, Math.max(0.7, g.lw * 0.7), { opacity: 0.5 });
  }
  // angel ring highlight
  const ring = stroke(ctx, `${M(-m.rx * 0.78, m.yc - u * 0.1)}${Q(0, g.yTop - u * 0.02, m.rx * 0.78, m.yc - u * 0.1)}`, ctx.hairLight, u * 0.075, { opacity: 0.4 });
  const ring2 = stroke(ctx, `${M(-m.rx * 0.5, m.yc - u * 0.16)}${Q(-m.rx * 0.1, g.yTop + u * 0.02, m.rx * 0.2, g.yTop + u * 0.03)}`, '#ffffff', u * 0.022, { opacity: 0.35 });

  let out = fills.defs;
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
    path(d, { fill: mix(ctx.skinShade, '#b07a8a', 0.4), opacity: 0.5, transform: `translate(0 ${u * 0.05})` }),
    { 'clip-path': `url(#${ctx.faceClip})` },
  );
  out += cel(ctx, d, fills.fill, {
    line: ctx.hairLine, shadeColor: fills.shade, dx: -g.lw * 2.4, dy: -g.lw * 1.3,
    inside: strands + ring + ring2,
  });
  return out;
}
