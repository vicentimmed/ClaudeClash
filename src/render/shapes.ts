import { Graphics } from 'pixi.js';
import type { TowerKind, UnitShape } from '../sim/types';

export function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** amt > 0 lightens toward white, amt < 0 darkens toward black. */
export function shade(hex: string | number, amt: number): number {
  const n = typeof hex === 'number' ? hex : hexToNum(hex);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export const TEAM_COLOR: Record<number, number> = {
  0: 0x3b7dd8,
  1: 0xd64545,
};

const SKIN = 0xf1c9a0;
const BONE = 0xf0eadd;
const WOOD = 0x8a5f3d;
const STEEL = 0xc9d2da;
const DARK_EYE = 0x241c14;

export interface DrawUnitOpts {
  animT?: number;
  charging?: boolean;
  swing?: number;
  /** Valkyrie: 0..1 progress of the 360° spin attack */
  spin?: number;
  /** Mega Knight: 0 = arms down, 1 = maces raised for jump */
  jumpRaise?: number;
  /** Swarm card icons: scales each member of the trio (deck builder thumbnails). */
  swarmScale?: number;
}

/** One skeleton with feet anchored at (cx, cy). */
function drawSingleSkeletonAt(
  g: Graphics,
  h: number,
  bodyHex: string,
  accentHex: string,
  cx: number,
  cy: number,
  swing = 0,
) {
  const body = hexToNum(bodyHex);
  const slash = Math.max(0, swing) ** 2;
  const armReach = slash * h * 0.22;
  g.rect(cx - h * 0.11, cy - h * 0.26, h * 0.055, h * 0.26).fill(shade(body, -0.18));
  g.rect(cx + h * 0.055, cy - h * 0.26, h * 0.055, h * 0.26).fill(shade(body, -0.18));
  g.roundRect(cx - h * 0.14, cy - h * 0.58, h * 0.28, h * 0.33, h * 0.06).fill(body);
  const rib = hexToNum(accentHex);
  g.rect(cx - h * 0.14, cy - h * 0.52, h * 0.28, h * 0.028).fill(rib);
  g.rect(cx - h * 0.14, cy - h * 0.45, h * 0.28, h * 0.028).fill(rib);
  g.rect(cx - h * 0.14, cy - h * 0.38, h * 0.28, h * 0.028).fill(rib);
  g.rect(cx - h * 0.2, cy - h * 0.56, h * 0.06, h * 0.24).fill(body);
  g.rect(cx + h * 0.14 + armReach, cy - h * 0.56 + slash * h * 0.08, h * 0.06, h * (0.24 - slash * 0.06)).fill(body);
  g.circle(cx, cy - h * 0.73, h * 0.165).fill(body);
  g.rect(cx - h * 0.075, cy - h * 0.67, h * 0.15, h * 0.08).fill(body);
  g.circle(cx - h * 0.06, cy - h * 0.75, h * 0.045).fill(DARK_EYE);
  g.circle(cx + h * 0.06, cy - h * 0.75, h * 0.045).fill(DARK_EYE);
  if (slash > 0.2) {
    g.circle(cx + h * 0.22 + armReach, cy - h * 0.48, h * 0.04).fill({ color: 0xffffff, alpha: slash * 0.35 });
  }
}

/** One minion with feet anchored at (cx, cy). */
function drawSingleMinionAt(
  g: Graphics,
  h: number,
  bodyHex: string,
  accentHex: string,
  cx: number,
  cy: number,
  swing = 0,
) {
  const body = hexToNum(bodyHex);
  const accent = hexToNum(accentHex);
  const slash = Math.max(0, swing) ** 2;
  const clawX = slash * h * 0.18;
  const clawY = slash * h * 0.1;
  g.ellipse(cx, cy - h * 0.46, h * 0.21, h * 0.24).fill(body);
  g.poly([
    cx - h * 0.18, cy - h * 0.58,
    cx - h * 0.62, cy - h * 0.78,
    cx - h * 0.16, cy - h * 0.36,
  ]).fill(shade(body, -0.22));
  g.poly([
    cx + h * 0.18, cy - h * 0.58,
    cx + h * 0.62, cy - h * 0.78,
    cx + h * 0.16, cy - h * 0.36,
  ]).fill(shade(body, -0.22));
  g.circle(cx, cy - h * 0.72, h * 0.2).fill(shade(body, 0.1));
  g.circle(cx - h * 0.07, cy - h * 0.74, h * 0.055).fill(0xfff3c0);
  g.circle(cx + h * 0.07, cy - h * 0.74, h * 0.055).fill(0xfff3c0);
  g.circle(cx - h * 0.07, cy - h * 0.74, h * 0.025).fill(DARK_EYE);
  g.circle(cx + h * 0.07, cy - h * 0.74, h * 0.025).fill(DARK_EYE);
  g.poly([
    cx - h * 0.06 + clawX * 0.3, cy - h * 0.62 + clawY,
    cx + h * 0.06 + clawX, cy - h * 0.62 + clawY,
    cx + clawX * 0.5, cy - h * 0.52 + clawY,
  ]).fill(accent);
  if (slash > 0.15) {
    g.moveTo(cx + h * 0.06, cy - h * 0.62)
      .lineTo(cx + h * 0.06 + clawX, cy - h * 0.52 + clawY)
      .stroke({ width: h * 0.02, color: 0xffffff, alpha: slash * 0.4 });
  }
}

/** Massive stone golem — wide boulder torso, oversized arms, crystal shards, glowing eyes. */
function drawGolem(g: Graphics, h: number, bodyHex: string, accentHex: string, swing = 0) {
  const rock = hexToNum(bodyHex);
  const crystal = hexToNum(accentHex);
  const rockLight = shade(rock, 0.18);
  const rockMid = shade(rock, 0.05);
  const rockDark = shade(rock, -0.26);
  const rockDeep = shade(rock, -0.44);
  const w = h * 0.7;
  const eyeRed = 0xff2200;
  const eyeGlow = 0xff5533;
  const punch = Math.max(0, swing) ** 2;
  const leftShiftX = punch * w * 0.18;
  const leftShiftY = punch * h * 0.2;
  const rightShiftX = punch * w * 0.32;
  const rightShiftY = punch * h * 0.24;
  const armLift = (1 - punch) * h * 0.08;

  const drawLeftArm = () => {
    const ox = leftShiftX;
    const oy = leftShiftY - armLift;
    g.roundRect(-w * 0.98 + ox, -h * 0.78 + oy, w * 0.34, h * 0.62, h * 0.055).fill(rockDark);
    g.roundRect(-w * 0.94 + ox, -h * 0.74 + oy, w * 0.26, h * 0.54, h * 0.04).fill(rock);
    g.roundRect(-w * 0.92 + ox, -h * 0.74 + oy, w * 0.12, h * 0.38, h * 0.02).fill(rockLight);
    g.roundRect(-w * 1.0 + ox, -h * 0.26 + oy, w * 0.3, h * 0.2, h * 0.04).fill(rockDark);
    g.roundRect(-w * 1.06 + ox, -h * 0.11 + oy, w * 0.36, h * 0.13, h * 0.04).fill(rock);
    g.roundRect(-w * 1.04 + ox, -h * 0.12 + oy, w * 0.32, h * 0.05, h * 0.02).fill(rockLight);
    for (let i = 0; i < 4; i++) {
      g.circle(-w * (0.92 - i * 0.065) + ox, -h * 0.055 + oy, h * 0.022).fill(rockMid);
    }
    g.moveTo(-w * 0.36 + ox, -h * 0.66 + oy)
      .lineTo(-w * 0.3 + ox, -h * 0.34 + oy)
      .stroke({ width: h * 0.007, color: rockDeep, alpha: 0.6 });
    if (punch > 0.4) {
      const spark = (punch - 0.4) * 1.6;
      g.circle(-w * 0.88 + ox, -h * 0.055 + oy, h * 0.05).fill({ color: 0xffaa44, alpha: spark * 0.55 });
    }
  };

  const drawRightArm = () => {
    const ox = rightShiftX;
    const oy = rightShiftY - armLift;
    g.roundRect(w * 0.64 + ox, -h * 0.78 + oy, w * 0.36, h * 0.64, h * 0.055).fill(rockDark);
    g.roundRect(w * 0.68 + ox, -h * 0.74 + oy, w * 0.28, h * 0.56, h * 0.04).fill(rock);
    g.roundRect(w * 0.72 + ox, -h * 0.74 + oy, w * 0.12, h * 0.4, h * 0.02).fill(rockLight);
    g.roundRect(w * 0.7 + ox, -h * 0.26 + oy, w * 0.32, h * 0.22, h * 0.04).fill(rockDark);
    g.roundRect(w * 0.68 + ox, -h * 0.11 + oy, w * 0.38, h * 0.14, h * 0.04).fill(rock);
    g.roundRect(w * 0.7 + ox, -h * 0.12 + oy, w * 0.34, h * 0.06, h * 0.02).fill(rockLight);
    for (let i = 0; i < 4; i++) {
      g.circle(w * (0.82 + i * 0.065) + ox, -h * 0.06 + oy, h * 0.024).fill(rockMid);
    }
    g.moveTo(w * 0.36 + ox, -h * 0.66 + oy)
      .lineTo(w * 0.42 + ox, -h * 0.34 + oy)
      .stroke({ width: h * 0.007, color: rockDeep, alpha: 0.6 });
    if (punch > 0.4) {
      const spark = (punch - 0.4) * 1.6;
      g.circle(w * 0.86 + ox, -h * 0.06 + oy, h * 0.055).fill({ color: 0xffaa44, alpha: spark * 0.65 });
    }
  };

  // Legs — wide, planted stance
  g.roundRect(-w * 0.34, -h * 0.14, w * 0.28, h * 0.14, h * 0.03).fill(rockDark);
  g.roundRect(w * 0.06, -h * 0.14, w * 0.28, h * 0.14, h * 0.03).fill(rockDark);
  g.roundRect(-w * 0.32, -h * 0.12, w * 0.24, h * 0.05, h * 0.015).fill(rockDeep);
  g.roundRect(w * 0.08, -h * 0.12, w * 0.24, h * 0.05, h * 0.015).fill(rockDeep);

  drawLeftArm();

  // Torso — heavy central boulder
  g.roundRect(-w * 0.42, -h * 0.68, w * 0.84, h * 0.58, h * 0.1).fill(rock);
  g.roundRect(-w * 0.36, -h * 0.64, w * 0.72, h * 0.5, h * 0.07).fill(rockLight);
  for (let i = 0; i < 4; i++) {
    const sy = -h * (0.22 + i * 0.09);
    g.moveTo(-w * 0.38, sy)
      .lineTo(w * 0.34, sy)
      .stroke({ width: h * 0.006, color: rockDeep, alpha: 0.5 });
  }
  g.moveTo(w * 0.04, -h * 0.6)
    .lineTo(w * 0.1, -h * 0.28)
    .stroke({ width: h * 0.007, color: rockDeep, alpha: 0.45 });

  g.circle(-w * 0.38, -h * 0.62, h * 0.12).fill(rockDark);
  g.circle(w * 0.38, -h * 0.62, h * 0.12).fill(rockDark);
  g.circle(-w * 0.36, -h * 0.64, h * 0.07).fill(rockLight);
  g.circle(w * 0.36, -h * 0.64, h * 0.07).fill(rockLight);

  // Crystal shards on shoulders
  g.poly([-w * 0.08, -h * 0.78, w * 0.06, -h * 1.02, w * 0.22, -h * 0.74]).fill(crystal);
  g.poly([w * 0.02, -h * 0.8, w * 0.2, -h * 1.06, w * 0.32, -h * 0.76]).fill(shade(crystal, 0.22));
  g.poly([-w * 0.26, -h * 0.72, -w * 0.1, -h * 0.96, w * 0.04, -h * 0.7]).fill(shade(crystal, 0.1));
  g.moveTo(w * 0.1, -h * 0.92)
    .lineTo(w * 0.16, -h * 1.0)
    .stroke({ width: h * 0.005, color: 0xffffff, alpha: 0.4 });

  // Small head perched on the torso
  g.roundRect(-w * 0.16, -h * 0.86, w * 0.32, h * 0.16, h * 0.05).fill(rockDark);
  g.roundRect(-w * 0.12, -h * 0.84, w * 0.24, h * 0.1, h * 0.035).fill(rock);
  g.roundRect(-w * 0.14, -h * 0.88, w * 0.28, h * 0.05, h * 0.02).fill(rockDeep);
  g.rect(-w * 0.1, -h * 0.8, w * 0.08, h * 0.025).fill(eyeRed);
  g.rect(w * 0.02, -h * 0.8, w * 0.08, h * 0.025).fill(eyeRed);
  g.rect(-w * 0.1, -h * 0.8, w * 0.08, h * 0.025).fill({ color: eyeGlow, alpha: 0.5 });
  g.rect(w * 0.02, -h * 0.8, w * 0.08, h * 0.025).fill({ color: eyeGlow, alpha: 0.5 });

  g.ellipse(0, -h * 0.42, w * 0.18, h * 0.08).fill({ color: rockLight, alpha: 0.35 });

  drawRightArm();
}

/** P.E.K.K.A blade swing — shared by Mini and full P.E.K.K.A. */
function drawPekkaBladeSwing(
  g: Graphics,
  handX: number,
  handY: number,
  h: number,
  _w: number,
  swing: number,
  accent: number,
  size: 'mini' | 'full',
) {
  const slash = Math.max(0, swing) ** 2;
  const steel = size === 'mini' ? 0x4a4f63 : STEEL;
  const steelLight = shade(steel, 0.18);
  const steelDark = shade(steel, -0.28);
  const bladeLen = size === 'mini' ? h * 0.68 : h * 0.84;
  const restAngle = size === 'mini' ? -2.25 : -1.48;
  const swordAngle = restAngle + slash * 2.15;
  const cosA = Math.cos(swordAngle);
  const sinA = Math.sin(swordAngle);
  const perpX = Math.cos(swordAngle + Math.PI / 2);
  const perpY = Math.sin(swordAngle + Math.PI / 2);
  const baseHalfW = size === 'mini' ? h * 0.052 : h * 0.082;
  const midHalfW = size === 'mini' ? h * 0.044 : h * 0.068;
  const tipHalfW = size === 'mini' ? h * 0.016 : h * 0.024;
  const guardHalfW = size === 'mini' ? h * 0.072 : h * 0.115;
  const guardDepth = size === 'mini' ? h * 0.022 : h * 0.032;
  const gripLen = size === 'mini' ? h * 0.11 : h * 0.13;

  const tipX = handX + cosA * bladeLen;
  const tipY = handY + sinA * bladeLen;
  const midX = handX + cosA * bladeLen * 0.52;
  const midY = handY + sinA * bladeLen * 0.52;
  const baseX = handX + cosA * h * 0.05;
  const baseY = handY + sinA * h * 0.05;
  const guardCx = handX + cosA * h * 0.015;
  const guardCy = handY + sinA * h * 0.015;
  const gripEndX = handX - cosA * gripLen;
  const gripEndY = handY - sinA * gripLen;

  if (slash > 0.08) {
    g.moveTo(handX, handY)
      .lineTo(tipX, tipY)
      .stroke({ width: h * 0.05, color: accent, alpha: slash * 0.35 });
    g.arc(handX, handY, h * (size === 'mini' ? 0.34 : 0.4), swordAngle - 0.5, swordAngle + 0.35).stroke({
      width: h * 0.024,
      color: 0xe8f4ff,
      alpha: slash * 0.55,
    });
  }

  // grip
  const gripHalfW = size === 'mini' ? h * 0.022 : h * 0.028;
  g.poly([
    handX - cosA * h * 0.02 + perpX * gripHalfW,
    handY - sinA * h * 0.02 + perpY * gripHalfW,
    handX - cosA * h * 0.02 - perpX * gripHalfW,
    handY - sinA * h * 0.02 - perpY * gripHalfW,
    gripEndX - perpX * gripHalfW * 0.85,
    gripEndY - perpY * gripHalfW * 0.85,
    gripEndX + perpX * gripHalfW * 0.85,
    gripEndY + perpY * gripHalfW * 0.85,
  ]).fill(shade(steel, -0.15));

  // pommel
  g.circle(gripEndX, gripEndY, size === 'mini' ? h * 0.028 : h * 0.036).fill(accent);

  // crossguard — wide bar perpendicular to blade
  g.poly([
    guardCx + perpX * guardHalfW,
    guardCy + perpY * guardHalfW,
    guardCx - perpX * guardHalfW,
    guardCy - perpY * guardHalfW,
    guardCx - cosA * guardDepth - perpX * guardHalfW * 0.82,
    guardCy - sinA * guardDepth - perpY * guardHalfW * 0.82,
    guardCx - cosA * guardDepth + perpX * guardHalfW * 0.82,
    guardCy - sinA * guardDepth + perpY * guardHalfW * 0.82,
  ]).fill(accent);
  g.poly([
    guardCx + perpX * guardHalfW * 0.55,
    guardCy + perpY * guardHalfW * 0.55,
    guardCx - perpX * guardHalfW * 0.55,
    guardCy - perpY * guardHalfW * 0.55,
    guardCx - cosA * guardDepth * 0.55 - perpX * guardHalfW * 0.45,
    guardCy - sinA * guardDepth * 0.55 - perpY * guardHalfW * 0.45,
    guardCx - cosA * guardDepth * 0.55 + perpX * guardHalfW * 0.45,
    guardCy - sinA * guardDepth * 0.55 + perpY * guardHalfW * 0.45,
  ]).fill(shade(accent, 0.22));

  // main blade — broad greatsword tapering to a point
  g.poly([
    baseX + perpX * baseHalfW,
    baseY + perpY * baseHalfW,
    baseX - perpX * baseHalfW,
    baseY - perpY * baseHalfW,
    midX - perpX * midHalfW,
    midY - perpY * midHalfW,
    tipX - perpX * tipHalfW,
    tipY - perpY * tipHalfW,
    tipX,
    tipY,
    tipX + perpX * tipHalfW,
    tipY + perpY * tipHalfW,
    midX + perpX * midHalfW,
    midY + perpY * midHalfW,
  ]).fill(steelLight);

  // cutting edge shadow on the lower side
  g.poly([
    baseX - perpX * baseHalfW,
    baseY - perpY * baseHalfW,
    midX - perpX * midHalfW,
    midY - perpY * midHalfW,
    tipX - perpX * tipHalfW,
    tipY - perpY * tipHalfW,
    tipX - cosA * h * 0.04 - perpX * tipHalfW * 0.6,
    tipY - sinA * h * 0.04 - perpY * tipHalfW * 0.6,
    midX - cosA * h * 0.03 - perpX * midHalfW * 0.55,
    midY - sinA * h * 0.03 - perpY * midHalfW * 0.55,
    baseX - cosA * h * 0.02 - perpX * baseHalfW * 0.55,
    baseY - sinA * h * 0.02 - perpY * baseHalfW * 0.55,
  ]).fill(steelDark);

  // center fuller (groove) — sells the sword silhouette vs spear
  const fullerHalfW = size === 'mini' ? h * 0.008 : h * 0.012;
  g.poly([
    baseX + cosA * h * 0.04 + perpX * fullerHalfW,
    baseY + sinA * h * 0.04 + perpY * fullerHalfW,
    baseX + cosA * h * 0.04 - perpX * fullerHalfW,
    baseY + sinA * h * 0.04 - perpY * fullerHalfW,
    tipX - cosA * h * 0.08 - perpX * fullerHalfW,
    tipY - sinA * h * 0.08 - perpY * fullerHalfW,
    tipX - cosA * h * 0.08 + perpX * fullerHalfW,
    tipY - sinA * h * 0.08 + perpY * fullerHalfW,
  ]).fill(shade(steel, -0.12));

  // bright upper edge highlight
  g.poly([
    baseX + perpX * baseHalfW * 0.72,
    baseY + perpY * baseHalfW * 0.72,
    midX + perpX * midHalfW * 0.72,
    midY + perpY * midHalfW * 0.72,
    tipX + perpX * tipHalfW * 0.5,
    tipY + perpY * tipHalfW * 0.5,
    tipX - cosA * h * 0.05 + perpX * tipHalfW * 0.35,
    tipY - sinA * h * 0.05 + perpY * tipHalfW * 0.35,
  ]).fill({ color: 0xffffff, alpha: 0.55 });

  // sharp tip
  g.poly([
    tipX,
    tipY,
    tipX - cosA * h * 0.1 - perpX * tipHalfW * 1.4,
    tipY - sinA * h * 0.1 - perpY * tipHalfW * 1.4,
    tipX - cosA * h * 0.1 + perpX * tipHalfW * 1.4,
    tipY - sinA * h * 0.1 + perpY * tipHalfW * 1.4,
  ]).fill(0xffffff);
}

/** Bomb icon for balloon drop animation. */
export function drawBombIcon(g: Graphics, cx: number, cy: number, r: number, fuseLit = false) {
  g.circle(cx, cy, r).fill(0x2a2218);
  g.circle(cx - r * 0.22, cy - r * 0.18, r * 0.72).fill(0x3a3228);
  g.rect(cx - r * 0.12, cy - r * 1.15, r * 0.24, r * 0.35).fill(0x5c4a38);
  if (fuseLit) {
    g.circle(cx, cy - r * 1.25, r * 0.22).fill({ color: 0xff6622, alpha: 0.85 });
    g.circle(cx + r * 0.08, cy - r * 1.35, r * 0.12).fill({ color: 0xffaa44, alpha: 0.65 });
  }
}

/** Balloon bomb falling from basket to target. `drop` is 0 at release, 1 at impact. */
export function drawBalloonBombDrop(
  g: Graphics,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  drop: number,
  tile: number,
) {
  const t = Math.max(0, Math.min(1, drop));
  const bx = startX + (endX - startX) * t;
  const by = startY + (endY - startY) * t - Math.sin(t * Math.PI) * tile * 0.35;
  const r = tile * 0.16;

  g.moveTo(startX, startY).lineTo(bx, by).stroke({ width: 2, color: 0x3a3a3a, alpha: 0.35 * (1 - t * 0.5) });
  g.ellipse(endX, endY + tile * 0.08, r * (0.5 + t * 0.8), r * 0.35 * (0.5 + t * 0.8)).fill({
    color: 0x000000,
    alpha: 0.18 + t * 0.22,
  });
  drawBombIcon(g, bx, by, r, t < 0.85);
  if (t > 0.82) {
    const burst = (t - 0.82) / 0.18;
    g.circle(endX, endY, tile * 0.22 * burst).fill({ color: 0xff6622, alpha: 0.45 * (1 - burst) });
    g.circle(endX, endY, tile * 0.14 * burst).fill({ color: 0xffaa44, alpha: 0.55 * (1 - burst) });
  }
}

/** One goblin with feet anchored at (cx, cy) — Clash-style dagger goblin. */
function drawSingleGoblinAt(
  g: Graphics,
  h: number,
  bodyHex: string,
  accentHex: string,
  cx: number,
  cy: number,
  swing = 0,
) {
  const body = hexToNum(bodyHex);
  const bodyLight = shade(bodyHex, 0.14);
  const bodyDark = shade(bodyHex, -0.32);
  const pants = hexToNum(accentHex);
  const pantsDark = shade(accentHex, -0.22);
  const boot = 0x8a5a38;
  const bootLight = 0xa07048;
  const strap = 0xc43828;
  const eyeYellow = 0xffee44;
  const tooth = 0xf5f0e8;
  const gold = 0xd4a832;
  const slash = Math.max(0, swing) ** 2;

  const drawEar = (side: number) => {
    const ex = cx + side * h * 0.13;
    const ey = cy - h * 0.66;
    g.poly([
      ex, ey,
      ex + side * h * 0.2, ey - h * 0.035,
      ex + side * h * 0.05, ey + h * 0.055,
    ]).fill(bodyLight);
    g.poly([
      ex, ey,
      ex + side * h * 0.2, ey - h * 0.035,
      ex + side * h * 0.05, ey + h * 0.055,
    ]).stroke({ width: h * 0.012, color: bodyDark });
  };
  drawEar(-1);
  drawEar(1);

  const drawShoe = (side: number) => {
    const sx = cx + side * h * 0.11;
    g.roundRect(sx - h * 0.075, cy - h * 0.085, h * 0.15, h * 0.085, h * 0.025).fill(boot);
    g.ellipse(sx + side * h * 0.085, cy - h * 0.045, h * 0.05, h * 0.038).fill(bootLight);
    g.ellipse(sx + side * h * 0.1, cy - h * 0.05, h * 0.028, h * 0.02).fill(boot);
  };
  drawShoe(-1);
  drawShoe(1);

  g.roundRect(cx - h * 0.155, cy - h * 0.3, h * 0.31, h * 0.24, h * 0.035).fill(pants);
  g.rect(cx - h * 0.155, cy - h * 0.3, h * 0.31, h * 0.045).fill(pantsDark);

  g.roundRect(cx - h * 0.13, cy - h * 0.56, h * 0.055, h * 0.18, h * 0.02).fill(body);
  g.circle(cx - h * 0.1, cy - h * 0.52, h * 0.038).fill(bodyLight);

  g.ellipse(cx + h * 0.015, cy - h * 0.44, h * 0.17, h * 0.15).fill(body);
  g.ellipse(cx + h * 0.02, cy - h * 0.4, h * 0.12, h * 0.09).fill(bodyLight);
  g.circle(cx + h * 0.01, cy - h * 0.34, h * 0.016).fill(bodyDark);

  const strapW = h * 0.028;
  g.moveTo(cx - h * 0.1, cy - h * 0.28)
    .lineTo(cx - h * 0.055, cy - h * 0.54)
    .stroke({ width: strapW, color: strap, cap: 'round' });
  g.moveTo(cx + h * 0.1, cy - h * 0.28)
    .lineTo(cx + h * 0.04, cy - h * 0.54)
    .stroke({ width: strapW, color: strap, cap: 'round' });

  const handX = cx + h * 0.15 + slash * h * 0.12;
  const handY = cy - h * 0.48 + slash * h * 0.07;
  g.roundRect(handX - h * 0.028, handY, h * 0.055, h * 0.13, h * 0.02).fill(body);
  g.circle(handX, handY - h * 0.015, h * 0.038).fill(bodyLight);

  const stabAngle = -1.35 + slash * 1.25;
  const cosA = Math.cos(stabAngle);
  const sinA = Math.sin(stabAngle);
  const perpX = Math.cos(stabAngle + Math.PI / 2);
  const perpY = Math.sin(stabAngle + Math.PI / 2);
  const handleLen = h * 0.09;
  const bladeLen = h * 0.26;
  const handleEndX = handX + cosA * handleLen;
  const handleEndY = handY + sinA * handleLen;
  const tipX = handleEndX + cosA * bladeLen;
  const tipY = handleEndY + sinA * bladeLen;
  const bladeW = h * 0.065;

  g.circle(handX, handY, h * 0.028).fill(gold);
  g.moveTo(handX, handY)
    .lineTo(handleEndX, handleEndY)
    .stroke({ width: h * 0.038, color: boot, cap: 'round' });
  g.poly([
    handleEndX + perpX * bladeW * 0.55, handleEndY + perpY * bladeW * 0.55,
    handleEndX - perpX * bladeW * 0.55, handleEndY - perpY * bladeW * 0.55,
    tipX, tipY,
  ]).fill(STEEL);
  g.poly([
    handleEndX + perpX * bladeW * 0.55, handleEndY + perpY * bladeW * 0.55,
    handleEndX - perpX * bladeW * 0.55, handleEndY - perpY * bladeW * 0.55,
    tipX, tipY,
  ]).stroke({ width: h * 0.01, color: shade(STEEL, -0.25) });

  const headY = cy - h * 0.64;
  g.roundRect(cx - h * 0.145, headY - h * 0.17, h * 0.29, h * 0.21, h * 0.07).fill(body);

  const drawBrow = (side: number) => {
    g.moveTo(cx + side * h * 0.04, headY - h * 0.1)
      .lineTo(cx + side * h * 0.12, headY - h * 0.115)
      .stroke({ width: h * 0.024, color: bodyDark, cap: 'round' });
  };
  drawBrow(-1);
  drawBrow(1);

  const drawEye = (side: number) => {
    const ex = cx + side * h * 0.07;
    const ey = headY - h * 0.04;
    g.circle(ex, ey, h * 0.048).fill(eyeYellow);
    g.circle(ex + side * h * 0.008, ey + h * 0.006, h * 0.022).fill(DARK_EYE);
    g.circle(ex - side * h * 0.012, ey - h * 0.012, h * 0.012).fill({ color: 0xffffff, alpha: 0.55 });
  };
  drawEye(-1);
  drawEye(1);

  g.circle(cx + h * 0.01, headY + h * 0.015, h * 0.04).fill(bodyLight);
  g.circle(cx, headY + h * 0.012, h * 0.012).fill({ color: 0xffffff, alpha: 0.25 });

  const mouthY = headY + h * 0.065;
  g.ellipse(cx + h * 0.015, mouthY, h * 0.085, h * 0.042).fill(0x3a1818);
  g.rect(cx - h * 0.045, mouthY - h * 0.018, h * 0.03, h * 0.018).fill(tooth);
  g.rect(cx - h * 0.008, mouthY - h * 0.018, h * 0.028, h * 0.018).fill(tooth);
  g.rect(cx + h * 0.028, mouthY - h * 0.018, h * 0.022, h * 0.018).fill(tooth);

  if (slash > 0.2) {
    g.circle(tipX, tipY, h * 0.035).fill({ color: 0xffffff, alpha: slash * 0.35 });
  }
}

/** Goblin Barrel — wooden barrel with a goblin peeking out (Clash Royale style). */
function drawGoblinBarrel(g: Graphics, h: number, bodyHex: string, accentHex: string) {
  const wood = hexToNum(bodyHex);
  const woodLight = shade(wood, 0.18);
  const woodMid = shade(wood, 0.04);
  const woodDark = shade(wood, -0.22);
  const hoop = shade(wood, -0.42);
  const hoopLight = shade(wood, -0.12);
  const goblin = hexToNum(accentHex);
  const goblinLight = shade(accentHex, 0.14);
  const goblinDark = shade(accentHex, -0.32);
  const vest = 0xc43828;
  const vestDark = 0x8a2418;
  const boot = 0x6b4226;
  const bootLight = 0x8a5a38;
  const eyeYellow = 0xffee44;
  const tongue = 0xff5577;
  const tooth = 0xf5f0e8;

  const tilt = 0.36;
  const pivotX = 0;
  const pivotY = -h * 0.44;
  const rot = (x: number, y: number): [number, number] => {
    const dx = x - pivotX;
    const dy = y - pivotY;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    return [pivotX + dx * c - dy * s, pivotY + dx * s + dy * c];
  };
  const quad = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number) => {
    const [a0, a1] = rot(x0, y0);
    const [b0, b1] = rot(x1, y1);
    const [c0, c1] = rot(x2, y2);
    const [d0, d1] = rot(x3, y3);
    g.poly([a0, a1, b0, b1, c0, c1, d0, d1]).fill(color);
  };

  const bw = h * 0.44;
  const bh = h * 0.46;
  const topY = pivotY - bh * 0.55;
  const botY = pivotY + bh * 0.42;
  const midY = pivotY - bh * 0.06;

  // Ground shadow
  g.ellipse(0, -h * 0.04, bw * 0.72, h * 0.07).fill({ color: 0x000000, alpha: 0.22 });

  // Barrel back panel
  quad(-bw * 0.38, topY + bh * 0.08, bw * 0.38, topY + bh * 0.08, bw * 0.42, botY, -bw * 0.42, botY, woodDark);

  // Vertical staves
  const staves = 9;
  for (let i = 0; i < staves; i++) {
    const t = i / (staves - 1);
    const x = -bw * 0.4 + t * bw * 0.8;
    const bulge = Math.cos((t - 0.5) * Math.PI) * h * 0.035;
    const sw = h * 0.048;
    const col = i % 2 === 0 ? woodMid : woodLight;
    quad(
      x - sw * 0.5 + bulge,
      topY + bh * 0.04,
      x + sw * 0.5 + bulge,
      topY + bh * 0.04,
      x + sw * 0.5 - bulge * 0.3,
      botY - h * 0.02,
      x - sw * 0.5 - bulge * 0.3,
      botY - h * 0.02,
      col,
    );
  }

  // Interior darkness at the opening
  const [ix, iy] = rot(0, topY + bh * 0.02);
  g.ellipse(ix, iy, bw * 0.34, h * 0.07).fill({ color: 0x1a1208, alpha: 0.75 });

  // Boot sticking up inside the barrel
  const [bx0, by0] = rot(-bw * 0.12, topY + bh * 0.18);
  const [bx1, by1] = rot(-bw * 0.02, topY - bh * 0.02);
  g.moveTo(bx0, by0)
    .lineTo(bx1, by1)
    .stroke({ width: h * 0.09, color: boot, cap: 'round' });
  const [btx, bty] = rot(-bw * 0.02, topY - bh * 0.04);
  g.roundRect(btx - h * 0.055, bty - h * 0.04, h * 0.11, h * 0.08, h * 0.02).fill(bootLight);

  // Goblin torso / red vest inside
  const [vx0, vy0] = rot(-bw * 0.14, topY + bh * 0.14);
  const [vx1, vy1] = rot(bw * 0.14, topY + bh * 0.14);
  const [vx2, vy2] = rot(bw * 0.1, topY + bh * 0.28);
  const [vx3, vy3] = rot(-bw * 0.1, topY + bh * 0.28);
  g.poly([vx0, vy0, vx1, vy1, vx2, vy2, vx3, vy3]).fill(vest);
  g.poly([vx0, vy0, vx1, vy1, vx2, vy2, vx3, vy3]).stroke({ width: h * 0.012, color: vestDark });

  // Metal hoops
  const drawHoop = (y: number, thick: number) => {
    quad(-bw * 0.44, y - thick * 0.5, bw * 0.44, y - thick * 0.5, bw * 0.44, y + thick * 0.5, -bw * 0.44, y + thick * 0.5, hoop);
    quad(-bw * 0.38, y - thick * 0.22, bw * 0.38, y - thick * 0.22, bw * 0.38, y + thick * 0.08, -bw * 0.38, y + thick * 0.08, hoopLight);
  };
  drawHoop(botY - h * 0.04, h * 0.055);
  drawHoop(midY, h * 0.048);
  drawHoop(topY + bh * 0.1, h * 0.052);

  // Top rim
  const [rx, ry] = rot(0, topY + bh * 0.06);
  g.ellipse(rx, ry, bw * 0.4, h * 0.055).fill(woodDark);
  g.ellipse(rx, ry, bw * 0.36, h * 0.042).fill(woodMid);

  // Hands gripping the rim
  const drawClaw = (x: number, y: number, flip: number) => {
    const [cx, cy] = rot(x, y);
    g.circle(cx, cy, h * 0.045).fill(goblinLight);
    for (let f = -1; f <= 1; f += 2) {
      const [fx, fy] = rot(x + flip * f * h * 0.028, y - h * 0.018);
      g.circle(fx, fy, h * 0.016).fill(goblin);
    }
  };
  drawClaw(-bw * 0.28, topY + bh * 0.05, -1);
  drawClaw(bw * 0.28, topY + bh * 0.05, 1);

  // Goblin head
  const headX = 0;
  const headY = topY - bh * 0.06;
  const [hx, hy] = rot(headX, headY);
  g.ellipse(hx, hy, h * 0.17, h * 0.14).fill(goblin);

  // Ears
  const drawEar = (side: number) => {
    const ex = headX + side * h * 0.15;
    const ey = headY - h * 0.04;
    const [e0x, e0y] = rot(ex, ey);
    const [e1x, e1y] = rot(ex + side * h * 0.12, ey - h * 0.1);
    const [e2x, e2y] = rot(ex + side * h * 0.04, ey + h * 0.04);
    g.poly([e0x, e0y, e1x, e1y, e2x, e2y]).fill(goblinLight);
    g.poly([e0x, e0y, e1x, e1y, e2x, e2y]).stroke({ width: h * 0.012, color: goblinDark });
  };
  drawEar(-1);
  drawEar(1);

  // Eyebrows
  const drawBrow = (side: number) => {
    const [bx, by] = rot(headX + side * h * 0.07, headY - h * 0.1);
    g.moveTo(bx - side * h * 0.04, by + h * 0.008)
      .lineTo(bx + side * h * 0.04, by - h * 0.008)
      .stroke({ width: h * 0.022, color: goblinDark, cap: 'round' });
  };
  drawBrow(-1);
  drawBrow(1);

  // Eyes — big yellow with black pupils
  const drawEye = (side: number) => {
    const [ex, ey] = rot(headX + side * h * 0.07, headY - h * 0.04);
    g.circle(ex, ey, h * 0.048).fill(eyeYellow);
    g.circle(ex + side * h * 0.008, ey + h * 0.006, h * 0.022).fill(DARK_EYE);
    g.circle(ex - side * h * 0.012, ey - h * 0.012, h * 0.012).fill({ color: 0xffffff, alpha: 0.55 });
  };
  drawEye(-1);
  drawEye(1);

  // Bulbous nose
  const [nx, ny] = rot(headX, headY + h * 0.01);
  g.circle(nx, ny, h * 0.038).fill(goblinLight);
  g.circle(nx - h * 0.01, ny - h * 0.012, h * 0.012).fill({ color: 0xffffff, alpha: 0.25 });

  // Grin + tongue
  const [mx, my] = rot(headX, headY + h * 0.055);
  g.ellipse(mx, my, h * 0.09, h * 0.045).fill(0x3a1818);
  g.ellipse(mx + h * 0.03, my + h * 0.012, h * 0.035, h * 0.022).fill(tongue);
  const [tx0, ty0] = rot(mx - h * 0.05, my - h * 0.018);
  const [tx1] = rot(mx + h * 0.02, my - h * 0.018);
  g.rect(tx0, ty0, tx1 - tx0, h * 0.018).fill(tooth);
  const [tx2, ty2] = rot(mx + h * 0.03, my - h * 0.018);
  g.rect(tx2, ty2, h * 0.018, h * 0.018).fill(tooth);
}

