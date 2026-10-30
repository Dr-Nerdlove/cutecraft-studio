import { hueShift, lighten, mix } from '../../core/color';
import { circle, ellipse, heartPath, path, starPath } from '../../core/svg';
import type { Ctx } from './context';
import { GROUND_Y, VIEW_H, VIEW_W } from './geometry';

export function backgroundSvg(ctx: Ctx): string {
  const { p } = ctx;
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
