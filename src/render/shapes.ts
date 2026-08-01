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

/**
 * Every unit is drawn procedurally with its feet at (0, 0) and its body
 * extending upward into negative y. `h` is the full height in pixels.
 */
export function drawUnit(g: Graphics, shape: UnitShape, h: number, bodyHex: string, accentHex: string) {
  const body = hexToNum(bodyHex);
  const accent = hexToNum(accentHex);
  const dark = shade(body, -0.35);

  switch (shape) {
    case 'giant': {
      const w = h * 0.5;
      g.roundRect(-w * 0.38, -h * 0.3, w * 0.3, h * 0.3, h * 0.05).fill(dark);
      g.roundRect(w * 0.08, -h * 0.3, w * 0.3, h * 0.3, h * 0.05).fill(dark);
      g.circle(-w * 0.58, -h * 0.55, h * 0.105).fill(shade(body, 0.08));
      g.circle(w * 0.58, -h * 0.55, h * 0.105).fill(shade(body, 0.08));
      g.roundRect(-w / 2, -h * 0.8, w, h * 0.54, h * 0.14).fill(body);
      g.rect(-w / 2, -h * 0.42, w, h * 0.1).fill(accent);
      g.rect(-h * 0.055, -h * 0.435, h * 0.11, h * 0.15).fill(shade(accent, 0.4));
      g.circle(0, -h * 0.88, h * 0.16).fill(shade(body, 0.16));
      g.ellipse(0, -h * 0.815, h * 0.135, h * 0.085).fill(BONE);
      g.circle(-h * 0.055, -h * 0.915, h * 0.02).fill(DARK_EYE);
      g.circle(h * 0.055, -h * 0.915, h * 0.02).fill(DARK_EYE);
      break;
    }

    case 'goblin': {
      const w = h * 0.52;
      g.rect(-w * 0.32, -h * 0.24, w * 0.24, h * 0.24).fill(dark);
      g.rect(w * 0.08, -h * 0.24, w * 0.24, h * 0.24).fill(dark);
      g.ellipse(0, -h * 0.44, w * 0.44, h * 0.24).fill(body);
      g.poly([-h * 0.16, -h * 0.8, -h * 0.42, -h * 0.92, -h * 0.14, -h * 0.68]).fill(shade(body, 0.1));
      g.poly([h * 0.16, -h * 0.8, h * 0.42, -h * 0.92, h * 0.14, -h * 0.68]).fill(shade(body, 0.1));
      g.circle(0, -h * 0.75, h * 0.2).fill(shade(body, 0.12));
      g.circle(-h * 0.07, -h * 0.78, h * 0.038).fill(0xfff3c0);
      g.circle(h * 0.07, -h * 0.78, h * 0.038).fill(0xfff3c0);
      g.circle(-h * 0.07, -h * 0.78, h * 0.017).fill(DARK_EYE);
      g.circle(h * 0.07, -h * 0.78, h * 0.017).fill(DARK_EYE);
      g.rect(w * 0.4, -h * 0.62, h * 0.05, h * 0.3).fill(STEEL);
      g.rect(w * 0.36, -h * 0.34, h * 0.13, h * 0.05).fill(accent);
      break;
    }

    case 'skeleton': {
      g.rect(-h * 0.11, -h * 0.26, h * 0.055, h * 0.26).fill(shade(body, -0.18));
      g.rect(h * 0.055, -h * 0.26, h * 0.055, h * 0.26).fill(shade(body, -0.18));
      g.roundRect(-h * 0.14, -h * 0.58, h * 0.28, h * 0.33, h * 0.06).fill(body);
      const rib = hexToNum(accentHex);
      g.rect(-h * 0.14, -h * 0.52, h * 0.28, h * 0.028).fill(rib);
      g.rect(-h * 0.14, -h * 0.45, h * 0.28, h * 0.028).fill(rib);
      g.rect(-h * 0.14, -h * 0.38, h * 0.28, h * 0.028).fill(rib);
      g.rect(-h * 0.2, -h * 0.56, h * 0.06, h * 0.24).fill(body);
      g.rect(h * 0.14, -h * 0.56, h * 0.06, h * 0.24).fill(body);
      g.circle(0, -h * 0.73, h * 0.165).fill(body);
      g.rect(-h * 0.075, -h * 0.67, h * 0.15, h * 0.08).fill(body);
      g.circle(-h * 0.06, -h * 0.75, h * 0.045).fill(DARK_EYE);
      g.circle(h * 0.06, -h * 0.75, h * 0.045).fill(DARK_EYE);
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

    case 'knight': {
      const w = h * 0.5;
      g.rect(-w * 0.3, -h * 0.24, w * 0.24, h * 0.24).fill(0x3d4457);
      g.rect(w * 0.06, -h * 0.24, w * 0.24, h * 0.24).fill(0x3d4457);
      g.poly([-w * 0.5, -h * 0.2, w * 0.5, -h * 0.2, w * 0.36, -h * 0.5, -w * 0.36, -h * 0.5]).fill(
        hexToNum(accentHex),
      );
      g.roundRect(-w * 0.38, -h * 0.74, w * 0.76, h * 0.28, h * 0.06).fill(body);
      g.circle(-w * 0.44, -h * 0.7, h * 0.095).fill(shade(body, 0.18));
      g.circle(w * 0.44, -h * 0.7, h * 0.095).fill(shade(body, 0.18));
      g.circle(0, -h * 0.84, h * 0.145).fill(shade(body, 0.12));
      g.rect(-h * 0.155, -h * 0.885, h * 0.31, h * 0.05).fill(shade(body, -0.3));
      g.rect(-h * 0.03, -h * 0.87, h * 0.06, h * 0.09).fill(0x1a1a22);
      g.poly([-h * 0.05, -h * 1.0, h * 0.05, -h * 1.0, 0, -h * 1.12]).fill(accent);
      g.rect(w * 0.5, -h * 0.92, h * 0.05, h * 0.62).fill(STEEL);
      g.rect(w * 0.44, -h * 0.34, h * 0.17, h * 0.05).fill(accent);
      g.ellipse(-w * 0.6, -h * 0.5, h * 0.11, h * 0.16).fill(shade(accent, 0.2));
      break;
    }

    case 'minipekka': {
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
      g.rect(w * 0.52, -h * 1.0, h * 0.055, h * 0.72).fill(0x4a4f63);
      g.poly([w * 0.44, -h * 1.0, w * 0.78, -h * 0.92, w * 0.5, -h * 0.6]).fill(accent);
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
      g.rect(w * 0.0, -h * 0.86, h * 0.05, h * 0.36).fill(WOOD);
      g.rect(-h * 0.07, -h * 0.92, h * 0.2, h * 0.09).fill(STEEL);
      break;
    }

    case 'minion': {
      g.ellipse(0, -h * 0.46, h * 0.21, h * 0.24).fill(body);
      g.poly([-h * 0.18, -h * 0.58, -h * 0.62, -h * 0.78, -h * 0.16, -h * 0.36]).fill(shade(body, -0.22));
      g.poly([h * 0.18, -h * 0.58, h * 0.62, -h * 0.78, h * 0.16, -h * 0.36]).fill(shade(body, -0.22));
      g.circle(0, -h * 0.72, h * 0.2).fill(shade(body, 0.1));
      g.circle(-h * 0.07, -h * 0.74, h * 0.055).fill(0xfff3c0);
      g.circle(h * 0.07, -h * 0.74, h * 0.055).fill(0xfff3c0);
      g.circle(-h * 0.07, -h * 0.74, h * 0.025).fill(DARK_EYE);
      g.circle(h * 0.07, -h * 0.74, h * 0.025).fill(DARK_EYE);
      g.poly([-h * 0.06, -h * 0.62, h * 0.06, -h * 0.62, 0, -h * 0.52]).fill(accent);
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

    case 'valkyrie': {
      const w = h * 0.48;
      g.rect(-w * 0.28, -h * 0.22, w * 0.22, h * 0.22).fill(0x54402e);
      g.rect(w * 0.06, -h * 0.22, w * 0.22, h * 0.22).fill(0x54402e);
      g.poly([-w * 0.52, -h * 0.18, w * 0.52, -h * 0.18, w * 0.34, -h * 0.52, -w * 0.34, -h * 0.52]).fill(
        shade(body, -0.22),
      );
      g.roundRect(-w * 0.35, -h * 0.72, w * 0.7, h * 0.25, h * 0.06).fill(body);
      g.circle(-w * 0.4, -h * 0.68, h * 0.09).fill(shade(body, 0.18));
      g.circle(w * 0.4, -h * 0.68, h * 0.09).fill(shade(body, 0.18));
      g.ellipse(0, -h * 0.79, h * 0.19, h * 0.16).fill(accent);
      g.circle(0, -h * 0.82, h * 0.12).fill(SKIN);
      g.rect(-h * 0.135, -h * 0.925, h * 0.27, h * 0.055).fill(STEEL);
      g.circle(-h * 0.045, -h * 0.84, h * 0.02).fill(DARK_EYE);
      g.circle(h * 0.045, -h * 0.84, h * 0.02).fill(DARK_EYE);
      g.rect(w * 0.46, -h * 0.86, h * 0.05, h * 0.72).fill(WOOD);
      g.ellipse(w * 0.62, -h * 0.84, h * 0.17, h * 0.12).fill(STEEL);
      g.ellipse(w * 0.56, -h * 0.84, h * 0.1, h * 0.1).fill(shade(body, -0.22));
      break;
    }
  }
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

export function drawTower(
  g: Graphics,
  kind: TowerKind,
  team: number,
  tile: number,
  squash: number,
  destroyed: boolean,
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
    drawKing(g, crewH, -h - merlon, teamColor);
  } else {
    drawPrincess(g, crewH, -h - merlon, teamColor);
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
function drawPrincess(g: Graphics, h: number, baseY: number, teamColor: number) {
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
  // bow
  g.ellipse(h * 0.34, y(0.6), h * 0.07, h * 0.3).stroke({ width: h * 0.05, color: WOOD });
  g.moveTo(h * 0.34, y(0.9)).lineTo(h * 0.34, y(0.3)).stroke({ width: h * 0.022, color: 0xe8e2d0 });
}