/** Hammer swing — Hog Rider's Mjolnir-style weapon. */
function drawHammerSwing(
  g: Graphics,
  pivotX: number,
  pivotY: number,
  h: number,
  swing: number,
  handleColor: number,
  headColor: number,
) {
  const slash = Math.max(0, swing) ** 2;
  const angle = -Math.PI * 0.82 + slash * 2.05;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = Math.cos(angle + Math.PI / 2);
  const perpY = Math.sin(angle + Math.PI / 2);
  const handleLen = h * 0.34;
  const endX = pivotX + cosA * handleLen;
  const endY = pivotY + sinA * handleLen;

  // Wooden handle
  g.moveTo(pivotX, pivotY)
    .lineTo(endX, endY)
    .stroke({ width: h * 0.055, color: handleColor, cap: 'round' });

  // Leather grip wrap near the hand
  const gripMid = 0.12;
  const gripX = pivotX + cosA * handleLen * gripMid;
  const gripY = pivotY + sinA * handleLen * gripMid;
  const gripHalfW = h * 0.05;
  const gripHalfD = h * 0.035;
  g.poly([
    gripX + cosA * gripHalfD + perpX * gripHalfW,
    gripY + sinA * gripHalfD + perpY * gripHalfW,
    gripX + cosA * gripHalfD - perpX * gripHalfW,
    gripY + sinA * gripHalfD - perpY * gripHalfW,
    gripX - cosA * gripHalfD - perpX * gripHalfW,
    gripY - sinA * gripHalfD - perpY * gripHalfW,
    gripX - cosA * gripHalfD + perpX * gripHalfW,
    gripY - sinA * gripHalfD + perpY * gripHalfW,
  ]).fill(shade(handleColor, -0.35));

  // Chunky rectangular head — wide block perpendicular to handle (Mjolnir)
  const headHalfW = h * 0.13;
  const headHalfD = h * 0.075;
  const headCx = endX + cosA * headHalfD;
  const headCy = endY + sinA * headHalfD;
  const headLight = shade(headColor, 0.22);
  const headDark = shade(headColor, -0.28);

  // Main head block
  g.poly([
    headCx + cosA * headHalfD + perpX * headHalfW,
    headCy + sinA * headHalfD + perpY * headHalfW,
    headCx + cosA * headHalfD - perpX * headHalfW,
    headCy + sinA * headHalfD - perpY * headHalfW,
    headCx - cosA * headHalfD - perpX * headHalfW,
    headCy - sinA * headHalfD - perpY * headHalfW,
    headCx - cosA * headHalfD + perpX * headHalfW,
    headCy - sinA * headHalfD + perpY * headHalfW,
  ]).fill(headColor);

  // Top face highlight
  g.poly([
    headCx + cosA * headHalfD + perpX * headHalfW * 0.85,
    headCy + sinA * headHalfD + perpY * headHalfW * 0.85,
    headCx + cosA * headHalfD - perpX * headHalfW * 0.85,
    headCy + sinA * headHalfD - perpY * headHalfW * 0.85,
    headCx + cosA * headHalfD * 0.55 - perpX * headHalfW * 0.85,
    headCy + sinA * headHalfD * 0.55 - perpY * headHalfW * 0.85,
    headCx + cosA * headHalfD * 0.55 + perpX * headHalfW * 0.85,
    headCy + sinA * headHalfD * 0.55 + perpY * headHalfW * 0.85,
  ]).fill(headLight);

  // Bottom edge shadow
  g.poly([
    headCx - cosA * headHalfD + perpX * headHalfW * 0.7,
    headCy - sinA * headHalfD + perpY * headHalfW * 0.7,
    headCx - cosA * headHalfD - perpX * headHalfW * 0.7,
    headCy - sinA * headHalfD - perpY * headHalfW * 0.7,
    headCx - cosA * headHalfD * 0.6 - perpX * headHalfW * 0.7,
    headCy - sinA * headHalfD * 0.6 - perpY * headHalfW * 0.7,
    headCx - cosA * headHalfD * 0.6 + perpX * headHalfW * 0.7,
    headCy - sinA * headHalfD * 0.6 + perpY * headHalfW * 0.7,
  ]).fill(headDark);

  // Strap where handle meets head
  const strapHalfW = h * 0.045;
  const strapHalfD = h * 0.025;
  g.poly([
    endX + cosA * strapHalfD + perpX * strapHalfW,
    endY + sinA * strapHalfD + perpY * strapHalfW,
    endX + cosA * strapHalfD - perpX * strapHalfW,
    endY + sinA * strapHalfD - perpY * strapHalfW,
    endX - cosA * strapHalfD - perpX * strapHalfW,
    endY - sinA * strapHalfD - perpY * strapHalfW,
    endX - cosA * strapHalfD + perpX * strapHalfW,
    endY - sinA * strapHalfD + perpY * strapHalfW,
  ]).fill(shade(handleColor, -0.45));

  if (slash > 0.12) {
    g.arc(pivotX, pivotY, h * 0.3, angle - 0.55, angle + 0.25).stroke({
      width: h * 0.022,
      color: 0xffffff,
      alpha: slash * 0.45,
    });
  }
}

