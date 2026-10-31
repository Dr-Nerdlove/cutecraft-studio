import { darken, hueShift, lighten, mix } from '../../core/color';
import { circle, ellipse, heartPath, path, starPath } from '../../core/svg';
import type { Ctx } from './context';
import { GROUND_Y, VIEW_H, VIEW_W, portraitBox } from './geometry';

/** Deterministic pseudo-random number in 0..1. */
const hash = (i: number): number => {
  const x = Math.sin(i * 91.345 + 12.17) * 24634.6345;
  return x - Math.floor(x);
};

/**
 * Mood background like a painted portrait: warm light from the upper left and soft, out-of-focus
 * lights. Most lights sit around the head, so the portrait view gets them too.
 */
function bokehSvg(ctx: Ctx): string {
  const { p } = ctx;
  const bg = p.bgColor;
  const box = portraitBox(ctx.g);
  const base = ctx.uid('bkb');
  const warm = ctx.uid('bkw');
  const blur = ctx.uid('bkf');
  let out =
    `<defs><linearGradient id="${base}" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${mix(bg, '#ffe2c4', 0.3)}"/>` +
    `<stop offset="1" stop-color="${darken(mix(bg, '#4a3a5a', 0.3), 0.06)}"/></linearGradient>` +
    `<radialGradient id="${warm}"><stop offset="0" stop-color="#fff0d8" stop-opacity="0.85"/><stop offset="1" stop-color="#ffe0b8" stop-opacity="0"/></radialGradient>` +
    `<filter id="${blur}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(box.w * 0.008).toFixed(2)}"/></filter></defs>` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#${base})"/>` +
    ellipse(box.x + box.w * 0.1, box.y + box.h * 0.12, box.w * 0.8, box.h * 0.55, { fill: `url(#${warm})` });
  const colors = ['#ffffff', '#ffe2b0', lighten(hueShift(bg, 20), 0.12), '#ffd0d8'];
  let lights = '';
  for (let i = 0; i < 26; i++) {
    const inPortrait = i < 16;
    const x = inPortrait ? box.x + hash(i) * box.w : hash(i) * VIEW_W;
    const y = inPortrait ? box.y + hash(i + 50) * box.h * 0.85 : hash(i + 50) * VIEW_H * 0.8;
    const r = (inPortrait ? box.w : VIEW_W * 0.6) * (0.025 + 0.06 * hash(i + 100));
    lights += circle(x, y, r, { fill: colors[i % colors.length], opacity: (0.2 + 0.35 * hash(i + 150)).toFixed(2) });
  }
  out += `<g filter="url(#${blur})">${lights}</g>`;
  out += ellipse(VIEW_W / 2, GROUND_Y + 2, 175, 26, { fill: '#ffffff', opacity: 0.25 });
  return out;
}

/** A soft cloud: a few overlapping ellipses (drawn inside the blurred group). */
function cloud(x: number, y: number, w: number, fill: string, opacity: number): string {
  return (
    ellipse(x, y, w * 0.5, w * 0.1, { fill, opacity }) +
    ellipse(x - w * 0.15, y - w * 0.05, w * 0.22, w * 0.08, { fill, opacity }) +
    ellipse(x + w * 0.12, y - w * 0.04, w * 0.18, w * 0.07, { fill, opacity })
  );
}

/**
 * Sunset: warm sky, low sun glow and blurred distant hills with a tree line. The horizon sits at
 * shoulder height of the portrait view, so the portrait shows sky, sun and hills; below it a dim
 * ground carries the figure in the full view.
 */
