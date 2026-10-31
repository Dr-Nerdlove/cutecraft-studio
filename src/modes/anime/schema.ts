import { choice, color, slider, toggle, type Category, type Params } from '../../core/schema';
import {
  ACCESSORY_COLORS, BG_COLORS, BLUSH_COLORS, BROW_COLORS, CLOTHES_COLORS, HAIR_COLORS, IRIS_COLORS, SHOE_COLORS, SKIN_TONES,
} from './palette';

/** Typed view of the anime parameters. The keys here are the saved keys: never rename them. */
export interface AnimeParams {
  proportion: number; height: number; build: number; shoulders: number; waist: number; hips: number; skin: string;
  faceShape: 'round' | 'oval' | 'heart' | 'square';
  blush: number; blushColor: string; freckles: boolean;
  nose: 'dot' | 'line' | 'none' | 'button' | 'defined' | 'soft';
  mouth: 'smile' | 'open' | 'cat' | 'o' | 'pout' | 'fang' | 'lips' | 'smirk' | 'grin';
  mouthSize: number;
  brow: 'soft' | 'straight' | 'raised' | 'worried';
  browThickness: number; browColor: string;
  eyeShape: 'almond' | 'doe' | 'narrow' | 'round' | 'sparkly' | 'sleepy' | 'cat' | 'happy';
  eyeSize: number; eyeSpacing: number; eyeY: number; iris: string; hetero: boolean; iris2: string;
  shine: 'classic' | 'star' | 'heart';
  lashes: 'none' | 'light' | 'full';
  hairBack: 'short' | 'bob' | 'long' | 'wavy' | 'ponytail' | 'twintails' | 'buns'
    | 'sidetail' | 'braid' | 'hime' | 'messy' | 'drills' | 'curls' | 'afro' | 'dreads' | 'pixie';
  hairFront: 'straight' | 'side' | 'parted' | 'curtain' | 'blunt' | 'swept' | 'spiky' | 'forehead';
  hairColor: string; hairTip: string; tipStrength: number; hairLength: number; ahoge: boolean;
  top: 'tshirt' | 'hoodie' | 'sailor' | 'sweater' | 'dress';
  topColor: string;
  bottom: 'skirt' | 'shorts' | 'pants';
  bottomColor: string;
  socks: 'none' | 'ankle' | 'knee';
  sockColor: string; shoeColor: string;
  headAcc: 'none' | 'bow' | 'cat' | 'bunny' | 'flower' | 'crown' | 'beret';
  headAccColor: string;
  glasses: 'none' | 'round' | 'heart';
  bgColor: string;
  bgPattern: 'plain' | 'dots' | 'hearts' | 'stars' | 'gradient' | 'bokeh' | 'sunset' | 'window';
}

const longHair = (p: Params): boolean => ['long', 'wavy', 'ponytail', 'twintails', 'sidetail', 'braid', 'hime', 'drills', 'curls', 'afro', 'dreads'].includes(p.hairBack as string);