/** Double-bladed battle axe — Valkyrie's weapon. */
function drawBattleAxe(
  g: Graphics,
  pivotX: number,
  pivotY: number,
  h: number,
  angle: number,
  wood: number,
  steel: number,
) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = Math.cos(angle + Math.PI / 2);
  const perpY = Math.sin(angle + Math.PI / 2);
  const handleLen = h * 0.44;
  const endX = pivotX + cosA * handleLen;
  const endY = pivotY + sinA * handleLen;
  const steelLight = shade(steel, 0.22);
  const steelDark = shade(steel, -0.32);

  g.moveTo(pivotX, pivotY)
    .lineTo(endX, endY)
    .stroke({ width: h * 0.052, color: wood, cap: 'round' });

  const gripT = 0.16;
  const gx = pivotX + cosA * handleLen * gripT;
  const gy = pivotY + sinA * handleLen * gripT;
  g.roundRect(
    gx - perpX * h * 0.058 - cosA * h * 0.032,
    gy - perpY * h * 0.058 - sinA * h * 0.032,
    perpX * h * 0.116 + cosA * h * 0.064,
    perpY * h * 0.116 + sinA * h * 0.064,
    h * 0.012,
  ).fill(shade(wood, -0.38));

  const collarX = endX - cosA * h * 0.045;
  const collarY = endY - sinA * h * 0.045;
  g.roundRect(
    collarX - perpX * h * 0.065 - cosA * h * 0.028,
    collarY - perpY * h * 0.065 - sinA * h * 0.028,
    perpX * h * 0.13 + cosA * h * 0.056,
    perpY * h * 0.13 + sinA * h * 0.056,
    h * 0.01,
  ).fill(steelDark);

  const headX = endX + cosA * h * 0.035;
  const headY = endY + sinA * h * 0.035;
  const bladeW = h * 0.21;
  const bladeD = h * 0.072;

  g.poly([
    headX + perpX * bladeW * 0.12,
    headY + perpY * bladeW * 0.12,
    headX + perpX * bladeW,
    headY + perpY * bladeW,
    headX + cosA * bladeD + perpX * bladeW * 0.82,
    headY + sinA * bladeD + perpY * bladeW * 0.82,
    headX + cosA * bladeD * 0.25,
    headY + sinA * bladeD * 0.25,
  ]).fill(steel);

  g.poly([
    headX - perpX * bladeW * 0.12,
    headY - perpY * bladeW * 0.12,
    headX - perpX * bladeW,
    headY - perpY * bladeW,
    headX + cosA * bladeD - perpX * bladeW * 0.82,
    headY + sinA * bladeD - perpY * bladeW * 0.82,
    headX + cosA * bladeD * 0.25,
    headY + sinA * bladeD * 0.25,
  ]).fill(steelLight);

  g.poly([
    headX + perpX * bladeW * 0.95,
    headY + perpY * bladeW * 0.95,
    headX + perpX * bladeW * 0.68 + cosA * bladeD,
    headY + perpY * bladeW * 0.68 + sinA * bladeD,
    headX + perpX * bladeW * 0.52 + cosA * bladeD * 0.45,
    headY + perpY * bladeW * 0.52 + sinA * bladeD * 0.45,
  ]).fill(0xffffff);

  g.poly([
    headX - perpX * bladeW * 0.95,
    headY - perpY * bladeW * 0.95,
    headX - perpX * bladeW * 0.68 + cosA * bladeD,
    headY - perpY * bladeW * 0.68 + sinA * bladeD,
    headX - perpX * bladeW * 0.52 + cosA * bladeD * 0.45,
    headY - perpY * bladeW * 0.52 + sinA * bladeD * 0.45,
  ]).fill({ color: 0xffffff, alpha: 0.88 });

  g.poly([
    headX + cosA * bladeD * 0.55 + perpX * bladeW * 0.08,
    headY + sinA * bladeD * 0.55 + perpY * bladeW * 0.08,
    headX + cosA * bladeD * 0.55 - perpX * bladeW * 0.08,
    headY + sinA * bladeD * 0.55 - perpY * bladeW * 0.08,
    headX + cosA * bladeD * 1.05,
    headY + sinA * bladeD * 1.05,
  ]).fill(steelDark);
}

/** Motion streaks while Valkyrie spins. */
function drawValkyrieSpinFx(g: Graphics, cx: number, cy: number, h: number, spin: number, accent: number) {
  if (spin <= 0.04) return;
  const streaks = 5;
  for (let i = 0; i < streaks; i++) {
    const a0 = (i / streaks) * Math.PI * 2 - Math.PI / 2;
    const sweep = Math.PI * 0.38 + spin * Math.PI * 0.18;
    const r = h * (0.3 + i * 0.045);
    g.arc(cx, cy, r, a0, a0 + sweep).stroke({
      width: h * (0.024 - i * 0.003),
      color: i % 2 === 0 ? accent : 0xffffff,
      alpha: spin * (0.55 - i * 0.08),
    });
  }
  g.circle(cx, cy, h * 0.4 * spin).stroke({
    width: h * 0.016,
    color: 0xffffff,
    alpha: spin * 0.32,
  });
  g.circle(cx, cy, h * 0.28 * spin).stroke({
    width: h * 0.01,
    color: accent,
    alpha: spin * 0.4,
  });
}

/** Spiked ball mace — Mega Knight's signature weapon-hands. */
function drawSpikedMace(g: Graphics, cx: number, cy: number, r: number, fill: number) {
  g.circle(cx, cy, r).fill(fill);
  g.circle(cx - r * 0.18, cy - r * 0.12, r * 0.72).fill(shade(fill, 0.14));
  const spikes = 5;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(a) * r * 0.88;
    const by = cy + Math.sin(a) * r * 0.88;
    const tx = cx + Math.cos(a) * r * 1.38;
    const ty = cy + Math.sin(a) * r * 1.38;
    const perp = a + Math.PI / 2;
    const hw = r * 0.3;
    g.poly([
      bx + Math.cos(perp) * hw,
      by + Math.sin(perp) * hw,
      tx,
      ty,
      bx - Math.cos(perp) * hw,
      by - Math.sin(perp) * hw,
    ]).fill(shade(fill, 0.28));
  }
}

/**
 * Every unit is drawn procedurally with its feet at (0, 0) and its body
 * extending upward into negative y. `h` is the full height in pixels.
 */