function sunsetSvg(ctx: Ctx): string {
  const { p } = ctx;
  const bg = p.bgColor;
  const box = portraitBox(ctx.g);
  const hy = Math.min(box.y + box.h * 0.56, GROUND_Y - 60); // horizon
  const sky = ctx.uid('ssk');
  const sun = ctx.uid('ssn');
  const grd = ctx.uid('sgr');
  const blur = ctx.uid('sbf');
  const top = darken(mix(bg, '#9a78c0', 0.5), 0.02);
  const mid = mix(bg, '#f6a8b0', 0.5);
  const low = mix(bg, '#ffcf8c', 0.6);
  const hillFar = mix(bg, '#8a5f9a', 0.7);
  const hillNear = darken(mix(bg, '#4e3566', 0.78), 0.03);
  const sunX = box.x + box.w * 0.13;
  const sunR = Math.max(box.w * 0.3, 55);
  const hh = Math.max(box.h, 240); // vertical scale of hills so the full view stays lively
  let out =
    `<defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="${((hy * 0.55) / VIEW_H).toFixed(3)}" stop-color="${mid}"/>` +
    `<stop offset="${(hy / VIEW_H).toFixed(3)}" stop-color="${low}"/><stop offset="1" stop-color="${low}"/></linearGradient>` +
    `<radialGradient id="${sun}"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="0.25" stop-color="#ffe0a0" stop-opacity="0.7"/>` +
    `<stop offset="1" stop-color="#ffb890" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${grd}" gradientUnits="userSpaceOnUse" x1="0" y1="${hy.toFixed(1)}" x2="0" y2="${GROUND_Y}"><stop offset="0" stop-color="${hillNear}"/><stop offset="1" stop-color="${mix(hillNear, low, 0.35)}"/></linearGradient>` +
    `<filter id="${blur}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(box.w * 0.012, 1.6).toFixed(2)}"/></filter></defs>` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#${sky})"/>` +
    ellipse(sunX, hy - box.h * 0.04, sunR * 1.5, sunR * 1.1, { fill: `url(#${sun})` });

  // Soft clouds, lit from below by the sun.
  const cl = mix(bg, '#ffc8c0', 0.7);
  const clHi = '#ffe2c8';
  let soft =
    cloud(box.x + box.w * 0.72, box.y + box.h * 0.2, box.w * 0.6, cl, 0.55) +
    cloud(box.x + box.w * 0.2, box.y + box.h * 0.38, box.w * 0.5, clHi, 0.5) +
    cloud(box.x + box.w * 0.86, box.y + box.h * 0.5, box.w * 0.45, clHi, 0.45) +
    cloud(box.x + box.w * 0.45, box.y + box.h * 0.1, box.w * 0.4, cl, 0.4);
  // Sun disc.
  soft += circle(sunX, hy - box.h * 0.035, Math.max(box.w * 0.07, 12), { fill: '#fff4d0', opacity: 0.95 });
  // Far hills, near hills and a tree line (all blurred silhouettes).
  const W = VIEW_W;
  const far =
    `M-20 ${hy + 6} C ${W * 0.15} ${hy - hh * 0.1}, ${W * 0.3} ${hy - hh * 0.02}, ${W * 0.5} ${hy - hh * 0.06} ` +
    `S ${W * 0.85} ${hy - hh * 0.1}, ${W + 20} ${hy - hh * 0.02} L${W + 20} ${VIEW_H} L-20 ${VIEW_H} Z`;
  soft += path(far, { fill: hillFar, opacity: 0.9 });
  for (let i = 0; i < 16; i++) {
    const tx = -10 + i * (W / 15) + (hash(i + 7) - 0.5) * 14;
    const th = hh * (0.035 + 0.04 * hash(i + 31));
    soft += ellipse(tx, hy + hh * 0.035, hh * 0.03, th, { fill: hillNear });
  }
  soft += path(
    `M-20 ${hy + hh * 0.04} C ${W * 0.2} ${hy - hh * 0.01}, ${W * 0.4} ${hy + hh * 0.05}, ${W * 0.6} ${hy + hh * 0.025} ` +
      `S ${W * 0.9} ${hy - hh * 0.01}, ${W + 20} ${hy + hh * 0.03} L${W + 20} ${VIEW_H} L-20 ${VIEW_H} Z`,
    { fill: `url(#${grd})` },
  );
  out += `<g filter="url(#${blur})">${soft}</g>`;
  // A glint of sunlight on the ground at the figure's feet.
  out += ellipse(VIEW_W / 2, GROUND_Y + 2, 175, 26, { fill: '#ffcf9c', opacity: 0.3 });
  return out;
}

