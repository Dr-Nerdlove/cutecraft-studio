import { lighten, mix, outline, shade } from '../../core/color';
import { group, path, smoothClosed } from '../../core/svg';
import { computeGeo, facePoints, type Geo } from './geometry';
import type { AnimeParams } from './schema';

/** Everything a part renderer needs: parameters, measurements and derived colours. */
export interface Ctx {
  p: AnimeParams;
  g: Geo;
  /** Unique id for gradients / clip paths inside this one SVG (and across SVGs on the page). */
  uid(name: string): string;
  skin: string;
  skinShade: string;
  skinLine: string;
  hair: string;
  hairShade: string;
  hairLight: string;
  hairLine: string;
  /** Warm back light on the hair edges. */
  hairRim: string;
  /** Warm, rosy tint for the redder parts of the skin (nose tip, ears, lids). */
  skinRose: string;
  /** Path of the face outline and the id of its clip path. */
  faceD: string;
  faceClip: string;
  /** Id of the shared soft-blur filter (defined once per SVG by the renderer). */
  soft: string;
}

export function makeCtx(p: AnimeParams, prefix: string): Ctx {
  let counter = 0;
  const g = computeGeo(p);
  return {
    p,
    g,
    uid: (name) => `${prefix}${name}${counter++}`,
    faceD: smoothClosed(facePoints(g, p.faceShape)),
    faceClip: `${prefix}face`,
    soft: `${prefix}soft`,
    skin: p.skin,
    // shadows on skin are warm and rosy, never grey (like painted portraits)
    skinShade: mix(shade(p.skin, 1.15), '#c8606a', 0.16),
    skinRose: mix(p.skin, '#e0606a', 0.35),
    skinLine: mix(outline(p.skin), p.skin, 0.2),
    hair: p.hairColor,
    hairShade: shade(p.hairColor, 1.2),
    hairLight: lighten(p.hairColor, 0.16),
    hairLine: softLine(p.hairColor),
    hairRim: mix(lighten(p.hairColor, 0.3), '#ffd9a8', 0.45),
  };
}

/** Default outline colour: the muted outline blended a little back towards the fill (lighter line art). */
export const softLine = (fill: string): string => mix(outline(fill), fill, 0.3);

interface CelOptions {
  /** Shift of the lit layer; the uncovered rim becomes the shadow. */
  dx?: number;
  dy?: number;
  line?: string | null;
  lineW?: number;
  shadeColor?: string;
  /** Extra markup drawn inside the shape (clipped) between shading and outline. */
  inside?: string;
}

/** Shading shift multiplier: semi-realistic shapes get a wider, blurred shadow rim. */
const SHADE_SPREAD = 2.2;
/** Outlines are only half visible: shapes are defined by their shading, like a painting. */
const LINE_OPACITY = 0.55;

/**
 * A shape with soft shading: shadow colour underneath, the lit colour on top shifted up-left and
 * blurred (clipped to the shape), so the shadow fades in softly along the lower-right rim; then the
 * outline.
 */
export function cel(ctx: Ctx, d: string, fill: string, o: CelOptions = {}): string {
  const lw = o.lineW ?? ctx.g.lw;
  const line = o.line === undefined ? softLine(fill) : o.line;
  const dx = (o.dx ?? -lw * 1.3) * SHADE_SPREAD;
  const dy = (o.dy ?? -lw * 0.9) * SHADE_SPREAD;
  const shadeColor = o.shadeColor ?? shade(fill);
  const id = ctx.uid('cel');
  return (
    `<clipPath id="${id}">${path(d)}</clipPath>` +
    path(d, { fill: shadeColor }) +
    group(path(d, { fill, transform: `translate(${dx} ${dy})`, filter: `url(#${ctx.soft})` }) + (o.inside ?? ''), { 'clip-path': `url(#${id})` }) +
    (line ? path(d, { fill: 'none', stroke: line, 'stroke-width': lw, 'stroke-opacity': LINE_OPACITY, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }) : '')
  );
}

/** Plain filled shape with an outline. */
export function flat(ctx: Ctx, d: string, fill: string, o: { line?: string | null; lineW?: number; extra?: Record<string, string | number> } = {}): string {
  const line = o.line === undefined ? softLine(fill) : o.line;
  return path(d, {
    fill,
    stroke: line ?? undefined,
    'stroke-width': line ? (o.lineW ?? ctx.g.lw) : undefined,
    'stroke-opacity': line ? LINE_OPACITY : undefined,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    ...(o.extra ?? {}),
  });
}

export function stroke(ctx: Ctx, d: string, color: string, width?: number, extra: Record<string, string | number> = {}): string {
  return path(d, { fill: 'none', stroke: color, 'stroke-width': width ?? ctx.g.lw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
}