export function drawUnit(
  g: Graphics,
  shape: UnitShape,
  h: number,
  bodyHex: string,
  accentHex: string,
  team?: number,
  opts?: DrawUnitOpts,
) {
  const body = hexToNum(bodyHex);
  const accent = hexToNum(accentHex);
  const dark = shade(body, -0.35);

  switch (shape) {
    case 'giant': {
      const swing = opts?.swing ?? 0;
      const punch = Math.max(0, swing) ** 2;
      const w = h * 0.5;
      g.roundRect(-w * 0.38, -h * 0.3, w * 0.3, h * 0.3, h * 0.05).fill(dark);
      g.roundRect(w * 0.08, -h * 0.3, w * 0.3, h * 0.3, h * 0.05).fill(dark);
      const leftX = -w * 0.58 + punch * w * 0.38;
      const rightX = w * 0.58 + punch * w * 0.38;
      const fistY = -h * 0.55 + punch * h * 0.16;
      g.circle(leftX, fistY, h * 0.105).fill(shade(body, 0.08));
      g.circle(rightX, fistY, h * 0.105).fill(shade(body, 0.08));
      g.roundRect(-w / 2, -h * 0.8, w, h * 0.54, h * 0.14).fill(body);
      g.rect(-w / 2, -h * 0.42, w, h * 0.1).fill(accent);
      g.rect(-h * 0.055, -h * 0.435, h * 0.11, h * 0.15).fill(shade(accent, 0.4));
      g.circle(0, -h * 0.88, h * 0.16).fill(shade(body, 0.16));
      g.ellipse(0, -h * 0.815, h * 0.135, h * 0.085).fill(BONE);
      g.circle(-h * 0.055, -h * 0.915, h * 0.02).fill(DARK_EYE);
      g.circle(h * 0.055, -h * 0.915, h * 0.02).fill(DARK_EYE);
      if (punch > 0.35) {
        g.circle(rightX, fistY, h * 0.07).fill({ color: 0xffaa44, alpha: (punch - 0.35) * 0.9 });
      }
      break;
    }

    case 'goblin': {
      drawSingleGoblinAt(g, h, bodyHex, accentHex, 0, 0, opts?.swing ?? 0);
      break;
    }

    case 'goblins': {
      // Card icon: trio of goblins (arena units render as single goblin).
      const trio: Array<[number, number, number]> = [
        [-0.28, 0.04, 0.72],
        [0.28, 0.04, 0.72],
        [0, -0.12, 0.8],
      ];
      for (const [ox, oy, sc] of trio) {
        drawSingleGoblinAt(g, h * sc, bodyHex, accentHex, ox * h, oy * h);
      }
      break;
    }

    case 'skeleton': {
      drawSingleSkeletonAt(g, h, bodyHex, accentHex, 0, 0, opts?.swing ?? 0);
      break;
    }

    case 'skeleton_army': {
      // Card icon: dense swarm of skeletons (arena units render as single skeleton).
      const swarm: Array<[number, number, number]> = [
        [-0.26, 0.05, 0.72],
        [0.26, 0.05, 0.72],
        [0, -0.06, 0.78],
        [-0.44, -0.02, 0.64],
        [0.44, -0.02, 0.64],
        [-0.14, -0.24, 0.68],
        [0.14, -0.24, 0.68],
        [-0.34, -0.28, 0.58],
        [0.34, -0.28, 0.58],
      ];
      for (const [ox, oy, sc] of swarm) {
        drawSingleSkeletonAt(g, h * sc, bodyHex, accentHex, ox * h, oy * h);
      }
      break;
    }

    case 'wizard': {
      const w = h * 0.46;
      g.poly([-w * 0.66, 0, w * 0.66, 0, w * 0.34, -h * 0.62, -w * 0.34, -h * 0.62]).fill(body);
      g.rect(-w * 0.66, -h * 0.08, w * 1.32, h * 0.06).fill(shade(body, -0.3));
      g.circle(0, -h * 0.7, h * 0.135).fill(SKIN);
      g.poly([-h * 0.125, -h * 0.7, h * 0.125, -h * 0.7, 0, -h * 0.44]).fill(BONE);
      g.poly([-h * 0.21, -h * 0.81, h * 0.21, -h * 0.81, 0, -h * 1.16]).fill(shade(body, -0.18));
      g.rect(-h * 0.23, -h * 0.845, h * 0.46, h * 0.055).fill(accent);
      g.circle(-h * 0.05, -h * 0.73, h * 0.022).fill(DARK_EYE);
      g.circle(h * 0.05, -h * 0.73, h * 0.022).fill(DARK_EYE);
      g.rect(w * 0.6, -h * 0.78, h * 0.048, h * 0.78).fill(WOOD);
      g.circle(w * 0.62, -h * 0.82, h * 0.115).fill(accent);
      g.circle(w * 0.62, -h * 0.82, h * 0.055).fill(shade(accent, 0.5));
      break;
    }

    case 'witch': {
      const w = h * 0.5;
      const gold = hexToNum(accentHex);
      const cloak = body;
      const dress = team !== undefined ? TEAM_COLOR[team] : shade(cloak, 0.25);
      const darkTop = 0x3a3442;
      const pinkEye = 0xff4da6;
      const purpleLip = 0x6b2d6b;

      // floating tattered cloak hem (no legs)
      g.poly([-w * 0.58, 0, w * 0.58, 0, w * 0.42, -h * 0.28, -w * 0.42, -h * 0.28]).fill(
        shade(cloak, -0.12),
      );
      g.poly([-w * 0.48, -h * 0.05, w * 0.48, -h * 0.05, w * 0.32, -h * 0.38, -w * 0.32, -h * 0.38]).fill(
        shade(cloak, -0.22),
      );

      // team-colored dress
      g.poly([-w * 0.4, -h * 0.12, w * 0.4, -h * 0.12, w * 0.26, -h * 0.5, -w * 0.26, -h * 0.5]).fill(
        dress,
      );
      g.rect(-w * 0.28, -h * 0.18, w * 0.56, h * 0.05).fill(shade(dress, -0.2));

      // dark gray corset
      g.roundRect(-w * 0.2, -h * 0.46, w * 0.4, h * 0.2, h * 0.04).fill(darkTop);

      // golden belt with skull buckle
      g.rect(-w * 0.36, -h * 0.18, w * 0.72, h * 0.055).fill(gold);
      g.circle(0, -h * 0.155, h * 0.042).fill(BONE);
      g.circle(-h * 0.022, -h * 0.152, h * 0.01).fill(DARK_EYE);
      g.circle(h * 0.022, -h * 0.152, h * 0.01).fill(DARK_EYE);

      // violet cloak panels
      g.poly([-w * 0.56, -h * 0.06, -w * 0.44, -h * 0.58, -w * 0.16, -h * 0.52, -w * 0.26, -h * 0.1]).fill(
        cloak,
      );
      g.poly([w * 0.56, -h * 0.06, w * 0.44, -h * 0.58, w * 0.16, -h * 0.52, w * 0.26, -h * 0.1]).fill(
        cloak,
      );
      g.poly([-w * 0.18, -h * 0.52, w * 0.18, -h * 0.52, 0, -h * 0.68]).fill(shade(cloak, -0.08));

      // golden skull pauldrons
      g.circle(-w * 0.44, -h * 0.4, h * 0.078).fill(gold);
      g.circle(-w * 0.44, -h * 0.4, h * 0.052).fill(BONE);
      g.circle(-w * 0.455, -h * 0.408, h * 0.012).fill(DARK_EYE);
      g.circle(-w * 0.425, -h * 0.408, h * 0.012).fill(DARK_EYE);
      g.circle(w * 0.44, -h * 0.4, h * 0.078).fill(gold);
      g.circle(w * 0.44, -h * 0.4, h * 0.052).fill(BONE);
      g.circle(w * 0.425, -h * 0.408, h * 0.012).fill(DARK_EYE);
      g.circle(w * 0.455, -h * 0.408, h * 0.012).fill(DARK_EYE);

      // golden armlets
      g.rect(-w * 0.5, -h * 0.36, w * 0.11, h * 0.045).fill(gold);
      g.rect(w * 0.39, -h * 0.36, w * 0.11, h * 0.045).fill(gold);

      // head and face
      g.circle(0, -h * 0.6, h * 0.125).fill(SKIN);
      g.ellipse(0, -h * 0.535, h * 0.032, h * 0.016).fill(purpleLip);
      // glowing pink eyes
      g.circle(-h * 0.042, -h * 0.62, h * 0.026).fill(pinkEye);
      g.circle(h * 0.042, -h * 0.62, h * 0.026).fill(pinkEye);
      g.circle(-h * 0.042, -h * 0.62, h * 0.01).fill(0xffffff);
      g.circle(h * 0.042, -h * 0.62, h * 0.01).fill(0xffffff);

      // witch hat — same color as the team dress
      g.ellipse(0, -h * 0.695, h * 0.19, h * 0.045).fill(shade(dress, -0.15));
      g.poly([-h * 0.15, -h * 0.71, h * 0.15, -h * 0.71, h * 0.04, -h * 1.08, -h * 0.04, -h * 1.08]).fill(
        dress,
      );
      g.poly([-h * 0.04, -h * 0.78, h * 0.04, -h * 0.78, 0, -h * 1.08]).fill(shade(dress, -0.22));

      // staff with ram skull and golden horns
      g.rect(w * 0.46, -h * 0.68, h * 0.038, h * 0.68).fill(WOOD);
      g.ellipse(w * 0.48, -h * 0.76, h * 0.095, h * 0.075).fill(BONE);
      g.circle(w * 0.44, -h * 0.76, h * 0.016).fill(DARK_EYE);
      g.circle(w * 0.52, -h * 0.76, h * 0.016).fill(DARK_EYE);
      g.poly([w * 0.4, -h * 0.8, w * 0.36, -h * 0.94, w * 0.46, -h * 0.82]).fill(gold);
      g.poly([w * 0.56, -h * 0.8, w * 0.6, -h * 0.94, w * 0.5, -h * 0.82]).fill(gold);
      // pink energy orb on staff (attack glow hint)
      g.circle(w * 0.48, -h * 0.76, h * 0.028).fill({ color: pinkEye, alpha: 0.55 });
      break;
    }

    case 'knight': {
      const swing = opts?.swing ?? 0;
      const slash = Math.max(0, swing) ** 2;
      const teamColor = team !== undefined ? TEAM_COLOR[team] : 0x3b7dd8;
      const w = h * 0.52;
      const gold = body;
      const goldDark = shade(body, -0.28);
      const goldLight = shade(body, 0.2);
      const steel = hexToNum(accentHex);
      const steelDark = shade(accentHex, -0.35);
      const steelLight = shade(accentHex, 0.18);
      const leather = 0x5c3d24;
      const boot = 0x3a2818;

      g.roundRect(-w * 0.28, -h * 0.24, w * 0.22, h * 0.24, h * 0.03).fill(steelDark);
      g.roundRect(w * 0.06, -h * 0.24, w * 0.22, h * 0.24, h * 0.03).fill(steelDark);
      g.roundRect(-w * 0.3, -h * 0.07, w * 0.26, h * 0.07, h * 0.015).fill(boot);
      g.roundRect(w * 0.04, -h * 0.07, w * 0.26, h * 0.07, h * 0.015).fill(boot);

      g.poly([-w * 0.46, -h * 0.18, w * 0.46, -h * 0.18, w * 0.3, -h * 0.52, -w * 0.3, -h * 0.52]).fill(
        teamColor,
      );
      g.poly([-w * 0.34, -h * 0.2, w * 0.34, -h * 0.2, w * 0.22, -h * 0.48, -w * 0.22, -h * 0.48]).fill(
        shade(teamColor, 0.12),
      );
      g.rect(-w * 0.32, -h * 0.2, w * 0.64, h * 0.035).fill(gold);
      g.rect(-w * 0.18, -h * 0.22, w * 0.36, h * 0.06).fill(steel);

      g.roundRect(-w * 0.36, -h * 0.74, w * 0.72, h * 0.28, h * 0.07).fill(gold);
      g.roundRect(-w * 0.3, -h * 0.72, w * 0.6, h * 0.22, h * 0.05).fill(goldLight);
      g.roundRect(-w * 0.14, -h * 0.72, w * 0.28, h * 0.2, h * 0.04).fill(steelLight);
      g.rect(-w * 0.04, -h * 0.72, w * 0.08, h * 0.18).fill(goldDark);

      g.rect(-w * 0.36, -h * 0.48, w * 0.72, h * 0.05).fill(leather);
      g.rect(-w * 0.06, -h * 0.49, w * 0.12, h * 0.07).fill(gold);
      g.circle(0, -h * 0.455, h * 0.022).fill(goldDark);

      g.circle(-w * 0.42, -h * 0.68, h * 0.1).fill(steel);
      g.circle(-w * 0.42, -h * 0.68, h * 0.065).fill(steelLight);
      g.circle(w * 0.42, -h * 0.68, h * 0.1).fill(steel);
      g.circle(w * 0.42, -h * 0.68, h * 0.065).fill(steelLight);
      g.circle(-w * 0.42, -h * 0.68, h * 0.11).stroke({ width: h * 0.014, color: gold });
      g.circle(w * 0.42, -h * 0.68, h * 0.11).stroke({ width: h * 0.014, color: gold });

      g.roundRect(-w * 0.56, -h * 0.66, w * 0.14, h * 0.08, h * 0.02).fill(steel);
      g.roundRect(-w * 0.62, -h * 0.82, w * 0.28, h * 0.34, h * 0.05).fill(teamColor);
      g.roundRect(-w * 0.62, -h * 0.82, w * 0.28, h * 0.34, h * 0.05).stroke({
        width: h * 0.018,
        color: gold,
      });
      g.circle(-w * 0.48, -h * 0.65, h * 0.045).fill(gold);
      g.poly([
        -w * 0.48, -h * 0.78,
        -w * 0.54, -h * 0.72,
        -w * 0.48, -h * 0.66,
        -w * 0.42, -h * 0.72,
      ]).fill(goldLight);

      const armLean = slash * h * 0.06;
      g.roundRect(w * 0.38 + armLean, -h * 0.68, w * 0.16, h * 0.08, h * 0.02).fill(steel);
      g.circle(w * 0.5 + armLean, -h * 0.64, h * 0.042).fill(SKIN);

      const handX = w * 0.5 + armLean;
      const handY = -h * 0.64;
      const swordAngle = -2.35 + slash * 2.05;
      const swordLen = h * 0.58;
      const tipX = handX + Math.cos(swordAngle) * swordLen;
      const tipY = handY + Math.sin(swordAngle) * swordLen;
      const perpX = Math.cos(swordAngle + Math.PI / 2) * h * 0.018;
      const perpY = Math.sin(swordAngle + Math.PI / 2) * h * 0.018;

      if (slash > 0.08) {
        const trailAlpha = slash * 0.55;
        g.moveTo(handX, handY)
          .lineTo(tipX, tipY)
          .stroke({ width: h * 0.05, color: 0xffffff, alpha: trailAlpha * 0.35 });
        g.arc(handX, handY, h * 0.38, swordAngle - 0.55, swordAngle + 0.35).stroke({
          width: h * 0.028,
          color: 0xe8f4ff,
          alpha: trailAlpha,
        });
      }

      g.poly([
        handX + perpX, handY + perpY,
        handX - perpX, handY - perpY,
        tipX - perpX * 0.35, tipY - perpY * 0.35,
        tipX, tipY,
        tipX + perpX * 0.35, tipY + perpY * 0.35,
      ]).fill(steelLight);
      g.poly([
        tipX, tipY,
        tipX - Math.cos(swordAngle) * h * 0.1 - perpX, tipY - Math.sin(swordAngle) * h * 0.1 - perpY,
        tipX - Math.cos(swordAngle) * h * 0.1 + perpX, tipY - Math.sin(swordAngle) * h * 0.1 + perpY,
      ]).fill(0xffffff);
      g.poly([
        handX + Math.cos(swordAngle + Math.PI / 2) * h * 0.07,
        handY + Math.sin(swordAngle + Math.PI / 2) * h * 0.07,
        handX + Math.cos(swordAngle - Math.PI / 2) * h * 0.07,
        handY + Math.sin(swordAngle - Math.PI / 2) * h * 0.07,
        handX + Math.cos(swordAngle) * h * 0.04 - Math.cos(swordAngle + Math.PI / 2) * h * 0.05,
        handY + Math.sin(swordAngle) * h * 0.04 - Math.sin(swordAngle + Math.PI / 2) * h * 0.05,
        handX + Math.cos(swordAngle) * h * 0.04 + Math.cos(swordAngle + Math.PI / 2) * h * 0.05,
        handY + Math.sin(swordAngle) * h * 0.04 + Math.sin(swordAngle + Math.PI / 2) * h * 0.05,
      ]).fill(gold);
      g.poly([
        handX + Math.cos(swordAngle) * h * 0.05 + perpX * 1.4,
        handY + Math.sin(swordAngle) * h * 0.05 + perpY * 1.4,
        handX + Math.cos(swordAngle) * h * 0.05 - perpX * 1.4,
        handY + Math.sin(swordAngle) * h * 0.05 - perpY * 1.4,
        handX - Math.cos(swordAngle) * h * 0.05 - perpX * 1.4,
        handY - Math.sin(swordAngle) * h * 0.05 - perpY * 1.4,
        handX - Math.cos(swordAngle) * h * 0.05 + perpX * 1.4,
        handY - Math.sin(swordAngle) * h * 0.05 + perpY * 1.4,
      ]).fill(leather);

      g.roundRect(-w * 0.16, -h * 0.96, w * 0.32, h * 0.22, h * 0.06).fill(steel);
      g.roundRect(-w * 0.12, -h * 0.94, w * 0.24, h * 0.16, h * 0.04).fill(steelLight);
      g.roundRect(-w * 0.1, -h * 0.9, w * 0.2, h * 0.05, h * 0.015).fill(0x2a2218);
      g.circle(-h * 0.035, -h * 0.875, h * 0.012).fill(0x4a6080);
      g.circle(h * 0.035, -h * 0.875, h * 0.012).fill(0x4a6080);
      g.rect(-w * 0.16, -h * 0.96, w * 0.32, h * 0.035).fill(gold);
      g.roundRect(-w * 0.14, -h * 0.82, w * 0.1, h * 0.06, h * 0.02).fill(steelDark);
      g.roundRect(w * 0.04, -h * 0.82, w * 0.1, h * 0.06, h * 0.02).fill(steelDark);
      g.poly([
        0, -h * 0.98,
        h * 0.05, -h * 1.12,
        h * 0.01, -h * 1.06,
        -h * 0.03, -h * 1.16,
        -h * 0.02, -h * 1.02,
      ]).fill(teamColor);
      g.poly([0, -h * 0.98, h * 0.03, -h * 1.08, -h * 0.01, -h * 1.04]).fill(shade(teamColor, 0.25));
      break;
    }

    case 'minipekka': {
      const swing = opts?.swing ?? 0;
      const slash = Math.max(0, swing) ** 2;
      const w = h * 0.5;
      g.rect(-w * 0.3, -h * 0.22, w * 0.26, h * 0.22).fill(shade(body, -0.2));
      g.rect(w * 0.04, -h * 0.22, w * 0.26, h * 0.22).fill(shade(body, -0.2));
      g.roundRect(-w * 0.42, -h * 0.7, w * 0.84, h * 0.5, h * 0.08).fill(body);
      g.circle(-w * 0.46, -h * 0.64, h * 0.11).fill(shade(body, 0.2));
      g.circle(w * 0.46, -h * 0.64, h * 0.11).fill(shade(body, 0.2));
      g.poly([-h * 0.17, -h * 0.68, h * 0.17, -h * 0.68, h * 0.13, -h * 0.94, -h * 0.13, -h * 0.94]).fill(
        shade(body, 0.14),
      );
      g.rect(-h * 0.13, -h * 0.84, h * 0.26, h * 0.055).fill(accent);
      g.poly([-h * 0.14, -h * 0.94, -h * 0.05, -h * 0.94, -h * 0.1, -h * 1.14]).fill(shade(body, 0.14));
      g.poly([h * 0.14, -h * 0.94, h * 0.05, -h * 0.94, h * 0.1, -h * 1.14]).fill(shade(body, 0.14));
      const armLean = slash * h * 0.05;
      g.roundRect(w * 0.34 + armLean, -h * 0.66, w * 0.14, h * 0.08, h * 0.02).fill(shade(body, -0.15));
      drawPekkaBladeSwing(g, w * 0.5 + armLean, -h * 0.62, h, w, swing, accent, 'mini');
      break;
    }

    case 'archer': {
      const w = h * 0.46;
      g.poly([-w * 0.5, 0, w * 0.5, 0, w * 0.3, -h * 0.5, -w * 0.3, -h * 0.5]).fill(body);
      g.roundRect(-w * 0.28, -h * 0.7, w * 0.56, h * 0.24, h * 0.05).fill(shade(body, 0.12));
      g.circle(0, -h * 0.79, h * 0.13).fill(SKIN);
      g.ellipse(-h * 0.02, -h * 0.85, h * 0.16, h * 0.12).fill(accent);
      g.ellipse(-h * 0.13, -h * 0.72, h * 0.06, h * 0.12).fill(accent);
      g.circle(-h * 0.045, -h * 0.79, h * 0.02).fill(DARK_EYE);
      g.circle(h * 0.05, -h * 0.79, h * 0.02).fill(DARK_EYE);
      g.ellipse(w * 0.62, -h * 0.55, h * 0.05, h * 0.3).stroke({ width: h * 0.045, color: WOOD });
      g.moveTo(w * 0.62, -h * 0.85).lineTo(w * 0.62, -h * 0.25).stroke({ width: h * 0.02, color: 0xe8e2d0 });
      break;
    }

    case 'musketeer': {
      const w = h * 0.46;
      g.poly([-w * 0.52, 0, w * 0.52, 0, w * 0.32, -h * 0.48, -w * 0.32, -h * 0.48]).fill(body);
      g.roundRect(-w * 0.3, -h * 0.7, w * 0.6, h * 0.25, h * 0.05).fill(shade(body, 0.14));
      g.rect(-w * 0.32, -h * 0.56, w * 0.64, h * 0.05).fill(accent);
      g.circle(0, -h * 0.79, h * 0.13).fill(SKIN);
      g.ellipse(h * 0.1, -h * 0.72, h * 0.09, h * 0.14).fill(0xb8622f);
      g.ellipse(0, -h * 0.88, h * 0.19, h * 0.06).fill(accent);
      g.ellipse(-h * 0.02, -h * 0.92, h * 0.11, h * 0.07).fill(accent);
      g.circle(-h * 0.05, -h * 0.79, h * 0.02).fill(DARK_EYE);
      g.circle(h * 0.04, -h * 0.79, h * 0.02).fill(DARK_EYE);
      g.rect(-w * 0.15, -h * 0.72, h * 0.72, h * 0.05).fill(0x4a3626);
      g.rect(h * 0.4, -h * 0.735, h * 0.2, h * 0.05).fill(STEEL);
      break;
    }

    case 'hogrider': {
      const swing = opts?.swing ?? 0;
      const w = h * 0.56;
      g.ellipse(0, -h * 0.24, w * 0.52, h * 0.2).fill(shade(accentHex, 0.1));
      g.rect(-w * 0.36, -h * 0.16, w * 0.12, h * 0.16).fill(shade(accentHex, -0.2));
      g.rect(w * 0.22, -h * 0.16, w * 0.12, h * 0.16).fill(shade(accentHex, -0.2));
      g.circle(-w * 0.5, -h * 0.3, h * 0.13).fill(shade(accentHex, 0.16));
      g.poly([-w * 0.58, -h * 0.4, -w * 0.46, -h * 0.4, -w * 0.53, -h * 0.52]).fill(shade(accentHex, -0.1));
      g.circle(-w * 0.56, -h * 0.28, h * 0.022).fill(DARK_EYE);
      g.rect(-w * 0.34, -h * 0.56, w * 0.36, h * 0.24).fill(body);
      g.circle(-w * 0.16, -h * 0.68, h * 0.135).fill(0x7a4a28);
      g.ellipse(-w * 0.16, -h * 0.75, h * 0.16, h * 0.09).fill(0x2b2118);
      g.circle(-w * 0.2, -h * 0.68, h * 0.02).fill(DARK_EYE);
      g.circle(-w * 0.11, -h * 0.68, h * 0.02).fill(DARK_EYE);
      drawHammerSwing(g, w * 0.04, -h * 0.86, h, swing, WOOD, STEEL);
      break;
    }

    case 'prince': {
      const animT = opts?.animT ?? 0;
      const charging = !!opts?.charging;
      const swing = opts?.swing ?? 0;
      const teamColor = team !== undefined ? TEAM_COLOR[team] : 0x3b7dd8;
      const horse = hexToNum(accentHex);
      const horseDark = shade(horse, -0.28);
      const horseLight = shade(horse, 0.12);
      const gold = body;
      const goldDark = shade(body, -0.32);
      const goldLight = shade(body, 0.18);
      const gallop = charging ? animT * 13 : animT * 4.2;
      const legLift = Math.sin(gallop) * h * 0.09;
      const legLift2 = Math.sin(gallop + Math.PI) * h * 0.09;
      const w = h * 0.58;

      // shadow hooves / legs (back pair)
      g.roundRect(-w * 0.34 + legLift2 * 0.3, -h * 0.22, w * 0.11, h * 0.22, h * 0.03).fill(horseDark);
      g.roundRect(-w * 0.1 + legLift * 0.3, -h * 0.22, w * 0.11, h * 0.22, h * 0.03).fill(horseDark);
      // front legs
      g.roundRect(w * 0.14 - legLift * 0.3, -h * 0.22, w * 0.11, h * 0.22, h * 0.03).fill(horseDark);
      g.roundRect(w * 0.38 - legLift2 * 0.3, -h * 0.22, w * 0.11, h * 0.22, h * 0.03).fill(horseDark);
      // hooves
      g.roundRect(-w * 0.34 + legLift2 * 0.3, -h * 0.05, w * 0.12, h * 0.05, h * 0.015).fill(0x3a2a1c);
      g.roundRect(-w * 0.1 + legLift * 0.3, -h * 0.05, w * 0.12, h * 0.05, h * 0.015).fill(0x3a2a1c);
      g.roundRect(w * 0.14 - legLift * 0.3, -h * 0.05, w * 0.12, h * 0.05, h * 0.015).fill(0x3a2a1c);
      g.roundRect(w * 0.38 - legLift2 * 0.3, -h * 0.05, w * 0.12, h * 0.05, h * 0.015).fill(0x3a2a1c);

      // horse body — compact shetland pony
      g.ellipse(-w * 0.02, -h * 0.38, w * 0.52, h * 0.19).fill(horse);
      g.ellipse(-w * 0.06, -h * 0.4, w * 0.38, h * 0.12).fill(horseLight);
      // belly shadow
      g.ellipse(-w * 0.02, -h * 0.3, w * 0.4, h * 0.08).fill(horseDark);

      // tail
      g.poly([
        -w * 0.48, -h * 0.36,
        -w * 0.62, -h * 0.28,
        -w * 0.56, -h * 0.44,
        -w * 0.46, -h * 0.42,
      ]).fill(horseDark);

      // horse neck + head
      g.ellipse(w * 0.38, -h * 0.44, w * 0.16, h * 0.13).fill(horse);
      g.circle(w * 0.5, -h * 0.5, h * 0.11).fill(horseLight);
      g.circle(w * 0.54, -h * 0.51, h * 0.018).fill(DARK_EYE);
      // muzzle
      g.ellipse(w * 0.58, -h * 0.47, h * 0.05, h * 0.035).fill(horseLight);
      g.circle(w * 0.61, -h * 0.465, h * 0.012).fill(horseDark);
      // mane
      g.poly([
        w * 0.28, -h * 0.48,
        w * 0.22, -h * 0.62,
        w * 0.34, -h * 0.54,
        w * 0.36, -h * 0.44,
      ]).fill(horseDark);
      g.poly([
        w * 0.24, -h * 0.52,
        w * 0.18, -h * 0.66,
        w * 0.3, -h * 0.58,
      ]).fill(horseDark);

      // team-colored bridle + reins
      g.moveTo(w * 0.5, -h * 0.52)
        .lineTo(w * 0.08, -h * 0.58)
        .stroke({ width: h * 0.018, color: teamColor });
      g.arc(w * 0.52, -h * 0.48, h * 0.07, -0.5, 1.2).stroke({ width: h * 0.016, color: teamColor });

      // saddle blanket (team color)
      g.roundRect(-w * 0.18, -h * 0.52, w * 0.36, h * 0.12, h * 0.03).fill(teamColor);
      g.roundRect(-w * 0.14, -h * 0.5, w * 0.28, h * 0.07, h * 0.02).fill(shade(teamColor, 0.15));
      // saddle horn / seat
      g.roundRect(-w * 0.1, -h * 0.58, w * 0.2, h * 0.08, h * 0.025).fill(goldDark);

      // rider legs / stirrups
      g.rect(-w * 0.08, -h * 0.58, w * 0.07, h * 0.18).fill(goldDark);
      g.rect(w * 0.02, -h * 0.58, w * 0.07, h * 0.18).fill(goldDark);
      g.rect(-w * 0.1, -h * 0.42, w * 0.1, h * 0.04).fill(0x3a2a1c);
      g.rect(w * 0.0, -h * 0.42, w * 0.1, h * 0.04).fill(0x3a2a1c);

      // armored torso
      g.roundRect(-w * 0.16, -h * 0.78, w * 0.32, h * 0.24, h * 0.06).fill(gold);
      g.roundRect(-w * 0.12, -h * 0.76, w * 0.24, h * 0.18, h * 0.04).fill(goldLight);
      // chest plate ridge
      g.rect(-w * 0.04, -h * 0.76, w * 0.08, h * 0.16).fill(goldDark);
      // belt (team color)
      g.rect(-w * 0.16, -h * 0.58, w * 0.32, h * 0.05).fill(teamColor);
      g.rect(-w * 0.04, -h * 0.57, w * 0.08, h * 0.07).fill(shade(teamColor, -0.2));

      // pauldrons
      g.circle(-w * 0.2, -h * 0.74, h * 0.07).fill(gold);
      g.circle(w * 0.2, -h * 0.74, h * 0.07).fill(gold);
      g.circle(-w * 0.2, -h * 0.74, h * 0.04).fill(goldLight);
      g.circle(w * 0.2, -h * 0.74, h * 0.04).fill(goldLight);

      // arm holding lance
      g.roundRect(w * 0.08, -h * 0.72, w * 0.14, h * 0.06, h * 0.02).fill(gold);
      g.circle(w * 0.2, -h * 0.69, h * 0.045).fill(SKIN);

      // lance angle: upright when walking, forward when charging/attacking
      const thrust = Math.max(0, swing) ** 2;
      const lanceAngle = charging
        ? -0.12 - thrust * 0.35
        : thrust > 0
          ? -0.35 - thrust * 0.55
          : -1.05;
      const lanceLen = h * 0.88;
      const handX = w * 0.18;
      const handY = -h * 0.7;
      const tipX = handX + Math.cos(lanceAngle) * lanceLen;
      const tipY = handY + Math.sin(lanceAngle) * lanceLen;
      const perpX = Math.cos(lanceAngle + Math.PI / 2) * h * 0.022;
      const perpY = Math.sin(lanceAngle + Math.PI / 2) * h * 0.022;

      // lance shaft with team-color stripes
      g.poly([
        handX + perpX, handY + perpY,
        handX - perpX, handY - perpY,
        tipX - perpX, tipY - perpY,
        tipX + perpX, tipY + perpY,
      ]).fill(0xe8e2d0);
      const stripeN = 5;
      for (let i = 1; i < stripeN; i++) {
        const t = i / stripeN;
        const sx = handX + (tipX - handX) * t;
        const sy = handY + (tipY - handY) * t;
        const c = i % 2 === 0 ? teamColor : 0xe8e2d0;
        g.moveTo(sx + perpX, sy + perpY)
          .lineTo(sx - perpX, sy - perpY)
          .stroke({ width: h * 0.038, color: c });
      }
      // lance tip
      g.poly([
        tipX, tipY,
        tipX - Math.cos(lanceAngle) * h * 0.12 - perpX * 1.4, tipY - Math.sin(lanceAngle) * h * 0.12 - perpY * 1.4,
        tipX - Math.cos(lanceAngle) * h * 0.12 + perpX * 1.4, tipY - Math.sin(lanceAngle) * h * 0.12 + perpY * 1.4,
      ]).fill(STEEL);
      // ribbon on lance base
      g.circle(handX, handY, h * 0.035).fill(teamColor);

      // helmet
      g.roundRect(-w * 0.14, -h * 0.96, w * 0.28, h * 0.2, h * 0.06).fill(gold);
      g.roundRect(-w * 0.1, -h * 0.94, w * 0.2, h * 0.14, h * 0.04).fill(goldLight);
      // visor slit
      g.roundRect(-w * 0.08, -h * 0.9, w * 0.16, h * 0.04, h * 0.015).fill(0x2a2218);
      // helmet crest ridge
      g.poly([-w * 0.06, -h * 0.98, w * 0.06, -h * 0.98, 0, -h * 1.04]).fill(goldDark);
      // team feather plume
      g.poly([
        0, -h * 1.04,
        h * 0.04, -h * 1.18,
        -h * 0.02, -h * 1.14,
        h * 0.02, -h * 1.22,
        -h * 0.04, -h * 1.08,
      ]).fill(teamColor);
      g.poly([
        0, -h * 1.04,
        h * 0.03, -h * 1.12,
        -h * 0.01, -h * 1.1,
      ]).fill(shade(teamColor, 0.25));

      // goatee + mustache below visor
      g.ellipse(0, -h * 0.84, h * 0.055, h * 0.04).fill(horseDark);
      g.ellipse(-h * 0.04, -h * 0.855, h * 0.035, h * 0.018).fill(horseDark);
      g.ellipse(h * 0.04, -h * 0.855, h * 0.035, h * 0.018).fill(horseDark);

      // charge dust puffs
      if (charging) {
        const dust = shade(horse, 0.3);
        g.circle(-w * 0.5 + Math.sin(animT * 16) * h * 0.04, -h * 0.06, h * 0.035).fill({
          color: dust,
          alpha: 0.45,
        });
        g.circle(-w * 0.62, -h * 0.04, h * 0.025).fill({ color: dust, alpha: 0.3 });
      }
      break;
    }

    case 'minion': {
      drawSingleMinionAt(g, h, bodyHex, accentHex, 0, 0, opts?.swing ?? 0);
      break;
    }

    case 'minions': {
      // Card icon: trio of minions (arena units render as single minion).
      const deckLayout = opts?.swarmScale !== undefined;
      const memberBoost = opts?.swarmScale ?? 1;
      const trio: Array<[number, number, number]> = deckLayout
        ? [
            [-0.28, 0.04, 0.72 * memberBoost],
            [0.28, 0.04, 0.72 * memberBoost],
            [0, -0.12, 0.8 * memberBoost],
          ]
        : [
            [-0.36, 0.06, 0.52],
            [0.36, 0.06, 0.52],
            [0, -0.16, 0.58],
          ];
      for (const [ox, oy, sc] of trio) {
        drawSingleMinionAt(g, h * sc, bodyHex, accentHex, ox * h, oy * h);
      }
      break;
    }

    case 'babydragon': {
      g.poly([-h * 0.16, -h * 0.6, -h * 0.72, -h * 0.9, -h * 0.62, -h * 0.42, -h * 0.14, -h * 0.38]).fill(
        shade(body, -0.24),
      );
      g.poly([h * 0.16, -h * 0.6, h * 0.72, -h * 0.9, h * 0.62, -h * 0.42, h * 0.14, -h * 0.38]).fill(
        shade(body, -0.24),
      );
      g.ellipse(0, -h * 0.44, h * 0.25, h * 0.27).fill(body);
      g.ellipse(0, -h * 0.4, h * 0.15, h * 0.19).fill(shade(body, 0.32));
      g.circle(0, -h * 0.74, h * 0.22).fill(shade(body, 0.1));
      g.ellipse(h * 0.1, -h * 0.7, h * 0.16, h * 0.1).fill(shade(body, 0.2));
      g.poly([-h * 0.16, -h * 0.86, -h * 0.06, -h * 0.86, -h * 0.13, -h * 1.02]).fill(accent);
      g.poly([h * 0.16, -h * 0.86, h * 0.06, -h * 0.86, h * 0.13, -h * 1.02]).fill(accent);
      g.circle(-h * 0.05, -h * 0.78, h * 0.032).fill(DARK_EYE);
      g.circle(h * 0.09, -h * 0.78, h * 0.032).fill(DARK_EYE);
      g.circle(h * 0.24, -h * 0.68, h * 0.06).fill(accent);
      break;
    }

    case 'cannon': {
      const w = h * 0.62;
      g.roundRect(-w * 0.5, -h * 0.3, w, h * 0.3, h * 0.05).fill(hexToNum(accentHex));
      g.rect(-w * 0.5, -h * 0.3, w, h * 0.06).fill(shade(accentHex, 0.2));
      g.circle(-w * 0.3, -h * 0.12, h * 0.1).fill(shade(accentHex, -0.3));
      g.circle(w * 0.3, -h * 0.12, h * 0.1).fill(shade(accentHex, -0.3));
      g.roundRect(-w * 0.24, -h * 0.72, w * 0.48, h * 0.44, h * 0.1).fill(body);
      g.rect(-w * 0.1, -h * 0.9, w * 0.2, h * 0.34).fill(shade(body, 0.14));
      g.circle(0, -h * 0.9, w * 0.11).fill(shade(body, -0.35));
      g.circle(0, -h * 0.52, h * 0.07).fill(shade(body, -0.3));
      break;
    }

    case 'tesla': {
      const w = h * 0.58;
      const wood = hexToNum(accentHex);
      const metal = body;
      const teamColor = team !== undefined ? TEAM_COLOR[team] : 0x3b7dd8;
      const coil = 0x5ce1ff;

      // wooden base platform
      g.roundRect(-w * 0.5, -h * 0.12, w, h * 0.12, h * 0.03).fill(wood);
      g.rect(-w * 0.5, -h * 0.12, w, h * 0.03).fill(shade(wood, 0.12));

      // lattice pillars with team-colored supports
      g.rect(-w * 0.38, -h * 0.72, w * 0.1, h * 0.62).fill(wood);
      g.rect(w * 0.28, -h * 0.72, w * 0.1, h * 0.62).fill(wood);
      g.rect(-w * 0.42, -h * 0.58, w * 0.06, h * 0.14).fill(teamColor);
      g.rect(w * 0.36, -h * 0.58, w * 0.06, h * 0.14).fill(teamColor);
      g.rect(-w * 0.42, -h * 0.32, w * 0.06, h * 0.14).fill(teamColor);
      g.rect(w * 0.36, -h * 0.32, w * 0.06, h * 0.14).fill(teamColor);

      // cross braces on lattice
      g.moveTo(-w * 0.33, -h * 0.68)
        .lineTo(w * 0.33, -h * 0.2)
        .stroke({ width: h * 0.025, color: shade(wood, -0.2) });
      g.moveTo(w * 0.33, -h * 0.68)
        .lineTo(-w * 0.33, -h * 0.2)
        .stroke({ width: h * 0.025, color: shade(wood, -0.2) });

      // coiled wire on pillar
      for (let i = 0; i < 4; i++) {
        const wy = -h * (0.22 + i * 0.1);
        g.ellipse(-w * 0.33, wy, h * 0.045, h * 0.022).stroke({ width: h * 0.014, color: metal });
      }

      // metal coil housing
      g.roundRect(-w * 0.22, -h * 0.82, w * 0.44, h * 0.22, h * 0.05).fill(metal);
      g.circle(0, -h * 0.88, h * 0.11).fill(shade(metal, 0.15));
      g.poly([-h * 0.06, -h * 0.88, h * 0.06, -h * 0.88, 0, -h * 1.02]).fill(coil);
      g.circle(0, -h * 0.88, h * 0.045).fill({ color: coil, alpha: 0.65 });

      // lightning bolt emblem on coil
      g.poly([
        -h * 0.018, -h * 0.92,
        h * 0.018, -h * 0.92,
        h * 0.006, -h * 0.86,
        h * 0.024, -h * 0.86,
        -h * 0.006, -h * 0.8,
        -h * 0.018, -h * 0.86,
        0, -h * 0.86,
      ]).fill(0xfffbe0);
      break;
    }

    case 'tombstone': {
      const w = h * 0.5;
      g.roundRect(-w * 0.55, -h * 0.08, w * 1.1, h * 0.08, h * 0.02).fill(shade(body, -0.25));
      g.roundRect(-w * 0.38, -h * 0.72, w * 0.76, h * 0.66, h * 0.06).fill(body);
      g.roundRect(-w * 0.32, -h * 0.66, w * 0.64, h * 0.54, h * 0.04).fill(shade(body, 0.1));
      g.roundRect(-w * 0.38, -h * 0.72, w * 0.76, h * 0.1, h * 0.03).fill(shade(body, -0.15));
      g.circle(0, -h * 0.48, h * 0.12).fill(hexToNum(accentHex));
      g.circle(-h * 0.04, -h * 0.5, h * 0.025).fill(DARK_EYE);
      g.circle(h * 0.04, -h * 0.5, h * 0.025).fill(DARK_EYE);
      g.rect(-h * 0.02, -h * 0.42, h * 0.04, h * 0.06).fill(shade(accentHex, -0.2));
      break;
    }

    case 'fireball': {
      g.circle(0, -h * 0.5, h * 0.34).fill(body);
      g.circle(-h * 0.05, -h * 0.55, h * 0.21).fill(accent);
      g.circle(-h * 0.08, -h * 0.58, h * 0.1).fill(0xfff3c0);
      g.poly([h * 0.2, -h * 0.7, h * 0.62, -h * 0.94, h * 0.3, -h * 0.5]).fill(accent);
      g.poly([h * 0.24, -h * 0.4, h * 0.66, -h * 0.42, h * 0.26, -h * 0.24]).fill(body);
      break;
    }

    case 'arrows': {
      for (let i = -1; i <= 1; i++) {
        const ox = i * h * 0.24;
        const oy = -h * 0.5 + Math.abs(i) * h * 0.08;
        g.rect(ox - h * 0.022, oy - h * 0.3, h * 0.044, h * 0.6).fill(body);
        g.poly([ox - h * 0.09, oy - h * 0.18, ox + h * 0.09, oy - h * 0.18, ox, oy - h * 0.38]).fill(
          hexToNum(accentHex),
        );
        g.poly([ox - h * 0.08, oy + h * 0.3, ox, oy + h * 0.16, ox + h * 0.08, oy + h * 0.3]).fill(
          shade(body, 0.3),
        );
      }
      break;
    }

    case 'zap': {
      g.circle(0, -h * 0.5, h * 0.32).fill({ color: body, alpha: 0.5 });
      g.poly([
        -h * 0.06, -h * 0.92,
        h * 0.2, -h * 0.92,
        h * 0.04, -h * 0.58,
        h * 0.24, -h * 0.58,
        -h * 0.12, -h * 0.08,
        h * 0.0, -h * 0.46,
        -h * 0.2, -h * 0.46,
      ]).fill(accent);
      break;
    }

    case 'goblin_barrel': {
      drawGoblinBarrel(g, h, bodyHex, accentHex);
      break;
    }

    case 'balloon': {
      const w = h * 0.58;
      g.ellipse(0, -h * 0.58, w * 0.52, h * 0.44).fill(body);
      g.ellipse(-w * 0.14, -h * 0.64, w * 0.2, h * 0.26).fill(shade(body, 0.15));
      g.ellipse(w * 0.12, -h * 0.52, w * 0.16, h * 0.2).fill(shade(body, -0.12));
      g.moveTo(-w * 0.1, -h * 0.2).lineTo(-w * 0.08, -h * 0.36).stroke({ width: h * 0.014, color: 0x3a3a3a });
      g.moveTo(w * 0.1, -h * 0.2).lineTo(w * 0.08, -h * 0.36).stroke({ width: h * 0.014, color: 0x3a3a3a });
      g.roundRect(-w * 0.24, -h * 0.22, w * 0.48, h * 0.18, h * 0.045).fill(hexToNum(accentHex));
      g.circle(-w * 0.09, -h * 0.13, h * 0.05).fill(0x2a2218);
      g.circle(w * 0.09, -h * 0.13, h * 0.05).fill(0x2a2218);
      g.roundRect(-w * 0.16, -h * 0.04, w * 0.32, h * 0.24, h * 0.055).fill(0x2a2218);
      g.circle(0, -h * 0.04, h * 0.13).fill(0x1a1a1a);
      g.circle(0, -h * 0.04, h * 0.08).fill({ color: 0xff6622, alpha: 0.8 });
      g.poly([0, -h * 0.11, -h * 0.045, 0, h * 0.045, 0]).fill(0xffaa44);
      break;
    }

    case 'rage': {
      const w = h * 0.4;
      const liquid = body;
      const liquidLight = accent;
      const liquidDark = shade(body, -0.22);
      const glass = 0xffffff;

      g.ellipse(0, -h * 0.36, w * 0.74, h * 0.3).fill(liquidDark);
      g.roundRect(-w * 0.52, -h * 0.72, w * 1.04, h * 0.4, w * 0.28).fill(liquid);
      g.ellipse(0, -h * 0.72, w * 0.44, h * 0.07).fill(liquidLight);
      g.ellipse(0, -h * 0.73, w * 0.34, h * 0.04).fill({ color: liquidLight, alpha: 0.55 });

      g.circle(-w * 0.22, -h * 0.5, h * 0.028).fill({ color: liquidLight, alpha: 0.65 });
      g.circle(w * 0.18, -h * 0.58, h * 0.022).fill({ color: 0xffffff, alpha: 0.4 });
      g.circle(w * 0.06, -h * 0.44, h * 0.018).fill({ color: liquidLight, alpha: 0.5 });
      g.circle(-w * 0.08, -h * 0.62, h * 0.015).fill({ color: 0xffffff, alpha: 0.35 });

      g.roundRect(-w * 0.2, -h * 0.84, w * 0.4, h * 0.16, w * 0.05).fill({ color: glass, alpha: 0.18 });
      g.roundRect(-w * 0.2, -h * 0.84, w * 0.4, h * 0.16, w * 0.05).stroke({
        width: h * 0.02,
        color: glass,
        alpha: 0.55,
      });

      g.roundRect(-w * 0.54, -h * 0.74, w * 1.08, h * 0.42, w * 0.3).stroke({
        width: h * 0.022,
        color: glass,
        alpha: 0.5,
      });
      g.ellipse(0, -h * 0.34, w * 0.78, h * 0.32).stroke({ width: h * 0.022, color: glass, alpha: 0.5 });

      g.moveTo(-w * 0.3, -h * 0.7)
        .lineTo(-w * 0.24, -h * 0.4)
        .stroke({ width: h * 0.028, color: 0xffffff, alpha: 0.5 });
      g.moveTo(w * 0.34, -h * 0.62)
        .lineTo(w * 0.3, -h * 0.48)
        .stroke({ width: h * 0.012, color: 0xffffff, alpha: 0.25 });

      g.roundRect(-w * 0.24, -h * 0.96, w * 0.48, h * 0.14, h * 0.03).fill(WOOD);
      g.rect(-w * 0.24, -h * 0.9, w * 0.48, h * 0.03).fill(shade(WOOD, 0.12));
      g.rect(-w * 0.24, -h * 0.84, w * 0.48, h * 0.025).fill(shade(WOOD, -0.15));
      break;
    }

    case 'freeze': {
      g.circle(0, -h * 0.5, h * 0.34).fill({ color: body, alpha: 0.45 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const len = i % 2 === 0 ? h * 0.38 : h * 0.22;
        g.moveTo(0, -h * 0.5)
          .lineTo(Math.cos(a - Math.PI / 2) * len, -h * 0.5 + Math.sin(a - Math.PI / 2) * len)
          .stroke({ width: h * 0.045, color: accent });
      }
      g.circle(0, -h * 0.5, h * 0.08).fill(0xffffff);
      break;
    }

    case 'xbow': {
      const swing = opts?.swing ?? 0;
      const recoil = Math.max(0, swing) ** 2;
      const w = h * 0.62;
      const wood = hexToNum(accentHex);
      const woodDark = shade(wood, -0.28);
      const metal = body;
      const metalDark = shade(body, -0.25);
      const bowPull = recoil * w * 0.08;
      const frameShake = recoil * h * 0.015;

      g.roundRect(-w * 0.54, -h * 0.11, w * 1.08, h * 0.11, h * 0.025).fill(wood);
      g.rect(-w * 0.54, -h * 0.11, w * 1.08, h * 0.025).fill(shade(wood, 0.12));
      g.circle(-w * 0.4, -h * 0.04, h * 0.048).fill(woodDark);
      g.circle(w * 0.4, -h * 0.04, h * 0.048).fill(woodDark);
      g.circle(-w * 0.4, -h * 0.04, h * 0.022).fill(shade(woodDark, 0.2));
      g.circle(w * 0.4, -h * 0.04, h * 0.022).fill(shade(woodDark, 0.2));

      g.roundRect(-w * 0.14, -h * 0.58 + frameShake, w * 0.28, h * 0.5, h * 0.035).fill(metal);
      g.roundRect(-w * 0.1, -h * 0.54 + frameShake, w * 0.2, h * 0.42, h * 0.025).fill(shade(metal, 0.12));
      g.rect(-w * 0.16, -h * 0.48 + frameShake, w * 0.32, h * 0.045).fill(metalDark);

      g.moveTo(-w * 0.14 - bowPull, -h * 0.56 + frameShake)
        .lineTo(-w * 0.48 - bowPull * 0.5, -h * 0.78 + frameShake)
        .lineTo(-w * 0.66 - bowPull * 0.35, -h * 0.5 + frameShake)
        .stroke({ width: h * 0.058, color: wood, cap: 'round', join: 'round' });
      g.moveTo(w * 0.14 + bowPull, -h * 0.56 + frameShake)
        .lineTo(w * 0.48 + bowPull * 0.5, -h * 0.78 + frameShake)
        .lineTo(w * 0.66 + bowPull * 0.35, -h * 0.5 + frameShake)
        .stroke({ width: h * 0.058, color: wood, cap: 'round', join: 'round' });
      g.moveTo(-w * 0.14 - bowPull, -h * 0.56 + frameShake)
        .lineTo(-w * 0.48 - bowPull * 0.5, -h * 0.78 + frameShake)
        .lineTo(-w * 0.66 - bowPull * 0.35, -h * 0.5 + frameShake)
        .stroke({ width: h * 0.038, color: woodDark, cap: 'round', join: 'round' });

      g.moveTo(-w * 0.62 - bowPull * 0.35, -h * 0.5 + frameShake)
        .lineTo(w * 0.62 + bowPull * 0.35, -h * 0.5 + frameShake)
        .stroke({ width: h * 0.014, color: 0xe8e2d0 });
      g.moveTo(-w * 0.58 - bowPull * 0.35, -h * 0.5 + frameShake)
        .lineTo(w * 0.58 + bowPull * 0.35, -h * 0.5 + frameShake)
        .stroke({ width: h * 0.028, color: STEEL });
      g.poly([w * 0.6, -h * 0.5, w * 0.72, -h * 0.54, w * 0.72, -h * 0.46]).fill(STEEL);
      g.poly([w * 0.6, -h * 0.5, w * 0.72, -h * 0.54, w * 0.72, -h * 0.46]).fill(shade(STEEL, 0.2));

      g.circle(0, -h * 0.62 + frameShake, h * 0.055).fill(metalDark);
      g.circle(0, -h * 0.62 + frameShake, h * 0.028).fill(shade(metal, 0.2));
      g.rect(-w * 0.04, -h * 0.68 + frameShake, w * 0.08, h * 0.12).fill(woodDark);
      if (recoil > 0.12) {
        g.moveTo(-w * 0.12, -h * 0.5 + frameShake)
          .lineTo(w * 0.12, -h * 0.5 + frameShake)
          .stroke({ width: h * 0.01, color: 0xffffff, alpha: recoil * 0.35 });
      }
      break;
    }

    case 'pekka': {
      const swing = opts?.swing ?? 0;
      const slash = Math.max(0, swing) ** 2;
      const w = h * 0.5;
      g.rect(-w * 0.32, -h * 0.28, w * 0.26, h * 0.28).fill(shade(body, -0.4));
      g.rect(w * 0.06, -h * 0.28, w * 0.26, h * 0.28).fill(shade(body, -0.4));
      g.roundRect(-w * 0.42, -h * 0.78, w * 0.84, h * 0.54, h * 0.1).fill(body);
      g.roundRect(-w * 0.34, -h * 0.72, w * 0.68, h * 0.42, h * 0.06).fill(shade(body, 0.12));
      g.rect(-w * 0.5, -h * 0.68, w * 0.18, h * 0.32).fill(shade(body, -0.15));
      g.rect(w * 0.32, -h * 0.68, w * 0.18, h * 0.32).fill(shade(body, -0.15));
      g.roundRect(-w * 0.22, -h * 0.98, w * 0.44, h * 0.24, h * 0.06).fill(shade(body, -0.2));
      g.poly([-w * 0.22, -h * 0.98, -w * 0.1, -h * 0.98, -w * 0.16, -h * 1.22]).fill(shade(body, 0.14));
      g.poly([w * 0.22, -h * 0.98, w * 0.1, -h * 0.98, w * 0.16, -h * 1.22]).fill(shade(body, 0.14));
      g.poly([-w * 0.16, -h * 1.14, -w * 0.13, -h * 1.22, -w * 0.19, -h * 1.22]).fill(accent);
      g.poly([w * 0.16, -h * 1.14, w * 0.13, -h * 1.22, w * 0.19, -h * 1.22]).fill(accent);
      g.rect(-w * 0.08, -h * 0.88, w * 0.16, h * 0.06).fill(accent);
      g.circle(-w * 0.08, -h * 0.9, h * 0.025).fill(0xff2244);
      g.circle(w * 0.08, -h * 0.9, h * 0.025).fill(0xff2244);
      const armLean = slash * h * 0.06;
      g.roundRect(w * 0.36 + armLean, -h * 0.64, w * 0.16, h * 0.1, h * 0.03).fill(shade(body, -0.15));
      drawPekkaBladeSwing(g, w * 0.56 + armLean, -h * 0.56, h, w, swing, accent, 'full');
      break;
    }

    case 'mirror': {
      const w = h * 0.44;
      const frame = accent;
      const frameDark = shade(accent, -0.35);
      const glass = body;
      const glassLight = shade(body, 0.22);

      g.roundRect(-w * 0.88, -h * 0.92, w * 1.76, h * 0.92, h * 0.07).fill(frameDark);
      g.roundRect(-w * 0.82, -h * 0.88, w * 1.64, h * 0.84, h * 0.06).fill(frame);
      g.roundRect(-w * 0.7, -h * 0.82, w * 1.4, h * 0.72, h * 0.045).fill(glass);
      g.roundRect(-w * 0.64, -h * 0.78, w * 1.28, h * 0.64, h * 0.035).fill(glassLight);

      g.moveTo(-w * 0.52, -h * 0.76)
        .lineTo(w * 0.18, -h * 0.32)
        .stroke({ width: h * 0.05, color: 0xffffff, alpha: 0.85 });
      g.moveTo(-w * 0.38, -h * 0.72)
        .lineTo(w * 0.32, -h * 0.28)
        .stroke({ width: h * 0.018, color: 0xffffff, alpha: 0.45 });

      g.roundRect(-w * 0.22, -h * 0.68, w * 0.38, h * 0.42, h * 0.05).fill({ color: frame, alpha: 0.22 });
      g.circle(-w * 0.08, -h * 0.58, h * 0.055).fill({ color: frame, alpha: 0.18 });
      g.circle(w * 0.06, -h * 0.52, h * 0.04).fill({ color: frame, alpha: 0.15 });

      for (const [cx, cy] of [
        [-w * 0.74, -h * 0.76],
        [w * 0.74, -h * 0.76],
        [-w * 0.74, -h * 0.2],
        [w * 0.74, -h * 0.2],
      ] as const) {
        g.circle(cx, cy, h * 0.038).fill(shade(frame, 0.25));
        g.circle(cx, cy, h * 0.02).fill(0xffe8a0);
      }

      g.poly([w * 0.78, -h * 0.44, w * 0.98, -h * 0.38, w * 0.98, -h * 0.5]).fill(frame);
      g.poly([w * 0.78, -h * 0.44, w * 0.98, -h * 0.38, w * 0.98, -h * 0.5]).fill(shade(frame, 0.15));
      g.moveTo(w * 0.82, -h * 0.42)
        .lineTo(w * 0.94, -h * 0.4)
        .stroke({ width: h * 0.012, color: 0xffffff, alpha: 0.5 });
      break;
    }

    case 'golem': {
      drawGolem(g, h, bodyHex, accentHex, opts?.swing ?? 0);
      break;
    }

    case 'golemite': {
      const swing = opts?.swing ?? 0;
      const punch = Math.max(0, swing) ** 2;
      const w = h * 0.5;
      const rock = body;
      const rockDark = shade(body, -0.28);
      const armX = punch * w * 0.14;
      const armY = punch * h * 0.1;
      g.ellipse(-w * 0.08, -h * 0.28, w * 0.55, h * 0.22).fill(rockDark);
      g.ellipse(-w * 0.1, -h * 0.52, w * 0.42, h * 0.32).fill(rock);
      g.ellipse(w * 0.08, -h * 0.48, w * 0.28, h * 0.24).fill(shade(rock, 0.1));
      g.roundRect(-w * 0.38, -h * 0.78, w * 0.76, h * 0.38, h * 0.12).fill(rock);
      g.circle(-w * 0.18, -h * 0.68, h * 0.06).fill(rockDark);
      g.circle(w * 0.12, -h * 0.62, h * 0.05).fill(rockDark);
      g.circle(-w * 0.05, -h * 0.88, h * 0.14).fill(rock);
      g.circle(-w * 0.1, -h * 0.9, h * 0.03).fill(0x66dd44);
      g.circle(w * 0.02, -h * 0.9, h * 0.03).fill(0x66dd44);
      g.roundRect(-w * 0.38 + armX * 0.4, -h * 0.05 + armY, w * 0.22, h * 0.05, h * 0.015).fill(rockDark);
      g.roundRect(w * 0.16 + armX, -h * 0.05 + armY, w * 0.22, h * 0.05, h * 0.015).fill(rockDark);
      break;
    }

    case 'mega_knight': {
      const w = h * 0.62;
      const r = opts?.jumpRaise ?? 0;
      const slash = Math.max(0, opts?.swing ?? 0) ** 2;
      const maceSlam = slash * h * 0.22;
      const armor = body;
      const armorDark = shade(body, -0.28);
      const armorLight = shade(body, 0.14);
      const beltBlue = accent;
      const buckle = 0xffcc44;
      const plume = accent;
      const mace = armorDark;
      const maceSpike = shade(body, 0.08);

      const backArmY = -h * (0.62 + r * 0.24);
      const backArmH = h * (0.14 + r * 0.34);
      const backMaceY = -h * (0.38 + r * 0.5) + maceSlam;
      const frontArmY = -h * (0.78 + r * 0.2);
      const frontArmH = h * (0.22 + r * 0.4);
      const frontMaceY = -h * (0.62 + r * 0.46) + maceSlam;

      g.roundRect(-w * 0.34, -h * 0.26, w * 0.28, h * 0.26, h * 0.04).fill(armorDark);
      g.roundRect(-w * 0.08, -h * 0.24, w * 0.32, h * 0.24, h * 0.05).fill(armorDark);
      g.roundRect(-w * 0.36, -h * 0.06, w * 0.3, h * 0.06, h * 0.02).fill(armorDark);
      g.roundRect(-w * 0.06, -h * 0.06, w * 0.34, h * 0.06, h * 0.02).fill(armorDark);

      g.roundRect(-w * 0.58, backArmY, w * 0.22, backArmH, h * 0.04).fill(armorDark);
      drawSpikedMace(g, -w * 0.52, backMaceY, h * (0.13 + r * 0.03), mace);

      g.roundRect(-w * 0.46, -h * 0.74, w * 0.92, h * 0.52, h * 0.12).fill(armor);
      g.roundRect(-w * 0.38, -h * 0.68, w * 0.76, h * 0.4, h * 0.08).fill(armorLight);

      g.roundRect(-w * 0.52, -h * 0.72, w * 0.24, h * 0.22, h * 0.08).fill(armorDark);
      g.roundRect(w * 0.28, -h * 0.76, w * 0.28, h * 0.26, h * 0.1).fill(armorDark);

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
          g.ellipse(-w * 0.34 + col * w * 0.12, -h * (0.36 + row * 0.055), w * 0.06, h * 0.022).fill(
            shade(armor, -0.18),
          );
        }
      }

      g.rect(-w * 0.42, -h * 0.44, w * 0.84, h * 0.07).fill(beltBlue);
      g.rect(-w * 0.42, -h * 0.44, w * 0.84, h * 0.02).fill(shade(beltBlue, 0.15));
      g.roundRect(-w * 0.1, -h * 0.46, w * 0.2, h * 0.11, h * 0.02).fill(buckle);
      g.rect(-w * 0.06, -h * 0.44, w * 0.12, h * 0.02).fill(shade(buckle, -0.15));

      g.roundRect(-w * 0.24, -h * 0.98, w * 0.48, h * 0.28, h * 0.06).fill(armorDark);
      g.roundRect(-w * 0.2, -h * 0.94, w * 0.4, h * 0.2, h * 0.04).fill(armor);
      g.rect(-w * 0.16, -h * 0.86, w * 0.32, h * 0.045).fill(0x0a0a0c);
      g.circle(-w * 0.07, -h * 0.868, h * 0.018).fill(DARK_EYE);
      g.circle(w * 0.07, -h * 0.868, h * 0.018).fill(DARK_EYE);
      for (let i = 0; i < 4; i++) {
        const vx = -w * 0.1 + i * w * 0.065;
        g.rect(vx, -h * 0.82, w * 0.025, h * 0.05).fill(0x0a0a0c);
      }

      g.moveTo(-w * 0.04, -h * 1.02)
        .quadraticCurveTo(w * 0.08, -h * 1.08, w * 0.22, -h * 0.96)
        .stroke({ width: h * 0.045, color: plume, cap: 'round' });
      g.moveTo(-w * 0.02, -h * 1.0)
        .quadraticCurveTo(w * 0.1, -h * 1.06, w * 0.2, -h * 0.95)
        .stroke({ width: h * 0.028, color: shade(plume, 0.2), cap: 'round' });

      g.roundRect(w * 0.34, frontArmY, w * 0.16, frontArmH, h * 0.04).fill(armorDark);
      drawSpikedMace(g, w * 0.58, frontMaceY, h * (0.15 + r * 0.04), maceSpike);
      break;
    }

    case 'inferno': {
      const w = h * 0.52;
      const metal = body;
      const metalLight = shade(body, 0.18);
      const metalDark = shade(body, -0.3);
      const glow = hexToNum(accentHex);
      const glowHot = shade(accentHex, 0.22);

      g.roundRect(-w * 0.62, -h * 0.16, w * 1.24, h * 0.16, h * 0.035).fill(metalDark);
      g.roundRect(-w * 0.56, -h * 0.13, w * 1.12, h * 0.12, h * 0.03).fill(metal);
      g.rect(-w * 0.62, -h * 0.16, w * 1.24, h * 0.04).fill(metalLight);
      g.circle(-w * 0.46, -h * 0.06, h * 0.035).fill(shade(metalDark, 0.1));
      g.circle(w * 0.46, -h * 0.06, h * 0.035).fill(shade(metalDark, 0.1));

      g.poly([
        -w * 0.56, -h * 0.13,
        -w * 0.78, -h * 0.62,
        -w * 0.48, -h * 0.58,
        -w * 0.38, -h * 0.13,
      ]).fill(metalDark);
      g.poly([
        w * 0.56, -h * 0.13,
        w * 0.78, -h * 0.62,
        w * 0.48, -h * 0.58,
        w * 0.38, -h * 0.13,
      ]).fill(metalDark);

      g.roundRect(-w * 0.24, -h * 0.98, w * 0.48, h * 0.88, h * 0.045).fill(metal);
      g.rect(-w * 0.36, -h * 0.94, w * 0.1, h * 0.8).fill(metalDark);
      g.rect(w * 0.26, -h * 0.94, w * 0.1, h * 0.8).fill(metalDark);
      g.rect(-w * 0.36, -h * 0.94, w * 0.05, h * 0.8).fill(metalLight);
      g.rect(w * 0.31, -h * 0.94, w * 0.05, h * 0.8).fill(metalLight);

      for (let i = 0; i < 6; i++) {
        const sy = -h * (0.2 + i * 0.12);
        g.rect(-w * 0.26, sy, w * 0.52, h * 0.022).fill(metalDark);
        g.rect(-w * 0.12, sy + h * 0.006, w * 0.24, h * 0.01).fill(metalLight);
      }

      g.roundRect(-w * 0.34, -h * 0.74, w * 0.68, h * 0.2, h * 0.05).fill(metalDark);
      g.roundRect(-w * 0.3, -h * 0.72, w * 0.6, h * 0.16, h * 0.04).fill(metal);

      g.roundRect(-w * 0.22, -h * 0.68, w * 0.44, h * 0.24, h * 0.06).fill(0x08080a);
      g.ellipse(0, -h * 0.58, w * 0.24, h * 0.15).fill({ color: glow, alpha: 0.22 });
      g.ellipse(0, -h * 0.58, w * 0.17, h * 0.11).fill({ color: glow, alpha: 0.88 });
      g.ellipse(0, -h * 0.58, w * 0.1, h * 0.07).fill({ color: glowHot, alpha: 0.95 });
      g.circle(0, -h * 0.58, w * 0.045).fill(0xffffff);

      g.roundRect(-w * 0.2, -h * 1.02, w * 0.4, h * 0.08, h * 0.025).fill(metalDark);
      g.poly([0, -h * 1.1, -w * 0.12, -h * 1.0, w * 0.12, -h * 1.0]).fill(metalLight);
      g.poly([-w * 0.14, -h * 1.0, 0, -h * 1.06, w * 0.14, -h * 1.0]).fill(metalDark);
      break;
    }

    case 'valkyrie': {
      const spin = opts?.spin ?? 0;
      const w = h * 0.48;
      const torsoCy = -h * 0.58;
      const legSpread = spin * w * 0.07;
      const crouch = spin * h * 0.04;

      if (spin > 0.04) {
        drawValkyrieSpinFx(g, 0, torsoCy, h, spin, accent);
      }

      g.rect(-w * 0.28 - legSpread, -h * 0.22 + crouch, w * 0.22, h * 0.22).fill(0x54402e);
      g.rect(w * 0.06 + legSpread, -h * 0.22 + crouch, w * 0.22, h * 0.22).fill(0x54402e);
      g.poly(
        [-w * 0.52, -h * 0.18 + crouch, w * 0.52, -h * 0.18 + crouch, w * 0.34, -h * 0.52 + crouch, -w * 0.34, -h * 0.52 + crouch],
      ).fill(shade(body, -0.22));
      g.roundRect(-w * 0.35, -h * 0.72 + crouch, w * 0.7, h * 0.25, h * 0.06).fill(body);
      g.circle(-w * 0.4, -h * 0.68 + crouch, h * 0.09).fill(shade(body, 0.18));
      g.circle(w * 0.4, -h * 0.68 + crouch, h * 0.09).fill(shade(body, 0.18));
      g.ellipse(0, -h * 0.79 + crouch, h * 0.19, h * 0.16).fill(accent);
      g.circle(0, -h * 0.82 + crouch, h * 0.12).fill(SKIN);
      g.rect(-h * 0.135, -h * 0.925 + crouch, h * 0.27, h * 0.055).fill(STEEL);
      g.circle(-h * 0.045, -h * 0.84 + crouch, h * 0.02).fill(DARK_EYE);
      g.circle(h * 0.045, -h * 0.84 + crouch, h * 0.02).fill(DARK_EYE);

      const handX = w * 0.02;
      const handY = -h * 0.7 + crouch;
      const offHandX = -w * 0.18;
      const offHandY = -h * 0.66 + crouch;
      g.circle(offHandX, offHandY, h * 0.055).fill(SKIN);
      g.circle(handX, handY, h * 0.06).fill(SKIN);
      drawBattleAxe(g, handX, handY, h, Math.PI * 0.28, WOOD, STEEL);
      break;
    }
  }
}

