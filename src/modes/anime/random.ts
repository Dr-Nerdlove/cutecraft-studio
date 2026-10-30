import { hexToHsl } from '../../core/color';
import { ACCESSORY_COLORS, BG_COLORS, BLUSH_COLORS, BROW_COLORS, CLOTHES_COLORS, HAIR_COLORS, IRIS_COLORS, SHOE_COLORS, SKIN_TONES } from './palette';
import type { AnimeParams } from './schema';

const rnd = (a: number, b: number): number => Math.round(a + Math.random() * (b - a));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number): boolean => Math.random() < p;

function weighted<T extends string>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[0][0];
}

const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** The palette colour whose hue is nearest to the wanted one (neutrals count as "any hue"). */
function nearHue(palette: readonly string[], hue: number, exclude: string[] = []): string {
  let best = palette[0];
  let bestScore = Infinity;
  for (const c of palette) {
    if (exclude.includes(c)) continue;
    const { h, s } = hexToHsl(c);
    const score = (s < 0.15 ? 55 : hueDist(h, hue)) + Math.random() * 14;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** A random, cute and colour-harmonious character. */
export function randomAnime(): AnimeParams {
  const hair = pick(HAIR_COLORS);
  const hc = hexToHsl(hair);
  const baseHue = hc.s < 0.2 ? rnd(0, 359) : hc.h;
  const scheme = pick([30, 180, 120, -120, 60]);

  const topColor = nearHue(CLOTHES_COLORS, baseHue + scheme);
  const bottomColor = chance(0.3) ? pick(['#3a3f6b', '#4a3b44', '#ffffff', '#c9a27e']) : nearHue(CLOTHES_COLORS, baseHue + scheme + pick([60, -60, 180]), [topColor]);
  const accent = nearHue(ACCESSORY_COLORS, baseHue + pick([0, 150, -150]));
  const darkHair = hc.l < 0.35;
  const pastelHair = hc.s > 0.5 && hc.l > 0.6;
  const browColor = pastelHair ? '#8a6a8e' : darkHair ? pick(['#2b2230', '#3a2a2a']) : hc.l > 0.6 ? '#a0785a' : '#5a3f3a';

  const hairBack = weighted([['short', 1], ['bob', 1.2], ['long', 1.6], ['wavy', 1.3], ['ponytail', 1], ['twintails', 1.2], ['buns', 0.9]] as const);
  const top = weighted([['tshirt', 1], ['hoodie', 1], ['sailor', 1.2], ['sweater', 1], ['dress', 1.4]] as const);

  return {
    proportion: chance(0.5) ? rnd(0, 40) : rnd(45, 100),
    height: rnd(35, 100),
    build: rnd(10, 90),
    shoulders: rnd(25, 75),
    waist: rnd(15, 70),
    hips: rnd(25, 80),
    skin: pick(SKIN_TONES),
    faceShape: pick(['round', 'oval', 'heart', 'square'] as const),
    blush: rnd(30, 90),
    blushColor: pick(BLUSH_COLORS),
    freckles: chance(0.18),
    nose: weighted([['dot', 3], ['line', 1], ['none', 1]] as const),
    mouth: weighted([['smile', 3], ['open', 2.2], ['cat', 1.6], ['o', 0.8], ['pout', 0.9], ['fang', 1.1]] as const),
    mouthSize: rnd(30, 70),
    brow: weighted([['soft', 3], ['straight', 1.5], ['raised', 1], ['worried', 0.8]] as const),
    browThickness: rnd(20, 60),
    browColor: BROW_COLORS.includes(browColor as never) ? browColor : '#5a3f3a',
    eyeShape: weighted([['round', 2.2], ['sparkly', 3], ['sleepy', 0.8], ['cat', 1.2], ['happy', 0.7]] as const),
    eyeSize: rnd(45, 85),
    eyeSpacing: rnd(30, 70),
    eyeY: rnd(35, 65),
    iris: nearHue(IRIS_COLORS, baseHue + pick([180, 150, 0, 40, -40])),
    hetero: chance(0.1),
    iris2: pick(IRIS_COLORS),
    shine: weighted([['classic', 4], ['star', 1.3], ['heart', 1]] as const),
    lashes: weighted([['none', 0.6], ['light', 2], ['full', 2]] as const),
    hairBack,
    hairFront: pick(['straight', 'side', 'parted', 'curtain'] as const),
    hairColor: hair,
    hairTip: nearHue(HAIR_COLORS.slice(9), baseHue + pick([0, 40, -40, 180])),
    tipStrength: chance(0.45) ? rnd(30, 80) : 0,
    hairLength: rnd(25, 90),
    ahoge: chance(0.4),
    top,
    topColor,
    bottom: pick(['skirt', 'skirt', 'shorts', 'pants'] as const),
    bottomColor,
    socks: weighted([['none', 1], ['ankle', 1.4], ['knee', 2.2]] as const),
    sockColor: chance(0.5) ? '#ffffff' : nearHue(CLOTHES_COLORS, baseHue + pick([0, 60, 180])),
    shoeColor: chance(0.5) ? pick(['#ffffff', '#3a2f3a', '#7a4a3a']) : nearHue(SHOE_COLORS, baseHue + 30),
    headAcc: weighted([['none', 1.3], ['bow', 2], ['cat', 1.2], ['bunny', 1], ['flower', 1.2], ['crown', 0.8], ['beret', 1]] as const),
    headAccColor: accent,
    glasses: weighted([['none', 6], ['round', 1], ['heart', 0.7]] as const),
    bgColor: nearHue(BG_COLORS, baseHue + 180 + rnd(-40, 40)),
    bgPattern: weighted([['plain', 1], ['dots', 1.4], ['hearts', 1.8], ['stars', 1.4], ['gradient', 1.4]] as const),
  };
}
