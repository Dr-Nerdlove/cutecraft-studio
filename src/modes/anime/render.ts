import { VIEW_H, VIEW_W, GROUND_Y } from './geometry';
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
export function renderAnime(p: AnimeParams, prefix: string): string {
  const ctx = makeCtx(p, prefix);
  const { g } = ctx;
  const figure =
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

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet">` +
    backgroundSvg(ctx) +
    `<g transform="translate(${VIEW_W / 2} ${GROUND_Y}) scale(${g.scale.toFixed(4)})">${figure}</g>` +
    '</svg>'
  );
}
