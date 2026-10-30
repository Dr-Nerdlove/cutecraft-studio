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

const EYE_ASPECT = { round: 1.12, sparkly: 1.2, sleepy: 0.86, cat: 0.82, happy: 0.55 } as const;

export function faceLayout(ctx: Ctx): FaceLayout {
  const { g, p } = ctx;
  const sz = p.eyeSize / 100;
  const sp = p.eyeSpacing / 100;
  const eyeY = g.yTop + g.u * (lerp(0.62, 0.57, g.k) + (p.eyeY / 100 - 0.5) * 0.12);
  const eyeW = g.headW * lerp(0.165, 0.265, sz) * lerp(1.04, 0.96, g.k);
  const eyeH = eyeW * EYE_ASPECT[p.eyeShape];
  const edge = faceHalfWidthAt(g, p.faceShape, eyeY);
  // keep the eyes inside the face (and clear of the side locks) at every slider position
  const maxDX = Math.max(0, edge * 0.86 - eyeW / 2);
  const eyeDX = Math.min(g.headW * lerp(0.15, 0.255, sp), maxDX);
  const mouthY = g.yTop + g.u * lerp(0.855, 0.83, g.k);
  const gap = g.u * 0.04;
  const noseY = clamp(lerp(eyeY + eyeH / 2, mouthY, 0.5), eyeY + eyeH / 2 + gap * 0.3, mouthY - gap);
  return {
    eyeY, eyeDX, eyeW, eyeH,
    browY: eyeY - eyeH * 0.5 - Math.max(eyeW * 0.2, g.u * 0.025),
    noseY, mouthY,
    mouthW: g.headW * 0.125 * lerp(0.6, 1.45, p.mouthSize / 100),
  };
}
