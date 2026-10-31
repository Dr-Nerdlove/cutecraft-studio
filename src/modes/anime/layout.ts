import { clamp, lerp } from '../../core/svg';
import type { Ctx } from './context';
import { faceHalfWidthAt } from './geometry';

export interface FaceLayout {
  eyeY: number;
  eyeDX: number;
  eyeW: number;
  eyeH: number;
  browY: number;
  noseY: number;
  mouthY: number;
  mouthW: number;
}

// Height / width of the eye opening. Semi-realistic eyes are much flatter than classic anime eyes.
const EYE_ASPECT = { round: 0.74, sparkly: 0.78, sleepy: 0.56, cat: 0.6, almond: 0.58, doe: 0.7, narrow: 0.46, happy: 0.42 } as const;

export function faceLayout(ctx: Ctx): FaceLayout {
  const { g, p } = ctx;
  const sz = p.eyeSize / 100;
  const sp = p.eyeSpacing / 100;
  // eyes close to the middle of the head, like a real face
  const eyeY = g.yTop + g.u * (0.535 + (p.eyeY / 100 - 0.5) * 0.08);
  const eyeW = g.headW * lerp(0.2, 0.28, sz);
  const eyeH = eyeW * EYE_ASPECT[p.eyeShape];
  const edge = faceHalfWidthAt(g, p.faceShape, eyeY);
  // keep the eyes inside the face (and clear of the side locks) at every slider position
  const maxDX = Math.max(0, edge * 0.86 - eyeW / 2);
  const eyeDX = Math.min(g.headW * lerp(0.18, 0.26, sp), maxDX);
  const mouthY = g.yTop + g.u * 0.805;
  const gap = g.u * 0.05;
  const noseY = clamp(g.yTop + g.u * 0.7 + (eyeY - g.yTop - g.u * 0.535) * 0.5, eyeY + eyeH / 2 + gap, mouthY - gap * 1.4);
  return {
    eyeY, eyeDX, eyeW, eyeH,
    browY: eyeY - eyeH * 0.5 - Math.max(eyeW * 0.24, g.u * 0.04),
    noseY, mouthY,
    mouthW: g.headW * 0.2 * lerp(0.7, 1.3, p.mouthSize / 100),
  };
}