function puddleRand(seed: number, i: number) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Spilled liquid pool left by the Rage spell on the arena floor. */
export function drawRagePuddle(
  g: Graphics,
  radius: number,
  tile: number,
  squash: number,
  bodyHex: string,
  accentHex: string,
  seed: number,
  animT: number,
  alpha: number,
) {
  g.clear();
  const liquid = hexToNum(bodyHex);
  const liquidLight = hexToNum(accentHex);
  const liquidDark = shade(bodyHex, -0.28);
  const rx = radius * tile * 0.95;
  const ry = radius * tile * squash * 0.95;
  const wobble = 1 + Math.sin(animT * 2.8 + seed) * 0.035;
  const ripple = Math.sin(animT * 4.5 + seed * 1.3) * 0.015;

  // dark soak stain beneath the pool
  g.ellipse(0, ripple * tile, rx * wobble * 1.06, ry * wobble * 1.06).fill({
    color: liquidDark,
    alpha: 0.28 * alpha,
  });

  // irregular spill lobes — organic liquid spread
  const lobes = 6;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + seed * 0.55 + Math.sin(animT * 1.6 + i) * 0.08;
    const dist = 0.48 + puddleRand(seed, i) * 0.42;
    const lx = Math.cos(a) * rx * dist;
    const ly = Math.sin(a) * ry * dist + ripple * tile;
    const lr = rx * (0.2 + puddleRand(seed, i + 10) * 0.22);
    const lry = ry * (0.16 + puddleRand(seed, i + 20) * 0.16);
    g.ellipse(lx, ly, lr, lry).fill({ color: liquid, alpha: 0.38 * alpha });
  }

  // main body
  g.ellipse(0, ripple * tile * 0.5, rx * 0.86 * wobble, ry * 0.86 * wobble).fill({
    color: liquid,
    alpha: 0.55 * alpha,
  });

  // inner depth
  g.ellipse(0, ripple * tile * 0.5, rx * 0.62 * wobble, ry * 0.62 * wobble).fill({
    color: liquidDark,
    alpha: 0.22 * alpha,
  });

  // liquid shine streaks
  g.ellipse(-rx * 0.22, -ry * 0.18 + ripple * tile, rx * 0.38, ry * 0.11).fill({
    color: liquidLight,
    alpha: 0.32 * alpha,
  });
  g.ellipse(rx * 0.12, ry * 0.08 + ripple * tile * 0.3, rx * 0.24, ry * 0.07).fill({
    color: liquidLight,
    alpha: 0.2 * alpha,
  });

  // specular glints
  for (let i = 0; i < 4; i++) {
    const gx = (puddleRand(seed, i + 30) - 0.5) * rx * 0.9;
    const gy = (puddleRand(seed, i + 40) - 0.5) * ry * 0.7 + ripple * tile;
    const gr = tile * (0.04 + puddleRand(seed, i + 50) * 0.05);
    g.circle(gx, gy, gr).fill({ color: 0xffffff, alpha: 0.22 * alpha });
  }

  // wet edge ring
  g.ellipse(0, ripple * tile * 0.5, rx * 0.9 * wobble, ry * 0.9 * wobble).stroke({
    width: 1.8,
    color: liquidLight,
    alpha: 0.28 * alpha,
  });
}

