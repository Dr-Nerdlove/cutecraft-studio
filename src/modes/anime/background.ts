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

export function backgroundSvg(ctx: Ctx): string {
  const { p } = ctx;
  if (p.bgPattern === 'bokeh') return bokehSvg(ctx);
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