/**
 * Window light: a room with a soft, out-of-focus window at the upper left, translucent light shafts
 * falling to the lower right (the figure is lit from the upper left too), a warm wall, a darker
 * corner on the right and a floor with a light patch.
 */
function windowSvg(ctx: Ctx): string {
  const { p } = ctx;
  const bg = p.bgColor;
  const box = portraitBox(ctx.g);
  const wall = ctx.uid('wwl');
  const corner = ctx.uid('wcn');
  const glow = ctx.uid('wgl');
  const beam = ctx.uid('wbm');
  const flr = ctx.uid('wfl');
  const blur = ctx.uid('wbf');
  const fy = GROUND_Y - 34; // wall meets floor
  const wallLit = mix(bg, '#fff0dc', 0.5);
  const wallDim = darken(mix(bg, '#8a6a70', 0.45), 0.05);
  const floorCol = darken(mix(bg, '#b98a62', 0.6), 0.04);
  const frame = darken(mix(bg, '#d8c0a8', 0.55), 0.08);
  const ww = Math.max(box.w * 0.42, 62); // window size has a floor so the full view shows a real window
  const wh = ww * 1.45;
  const wx = box.x - ww * 0.2;
  const wy = box.y + box.h * 0.05;
  const defs =
    `<defs><linearGradient id="${wall}" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="${wallLit}"/><stop offset="1" stop-color="${wallDim}"/></linearGradient>` +
    `<linearGradient id="${corner}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2438" stop-opacity="0"/><stop offset="1" stop-color="#3a2438" stop-opacity="0.5"/></linearGradient>` +
    `<radialGradient id="${glow}"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.9"/><stop offset="1" stop-color="#ffecc8" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${beam}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6dc" stop-opacity="0.8"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${flr}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${floorCol}"/><stop offset="1" stop-color="${darken(floorCol, 0.1)}"/></linearGradient>` +
    `<filter id="${blur}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(box.w * 0.011, 1.5).toFixed(2)}"/></filter></defs>`;

  let out = defs + `<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#${wall})"/>`;
  // Light bloom around the window on the wall.
  out += ellipse(wx + ww / 2, wy + wh / 2, ww * 1.15, wh * 0.85, { fill: `url(#${glow})` });

  let soft = '';
  // Window: bright panes with a frame and cross bars.
  soft += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="4" fill="${frame}"/>`;
  const pad = ww * 0.07;
  const pw = (ww - pad * 3) / 2;
  const ph = (wh - pad * 3) / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      soft += `<rect x="${(wx + pad + c * (pw + pad)).toFixed(1)}" y="${(wy + pad + r * (ph + pad)).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${r === 0 ? '#fffaf0' : '#fff0d8'}"/>`;
    }
  }
  // Hint of foliage outside in the lower panes.
  soft += ellipse(wx + ww * 0.3, wy + wh * 0.82, ww * 0.18, wh * 0.1, { fill: mix(bg, '#b8d8a0', 0.6), opacity: 0.5 });
  soft += ellipse(wx + ww * 0.72, wy + wh * 0.78, ww * 0.16, wh * 0.12, { fill: mix(bg, '#b8d8a0', 0.6), opacity: 0.45 });
  // Light shafts from the window towards the lower right.
  const shaft = (x0: number, x1: number, tx0: number, tx1: number, o: number): string =>
    path(`M${x0} ${wy + wh * 0.1} L${x1} ${wy + wh * 0.1} L${tx1} ${fy + 10} L${tx0} ${fy + 10} Z`, { fill: `url(#${beam})`, opacity: o });
  soft +=
    shaft(wx + ww * 0.55, wx + ww, wx + ww * 1.3, wx + ww * 3.4, 0.9) +
    shaft(wx + ww * 0.2, wx + ww * 0.5, wx + ww * 0.7, wx + ww * 1.9, 0.6) +
    shaft(wx + ww * 0.8, wx + ww * 1.05, wx + ww * 2.1, wx + ww * 4.2, 0.5);
  // Floor, baseboard and the window's light patch on it.
  soft += `<rect x="-20" y="${fy}" width="${VIEW_W + 40}" height="${VIEW_H - fy + 20}" fill="url(#${flr})"/>`;
  soft += `<rect x="-20" y="${fy - 6}" width="${VIEW_W + 40}" height="8" fill="${mix(wallLit, wallDim, 0.5)}"/>`;
  soft += path(`M${wx + ww * 1.3} ${fy + 10} L${wx + ww * 3.4} ${fy + 10} L${wx + ww * 3.6} ${fy + 70} L${wx + ww * 1.0} ${fy + 70} Z`, { fill: '#fff2d0', opacity: 0.4 });
  out += `<g filter="url(#${blur})">${soft}</g>`;
  // Darker corner on the right.
  out += `<rect x="${VIEW_W * 0.45}" y="0" width="${VIEW_W * 0.55}" height="${VIEW_H}" fill="url(#${corner})"/>`;
  out += ellipse(VIEW_W / 2, GROUND_Y + 2, 175, 26, { fill: '#fff0d8', opacity: 0.2 });
  return out;
}

export function backgroundSvg(ctx: Ctx): string {
  const { p } = ctx;
  if (p.bgPattern === 'bokeh') return bokehSvg(ctx);
  if (p.bgPattern === 'sunset') return sunsetSvg(ctx);
  if (p.bgPattern === 'window') return windowSvg(ctx);
  const bg = p.bgColor;
  const id = ctx.uid('bg');
  const pid = ctx.uid('pat');
  const glow = ctx.uid('glow');
  let defs = `<radialGradient id="${glow}" cx="0.5" cy="0.55" r="0.55"><stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
  let fill = bg;
  let pattern = '';

  if (p.bgPattern === 'gradient') {
    defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${lighten(bg, 0.07)}"/><stop offset="1" stop-color="${hueShift(mix(bg, '#ffd6ec', 0.3), 28)}"/></linearGradient>`;
    fill = `url(#${id})`;
  } else if (p.bgPattern !== 'plain') {
    const ink = mix(bg, p.bgPattern === 'hearts' ? '#ff8fb8' : '#ffffff', p.bgPattern === 'hearts' ? 0.4 : 0.6);
    let tile = '';
    let size = 56;
    if (p.bgPattern === 'dots') {
      size = 44;
      tile = circle(11, 11, 5, { fill: ink }) + circle(33, 33, 5, { fill: ink });
    } else if (p.bgPattern === 'hearts') {
      tile = path(heartPath(14, 14, 8), { fill: ink }) + path(heartPath(42, 42, 6), { fill: ink });
    } else {
      tile = path(starPath(14, 14, 10, 0.25), { fill: ink }) + path(starPath(42, 42, 7, 0.25), { fill: ink });
    }
    defs += `<pattern id="${pid}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${tile}</pattern>`;
    pattern = `<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#${pid})"/>`;
  }

  const sparkle = (x: number, y: number, r: number): string => path(starPath(x, y, r, 0.22), { fill: '#ffffff', opacity: 0.85 });
  return (
    `<defs>${defs}</defs>` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="${fill}"/>` +
    pattern +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#${glow})"/>` +
    ellipse(VIEW_W / 2, GROUND_Y + 2, 175, 26, { fill: '#ffffff', opacity: 0.45 }) +
    sparkle(48, 70, 11) + sparkle(352, 120, 8) + sparkle(334, 470, 12) + sparkle(62, 400, 7) + sparkle(372, 300, 6)
  );
}