/** Ground hatch left behind when the Tesla retracts underground. */
export function drawTeslaTrapdoor(g: Graphics, h: number, accentHex: string, team?: number) {
  const w = h * 0.58;
  const wood = hexToNum(accentHex);
  const teamColor = team !== undefined ? TEAM_COLOR[team] : 0x3b7dd8;

  g.ellipse(0, 0, w * 0.54, w * 0.54 * 0.34).fill({ color: 0x000000, alpha: 0.24 });
  g.roundRect(-w * 0.46, -h * 0.095, w * 0.92, h * 0.095, h * 0.018).stroke({
    width: h * 0.014,
    color: 0x5a6068,
  });
  g.roundRect(-w * 0.44, -h * 0.085, w * 0.88, h * 0.085, h * 0.015).fill(wood);
  g.rect(-w * 0.44, -h * 0.085, w * 0.88, h * 0.022).fill(shade(wood, 0.1));
  for (let i = -1; i <= 1; i++) {
    g.moveTo(-w * 0.44, -h * 0.045 + i * h * 0.022)
      .lineTo(w * 0.44, -h * 0.045 + i * h * 0.022)
      .stroke({ width: 1.2, color: shade(wood, -0.28), alpha: 0.65 });
  }
  g.rect(-w * 0.13, -h * 0.062, w * 0.09, h * 0.038).fill(teamColor);
  g.rect(w * 0.04, -h * 0.062, w * 0.09, h * 0.038).fill(teamColor);
  g.circle(-w * 0.085, -h * 0.043, h * 0.011).fill(shade(teamColor, -0.3));
  g.circle(w * 0.085, -h * 0.043, h * 0.011).fill(shade(teamColor, -0.3));
  g.circle(0, -h * 0.043, h * 0.016).fill(0x5a6068);
  g.circle(0, -h * 0.043, h * 0.007).fill(shade(0x5a6068, 0.35));
}