export const animeCategories: readonly Category[] = [
  {
    id: 'body', icon: '🧸', labelKey: 'a.cat.body',
    params: [
      // Hidden for good: kept only so old saves keep the key (migrate() drops unknown keys); drawing ignores it.
      slider('proportion', 'a.proportion', 0, 100, 1, 100, { showIf: () => false }),
      slider('height', 'a.height', 0, 100, 1, 70),
      slider('build', 'a.build', 0, 100, 1, 40, { minLabelKey: 'a.build.min', maxLabelKey: 'a.build.max' }),
      slider('shoulders', 'a.shoulders', 0, 100, 1, 45),
      slider('waist', 'a.waist', 0, 100, 1, 40),
      slider('hips', 'a.hips', 0, 100, 1, 50),
      color('skin', 'a.skin', SKIN_TONES, '#ffe0cf'),
    ],
  },
  {
    id: 'face', icon: '😊', labelKey: 'a.cat.face',
    params: [
      choice('faceShape', 'a.faceShape', [
        { value: 'round', labelKey: 'a.faceShape.round' }, { value: 'oval', labelKey: 'a.faceShape.oval' },
        { value: 'heart', labelKey: 'a.faceShape.heart' }, { value: 'square', labelKey: 'a.faceShape.square' },
      ], 'oval'),
      slider('blush', 'a.blush', 0, 100, 1, 40),
      color('blushColor', 'a.blushColor', BLUSH_COLORS, '#ff9fb2'),
      toggle('freckles', 'a.freckles', false),
      choice('nose', 'a.nose', [
        { value: 'dot', labelKey: 'a.nose.dot' }, { value: 'line', labelKey: 'a.nose.line' }, { value: 'none', labelKey: 'a.nose.none' },
        { value: 'button', labelKey: 'a.nose.button' }, { value: 'defined', labelKey: 'a.nose.defined' }, { value: 'soft', labelKey: 'a.nose.soft' },
      ], 'defined'),
      choice('mouth', 'a.mouth', [
        { value: 'smile', labelKey: 'a.mouth.smile' }, { value: 'open', labelKey: 'a.mouth.open' },
        { value: 'cat', labelKey: 'a.mouth.cat' }, { value: 'o', labelKey: 'a.mouth.o' },
        { value: 'pout', labelKey: 'a.mouth.pout' }, { value: 'fang', labelKey: 'a.mouth.fang' },
        { value: 'lips', labelKey: 'a.mouth.lips' }, { value: 'smirk', labelKey: 'a.mouth.smirk' }, { value: 'grin', labelKey: 'a.mouth.grin' },
      ], 'lips'),
      slider('mouthSize', 'a.mouthSize', 0, 100, 1, 50),
      choice('brow', 'a.brow', [
        { value: 'soft', labelKey: 'a.brow.soft' }, { value: 'straight', labelKey: 'a.brow.straight' },
        { value: 'raised', labelKey: 'a.brow.raised' }, { value: 'worried', labelKey: 'a.brow.worried' },
      ], 'soft'),
      slider('browThickness', 'a.browThickness', 0, 100, 1, 40),
      color('browColor', 'a.browColor', BROW_COLORS, '#5a3f3a'),
    ],
  },
  {
    id: 'eyes', icon: '👀', labelKey: 'a.cat.eyes',
    params: [
      choice('eyeShape', 'a.eyeShape', [
        { value: 'almond', labelKey: 'a.eye.almond' }, { value: 'doe', labelKey: 'a.eye.doe' }, { value: 'narrow', labelKey: 'a.eye.narrow' }, { value: 'round', labelKey: 'a.eye.round' }, { value: 'sparkly', labelKey: 'a.eye.sparkly' },
        { value: 'sleepy', labelKey: 'a.eye.sleepy' }, { value: 'cat', labelKey: 'a.eye.cat' },
        { value: 'happy', labelKey: 'a.eye.happy' },
      ], 'almond'),
      slider('eyeSize', 'a.eyeSize', 0, 100, 1, 60),
      slider('eyeSpacing', 'a.eyeSpacing', 0, 100, 1, 50),
      slider('eyeY', 'a.eyeY', 0, 100, 1, 50),
      color('iris', 'a.iris', IRIS_COLORS, '#5aa9e6'),
      toggle('hetero', 'a.hetero', false),
      color('iris2', 'a.iris2', IRIS_COLORS, '#ff8fb8', { showIf: (p) => p.hetero === true }),
      choice('shine', 'a.shine', [
        { value: 'classic', labelKey: 'a.shine.classic' }, { value: 'star', labelKey: 'a.shine.star' }, { value: 'heart', labelKey: 'a.shine.heart' },
      ], 'classic'),
      choice('lashes', 'a.lashes', [
        { value: 'none', labelKey: 'a.lashes.none' }, { value: 'light', labelKey: 'a.lashes.light' }, { value: 'full', labelKey: 'a.lashes.full' },
      ], 'light'),
    ],
  },
  {
    id: 'hair', icon: '💇‍♀️', labelKey: 'a.cat.hair',
    params: [
      choice('hairBack', 'a.hairBack', [
        { value: 'short', labelKey: 'a.hairBack.short' }, { value: 'bob', labelKey: 'a.hairBack.bob' },
        { value: 'long', labelKey: 'a.hairBack.long' }, { value: 'wavy', labelKey: 'a.hairBack.wavy' },
        { value: 'ponytail', labelKey: 'a.hairBack.ponytail' }, { value: 'twintails', labelKey: 'a.hairBack.twintails' },
        { value: 'buns', labelKey: 'a.hairBack.buns' }, { value: 'sidetail', labelKey: 'a.hairBack.sidetail' },
        { value: 'braid', labelKey: 'a.hairBack.braid' }, { value: 'hime', labelKey: 'a.hairBack.hime' },
        { value: 'messy', labelKey: 'a.hairBack.messy' }, { value: 'drills', labelKey: 'a.hairBack.drills' },
        { value: 'curls', labelKey: 'a.hairBack.curls' }, { value: 'afro', labelKey: 'a.hairBack.afro' },
        { value: 'dreads', labelKey: 'a.hairBack.dreads' }, { value: 'pixie', labelKey: 'a.hairBack.pixie' },
      ], 'long'),
      choice('hairFront', 'a.hairFront', [
        { value: 'straight', labelKey: 'a.hairFront.straight' }, { value: 'side', labelKey: 'a.hairFront.side' },
        { value: 'parted', labelKey: 'a.hairFront.parted' }, { value: 'curtain', labelKey: 'a.hairFront.curtain' },
        { value: 'blunt', labelKey: 'a.hairFront.blunt' }, { value: 'swept', labelKey: 'a.hairFront.swept' },
        { value: 'spiky', labelKey: 'a.hairFront.spiky' }, { value: 'forehead', labelKey: 'a.hairFront.forehead' },
      ], 'straight', { showIf: (p) => p.hairBack !== 'afro' }),
      color('hairColor', 'a.hairColor', HAIR_COLORS, '#a1604a'),
      color('hairTip', 'a.hairTip', HAIR_COLORS, '#f6a6c9'),
      slider('tipStrength', 'a.tipStrength', 0, 100, 1, 0),
      slider('hairLength', 'a.hairLength', 0, 100, 1, 55, { showIf: longHair }),
      toggle('ahoge', 'a.ahoge', false),
    ],
  },
  {
    id: 'outfit', icon: '👗', labelKey: 'a.cat.outfit',
    params: [
      choice('top', 'a.top', [
        { value: 'tshirt', labelKey: 'a.top.tshirt' }, { value: 'hoodie', labelKey: 'a.top.hoodie' },
        { value: 'sailor', labelKey: 'a.top.sailor' }, { value: 'sweater', labelKey: 'a.top.sweater' },
        { value: 'dress', labelKey: 'a.top.dress' },
      ], 'tshirt'),
      color('topColor', 'a.topColor', CLOTHES_COLORS, '#fdd5e4'),
      choice('bottom', 'a.bottom', [
        { value: 'skirt', labelKey: 'a.bottom.skirt' }, { value: 'shorts', labelKey: 'a.bottom.shorts' }, { value: 'pants', labelKey: 'a.bottom.pants' },
      ], 'skirt', { showIf: (p) => p.top !== 'dress' }),
      color('bottomColor', 'a.bottomColor', CLOTHES_COLORS, '#d9c7f7', { showIf: (p) => p.top !== 'dress' }),
      choice('socks', 'a.socks', [
        { value: 'none', labelKey: 'a.socks.none' }, { value: 'ankle', labelKey: 'a.socks.ankle' }, { value: 'knee', labelKey: 'a.socks.knee' },
      ], 'knee'),
      color('sockColor', 'a.sockColor', CLOTHES_COLORS, '#ffffff', { showIf: (p) => p.socks !== 'none' }),
      color('shoeColor', 'a.shoeColor', SHOE_COLORS, '#f9a8c9'),
    ],
  },
  {
    id: 'acc', icon: '🎀', labelKey: 'a.cat.acc',
    params: [
      choice('headAcc', 'a.headAcc', [
        { value: 'none', labelKey: 'a.headAcc.none' }, { value: 'bow', labelKey: 'a.headAcc.bow' },
        { value: 'cat', labelKey: 'a.headAcc.cat' }, { value: 'bunny', labelKey: 'a.headAcc.bunny' },
        { value: 'flower', labelKey: 'a.headAcc.flower' }, { value: 'crown', labelKey: 'a.headAcc.crown' },
        { value: 'beret', labelKey: 'a.headAcc.beret' },
      ], 'bow'),
      color('headAccColor', 'a.headAccColor', ACCESSORY_COLORS, '#ff7aa8', { showIf: (p) => p.headAcc !== 'none' }),
      choice('glasses', 'a.glasses', [
        { value: 'none', labelKey: 'a.glasses.none' }, { value: 'round', labelKey: 'a.glasses.round' }, { value: 'heart', labelKey: 'a.glasses.heart' },
      ], 'none'),
    ],
  },
  {
    id: 'bg', icon: '🌈', labelKey: 'a.cat.bg',
    params: [
      color('bgColor', 'a.bgColor', BG_COLORS, '#e9defa'),
      choice('bgPattern', 'a.bgPattern', [
        { value: 'plain', labelKey: 'a.bgPattern.plain' }, { value: 'dots', labelKey: 'a.bgPattern.dots' },
        { value: 'hearts', labelKey: 'a.bgPattern.hearts' }, { value: 'stars', labelKey: 'a.bgPattern.stars' },
        { value: 'gradient', labelKey: 'a.bgPattern.gradient' }, { value: 'bokeh', labelKey: 'a.bgPattern.bokeh' },
        { value: 'sunset', labelKey: 'a.bgPattern.sunset' }, { value: 'window', labelKey: 'a.bgPattern.window' },
      ], 'hearts'),
    ],
  },
];
