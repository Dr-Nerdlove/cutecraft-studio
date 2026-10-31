import type { ViewKind } from '../../core/mode';
import { VIEW_H, VIEW_W, GROUND_Y, portraitBox } from './geometry';
import { makeCtx } from './context';
import { backgroundSvg } from './background';
import { armsSvg, groundShadowSvg, legsSvg, neckSvg, shoesSvg, socksSvg, torsoSvg } from './body';
import { bottomSvg, hoodBackSvg, sleevesSvg, topSvg } from './outfit';
import { blushSvg, browsSvg, earsSvg, faceBaseSvg, frecklesSvg, mouthSvg, noseSvg } from './face';
import { eyesSvg } from './eyes';
import { hairBackSvg, hairFrontSvg } from './hair';
import { glassesSvg, headBehindSvg, headFrontSvg } from './accessories';
import type { AnimeParams } from './schema';

/** Draws the whole character (front to back). */
export function renderAnime(p: AnimeParams, prefix: string, view: ViewKind = 'full'): string {
  const ctx = makeCtx(p, prefix);
  const { g } = ctx;
  // one shared soft blur (local figure units) used by the shading of every shape
  const blur = (g.lw * 2.2).toFixed(2);
  const figure =
    `<defs><filter id="${ctx.soft}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>` +
    groundShadowSvg(ctx) +
    hairBackSvg(ctx) +
    legsSvg(ctx) +
    socksSvg(ctx) +
    shoesSvg(ctx) +
    torsoSvg(ctx) +
    bottomSvg(ctx) +
    hoodBackSvg(ctx) +
    neckSvg(ctx) +
    topSvg(ctx) +
    armsSvg(ctx) +
    sleevesSvg(ctx) +
    // head
    earsSvg(ctx) +
    faceBaseSvg(ctx) +
    blushSvg(ctx) +
    frecklesSvg(ctx) +
    noseSvg(ctx) +
    mouthSvg(ctx) +
    eyesSvg(ctx) +
    browsSvg(ctx) +
    headBehindSvg(ctx) +
    hairFrontSvg(ctx) +
    headFrontSvg(ctx) +
    glassesSvg(ctx);

  const box = view === 'portrait' ? portraitBox(g) : { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
  const vb = `${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">` +
    backgroundSvg(ctx) +
    `<g transform="translate(${VIEW_W / 2} ${GROUND_Y}) scale(${g.scale.toFixed(4)})">${figure}</g>` +
    '</svg>'
  );
}