/** Jagged lightning segment between two points (local/screen coordinates). */
export function drawLightningBolt(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  seed = 0,
) {
  g.clear();
  const segs = 8;
  const pts: number[] = [x0, y0];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jag = Math.sin(seed * 12.9898 + i * 4.141) * w * 0.38;
    pts.push(x0 + dx * t + px * jag, y0 + dy * t + py * jag);
  }
  pts.push(x1, y1);
  g.poly(pts).stroke({ width: w * 0.16, color: 0x8ff0ff, alpha: 0.32 });
  g.poly(pts).stroke({ width: w * 0.07, color: 0xc8f8ff });
  g.poly(pts).stroke({ width: w * 0.028, color: 0xffffff });
}

/** Red inferno beam — wobbly animated ray; thickness and intensity grow with stage. */
export function drawInfernoBeam(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  stage = 0,
  seed = 0,
) {
  g.clear();
  const intensity = 0.55 + stage * 0.22;
  const outerW = w * (0.16 + stage * 0.16);
  const midW = w * (0.07 + stage * 0.09);
  const coreW = w * (0.025 + stage * 0.025);
  const segs = 6 + stage * 2;
  const pts: number[] = [x0, y0];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const wobbleAmp = w * (0.035 + stage * 0.025);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jag = Math.sin(seed * 12.9898 + i * 4.141) * wobbleAmp;
    pts.push(x0 + dx * t + px * jag, y0 + dy * t + py * jag);
  }
  pts.push(x1, y1);
  g.poly(pts).stroke({ width: outerW, color: 0xff2200, alpha: 0.28 * intensity });
  g.poly(pts).stroke({ width: midW, color: 0xff5522, alpha: 0.65 * intensity });
  g.poly(pts).stroke({ width: coreW, color: 0xffcc66, alpha: 0.95 });
  g.circle(x1, y1, w * (0.08 + stage * 0.05)).fill({ color: 0xff6622, alpha: 0.5 * intensity });
  g.circle(x1, y1, w * (0.04 + stage * 0.025)).fill(0xffffff);
}

/**
 * Geometry of a tower sprite. `topY` is the highest drawn pixel (negative,
 * relative to the tower's base) so callers can place the HP bar above it.
 */
export function towerMetrics(kind: TowerKind, tile: number, squash: number) {
  const w = (kind === 'king' ? 3.0 : 2.5) * tile;
  const h = (kind === 'king' ? 1.6 : 1.4) * tile * squash + tile * 0.45;
  const merlon = tile * 0.34;
  /** height of the King / Princess standing on the battlements */
  const crewH = (kind === 'king' ? 1.3 : 1.1) * tile;
  const crewTop = crewH * (kind === 'king' ? 1.2 : 1.12);
  return { w, h, merlon, crewH, topY: -(h + merlon + crewTop) };
}

/** Sim-space offset (tiles) from a tower entity centre to its muzzle / bow. */
export function towerProjectileOrigin(
  kind: TowerKind,
  squash: number,
  active: boolean,
  opts?: {
    bowFlip?: number;
    aimRad?: number;
  },
): { ox: number; oy: number } {
  const bodyH = (kind === 'king' ? 1.6 : 1.4) * squash + 0.45;
  const merlon = 0.34;
  const crewH = kind === 'king' ? 1.3 : 1.1;
  const baseY = -(bodyH + merlon);

  if (kind === 'princess') {
    const flip = opts?.bowFlip ?? 1;
    return {
      ox: flip * crewH * 0.41,
      oy: (baseY - crewH * 0.6) / squash,
    };
  }

  if (!active) {
    return { ox: 0, oy: (baseY - crewH * 0.5) / squash };
  }

  const pivotY = (baseY - crewH * 0.12) / squash;
  const barrelLen = crewH * 0.52;
  const angle = opts?.aimRad ?? -Math.PI / 2;
  return {
    ox: Math.cos(angle) * barrelLen,
    oy: pivotY + Math.sin(angle) * barrelLen,
  };
}

export function drawTower(
  g: Graphics,
  kind: TowerKind,
  team: number,
  tile: number,
  squash: number,
  destroyed: boolean,
  active = true,
  aimRad?: number,
  bowFlip = 1,
) {
  const stone = 0xbcb2a2;
  const stoneMid = 0xa2988a;
  const stoneDark = 0x7e7568;
  const teamColor = TEAM_COLOR[team];
  const { w, h, merlon, crewH } = towerMetrics(kind, tile, squash);

  if (destroyed) {
    g.ellipse(0, 0, w * 0.5, h * 0.14).fill({ color: 0x000000, alpha: 0.22 });
    g.roundRect(-w * 0.42, -h * 0.26, w * 0.4, h * 0.26, 3).fill(stoneDark);
    g.roundRect(-w * 0.05, -h * 0.36, w * 0.34, h * 0.36, 3).fill(stoneMid);
    g.roundRect(w * 0.16, -h * 0.16, w * 0.26, h * 0.16, 3).fill(stoneDark);
    g.circle(-w * 0.3, -h * 0.32, tile * 0.16).fill(stoneMid);
    return;
  }

  g.ellipse(0, 0, w * 0.55, h * 0.13).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-w / 2, -h, w, h, tile * 0.16).fill(stone);
  g.rect(-w / 2, -h * 0.22, w, h * 0.22).fill(stoneMid);
  g.rect(-w / 2, -h * 0.06, w, h * 0.06).fill(stoneDark);

  const merlons = kind === 'king' ? 5 : 4;
  const mw = w / merlons;
  for (let i = 0; i < merlons; i++) {
    g.rect(-w / 2 + i * mw + mw * 0.12, -h - merlon, mw * 0.76, merlon).fill(stone);
  }

  g.roundRect(-w * 0.28, -h * 0.84, w * 0.56, h * 0.44, tile * 0.1).fill(teamColor);
  g.roundRect(-w * 0.28, -h * 0.84, w * 0.56, h * 0.12, tile * 0.08).fill(shade(teamColor, 0.22));

  // the character standing on the battlements
  if (kind === 'king') {
    const crewBase = -h - merlon;
    drawKing(g, crewH, crewBase, teamColor);
    if (active) {
      drawKingTowerCannon(g, crewH, crewBase, aimRad ?? -Math.PI / 2);
    }
  } else {
    drawPrincess(g, crewH, -h - merlon, teamColor, bowFlip);
  }
}

/** Cannon mounted on the battlements once the King Tower wakes up; the King stays. */
function drawKingTowerCannon(g: Graphics, h: number, baseY: number, aimRad: number) {
  const metal = 0x7e8794;
  const metalDark = shade(metal, -0.25);
  const wood = 0x8a5f3d;
  const pivotX = 0;
  const pivotY = baseY - h * 0.12;
  const barrelLen = h * 0.52;
  const cos = Math.cos(aimRad);
  const sin = Math.sin(aimRad);
  const along = (dist: number) => ({
    x: pivotX + cos * dist,
    y: pivotY + sin * dist,
  });
  const across = (dist: number) => ({
    x: pivotX - sin * dist,
    y: pivotY + cos * dist,
  });

  // wooden platform on the front edge of the battlements
  g.roundRect(-h * 0.34, baseY - h * 0.04, h * 0.68, h * 0.11, h * 0.03).fill(wood);
  g.roundRect(-h * 0.34, baseY - h * 0.04, h * 0.68, h * 0.035, h * 0.02).fill(shade(wood, 0.15));

  const breech = along(h * 0.05);
  const muzzle = along(barrelLen);
  const barrelW = h * 0.28;
  g.moveTo(breech.x, breech.y)
    .lineTo(muzzle.x, muzzle.y)
    .stroke({ width: barrelW, color: metal, cap: 'round' });
  g.moveTo(breech.x, breech.y)
    .lineTo(muzzle.x, muzzle.y)
    .stroke({ width: barrelW * 0.42, color: shade(metal, 0.18), cap: 'round' });
  g.circle(muzzle.x, muzzle.y, barrelW * 0.38).fill(metalDark);

  const wheelR = h * 0.12;
  for (const side of [-1, 1]) {
    const wPos = across(side * h * 0.24);
    g.circle(wPos.x, wPos.y, wheelR).fill(metalDark);
    g.circle(wPos.x, wPos.y, wheelR * 0.42).fill(shade(metal, 0.2));
  }
}

/** The king that sits on top of a King Tower. `baseY` is where his feet stand. */
function drawKing(g: Graphics, h: number, baseY: number, teamColor: number) {
  const y = (v: number) => baseY - h * v;
  const robe = shade(teamColor, -0.12);
  g.poly([-h * 0.32, y(0), h * 0.32, y(0), h * 0.2, y(0.46), -h * 0.2, y(0.46)]).fill(robe);
  g.rect(-h * 0.32, y(0.1), h * 0.64, h * 0.07).fill(0xe8c45a);
  g.roundRect(-h * 0.22, y(0.66), h * 0.44, h * 0.24, h * 0.05).fill(shade(teamColor, 0.12));
  g.circle(-h * 0.26, y(0.6), h * 0.09).fill(robe);
  g.circle(h * 0.26, y(0.6), h * 0.09).fill(robe);
  g.circle(0, y(0.76), h * 0.15).fill(SKIN);
  g.ellipse(0, y(0.68), h * 0.17, h * 0.13).fill(BONE);
  g.circle(-h * 0.055, y(0.79), h * 0.022).fill(DARK_EYE);
  g.circle(h * 0.055, y(0.79), h * 0.022).fill(DARK_EYE);
  g.poly([
    -h * 0.19, y(0.88),
    -h * 0.19, y(1.1),
    -h * 0.08, y(0.98),
    0, y(1.16),
    h * 0.08, y(0.98),
    h * 0.19, y(1.1),
    h * 0.19, y(0.88),
  ]).fill(0xe8c45a);
}

/** The princess archer that sits on top of a Princess Tower. */
function drawPrincess(g: Graphics, h: number, baseY: number, teamColor: number, bowFlip = 1) {
  const y = (v: number) => baseY - h * v;
  const dress = shade(teamColor, 0.1);
  g.poly([-h * 0.3, y(0), h * 0.3, y(0), h * 0.17, y(0.5), -h * 0.17, y(0.5)]).fill(dress);
  g.rect(-h * 0.22, y(0.46), h * 0.44, h * 0.06).fill(0xe8c45a);
  g.roundRect(-h * 0.16, y(0.7), h * 0.32, h * 0.22, h * 0.05).fill(shade(dress, 0.18));
  g.ellipse(-h * 0.16, y(0.74), h * 0.11, h * 0.19).fill(0xe8b84a);
  g.ellipse(h * 0.16, y(0.74), h * 0.11, h * 0.19).fill(0xe8b84a);
  g.circle(0, y(0.82), h * 0.14).fill(SKIN);
  g.ellipse(0, y(0.9), h * 0.17, h * 0.1).fill(0xe8b84a);
  g.circle(-h * 0.05, y(0.83), h * 0.021).fill(DARK_EYE);
  g.circle(h * 0.05, y(0.83), h * 0.021).fill(DARK_EYE);
  g.poly([-h * 0.12, y(0.96), h * 0.12, y(0.96), h * 0.07, y(1.08), 0, y(0.99), -h * 0.07, y(1.08)]).fill(
    0xe8c45a,
  );
  // bow — flips toward the lane center
  const bx = bowFlip * h * 0.34;
  g.ellipse(bx, y(0.6), h * 0.07, h * 0.3).stroke({ width: h * 0.05, color: WOOD });
  g.moveTo(bx, y(0.9)).lineTo(bx, y(0.3)).stroke({ width: h * 0.022, color: 0xe8e2d0 });
}
