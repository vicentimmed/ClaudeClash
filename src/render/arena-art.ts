import { Graphics } from 'pixi.js';
import { ARENA } from '../sim/arena';

/**
 * Everything that paints the board itself — grass, dirt lanes, river, bridges
 * and the framing around them. Kept apart from `renderer.ts` because it is all
 * static decoration: `drawTerrain` runs once per layout, and only the water
 * shimmer is redrawn per frame.
 *
 * All coordinates here are in tiles; the two helpers passed in convert to px.
 */

export const TERRAIN = {
  /** base field — desaturated from the old 0x6aa834 so troops read on top of it */
  grass: 0x6d9c40,
  /** checker square: only ~4% lighter, where it used to be ~12% */
  grassAlt: 0x739f46,
  grassDeep: 0x5b8635,
  grassTuft: 0x4f7a2d,
  path: 0xc2a068,
  pathAlt: 0xb8945c,
  pathEdge: 0xa4834f,
  river: 0x2f8fc4,
  riverDeep: 0x246f9f,
  riverShallow: 0x54b1de,
  bridge: 0x9c6d47,
  bridgeDark: 0x76502f,
  bridgeLight: 0xc09163,
} as const;

/** Deterministic pseudo-random so the scenery is identical every layout. */
function seeded(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth organic offset in [-1, 1] — two sines beat into something non-repeating. */
function wobble(t: number, seed: number): number {
  return Math.sin(t * 8.7 + seed) * 0.62 + Math.sin(t * 21.3 + seed * 2.7) * 0.38;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Dirt lanes, in tiles. Purely decorative — the sim knows nothing about them. */
function lanes(): Rect[] {
  const halfW = 1.3;
  const l = ARENA.bridgeLeftX;
  const r = ARENA.bridgeRightX;
  return [
    { x0: l - halfW, y0: 3.2, x1: l + halfW, y1: 28.8 },
    { x0: r - halfW, y0: 3.2, x1: r + halfW, y1: 28.8 },
    // connectors behind the towers — narrowed from 2.2 to 1.5 tiles so the
    // board stops reading as a closed racetrack
    { x0: l - halfW, y0: 3.4, x1: r + halfW, y1: 4.9 },
    { x0: l - halfW, y0: 27.1, x1: r + halfW, y1: 28.6 },
  ];
}

function inRect(x: number, y: number, r: Rect, pad = 0): boolean {
  return x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;
}

/** True where a decoration would land on dirt or water instead of grass. */
function onGrass(x: number, y: number): boolean {
  if (y > ARENA.riverTop - 0.6 && y < ARENA.riverBottom + 0.6) return false;
  for (const r of lanes()) {
    if (inRect(x, y, r, 0.35)) return false;
  }
  return true;
}

/** A wobbly-edged rectangle: the same shape as `rect`, but hand-drawn looking. */
function organicRect(
  g: Graphics,
  r: Rect,
  amp: number,
  seed: number,
  px: (v: number) => number,
  py: (v: number) => number,
  color: number,
  alpha = 1,
) {
  const pts: number[] = [];
  const steps = 18;
  const push = (x: number, y: number) => pts.push(px(x), py(y));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    push(r.x0 + wobble(t, seed) * amp, r.y0 + (r.y1 - r.y0) * t);
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    push(r.x0 + (r.x1 - r.x0) * t, r.y1 + wobble(t, seed + 4.1) * amp);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    push(r.x1 + wobble(t, seed + 8.3) * amp, r.y0 + (r.y1 - r.y0) * t);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    push(r.x0 + (r.x1 - r.x0) * t, r.y0 + wobble(t, seed + 12.7) * amp);
  }
  g.poly(pts).fill({ color, alpha });
}

/**
 * The whole static board. Called once per layout — everything here is cheap to
 * build and free to keep on screen afterwards.
 */
export function drawTerrain(g: Graphics, tile: number, squash: number) {
  const px = (v: number) => v * tile;
  const py = (v: number) => v * tile * squash;
  const W = px(ARENA.width);
  const H = py(ARENA.height);

  g.clear();
  g.rect(0, 0, W, H).fill(TERRAIN.grass);

  // --- subtle checker -------------------------------------------------------
  for (let cy = 0; cy < ARENA.height / 2; cy++) {
    for (let cx = 0; cx < ARENA.width / 2; cx++) {
      if ((cx + cy) % 2 === 0) continue;
      g.rect(px(cx * 2), py(cy * 2), px(2), py(2)).fill(TERRAIN.grassAlt);
    }
  }

  // --- organic colour patches, to break up the grid -------------------------
  for (let i = 0; i < 46; i++) {
    const x = seeded(i * 3.1) * ARENA.width;
    const y = seeded(i * 5.7 + 1.3) * ARENA.height;
    if (!onGrass(x, y)) continue;
    const rx = 1.1 + seeded(i * 7.9) * 2.4;
    g.ellipse(px(x), py(y), px(rx), py(rx * 0.72)).fill({
      color: seeded(i * 11.3) > 0.5 ? TERRAIN.grassDeep : TERRAIN.grassAlt,
      alpha: 0.3,
    });
  }

  // --- dirt lanes -----------------------------------------------------------
  const laneRects = lanes();
  laneRects.forEach((r, i) => {
    const shoulder = { x0: r.x0 - 0.18, y0: r.y0 - 0.18, x1: r.x1 + 0.18, y1: r.y1 + 0.18 };
    organicRect(g, shoulder, 0.12, i * 17.3, px, py, TERRAIN.pathEdge);
  });
  laneRects.forEach((r, i) => {
    organicRect(g, r, 0.095, i * 17.3 + 2.2, px, py, TERRAIN.path);
  });

  // gravel speckles so the dirt is not one flat slab
  for (let i = 0; i < 150; i++) {
    const x = seeded(i * 2.3 + 40) * ARENA.width;
    const y = seeded(i * 4.1 + 77) * ARENA.height;
    if (onGrass(x, y)) continue;
    if (y > ARENA.riverTop - 0.4 && y < ARENA.riverBottom + 0.4) continue;
    let inside = false;
    for (const r of laneRects) inside ||= inRect(x, y, r, -0.2);
    if (!inside) continue;
    const s = 0.05 + seeded(i * 6.7) * 0.08;
    g.ellipse(px(x), py(y), px(s), py(s * 1.2)).fill({
      color: seeded(i * 8.9) > 0.6 ? TERRAIN.pathEdge : TERRAIN.pathAlt,
      alpha: 0.55,
    });
  }

  // --- grass detail: tufts, pebbles, the odd flower -------------------------
  for (let i = 0; i < 120; i++) {
    const x = seeded(i * 1.7 + 200) * ARENA.width;
    const y = seeded(i * 3.9 + 311) * ARENA.height;
    if (!onGrass(x, y)) continue;
    const roll = seeded(i * 9.1);
    if (roll < 0.62) {
      // tuft — three blades fanning out
      const bx = px(x);
      const by = py(y);
      const s = tile * (0.1 + seeded(i * 13.7) * 0.07);
      for (let b = -1; b <= 1; b++) {
        g.moveTo(bx, by)
          .lineTo(bx + b * s * 0.55, by - s * (b === 0 ? 1.5 : 1.05))
          .stroke({ width: Math.max(1, tile * 0.045), color: TERRAIN.grassTuft, alpha: 0.7 });
      }
    } else if (roll < 0.88) {
      const s = tile * (0.06 + seeded(i * 15.1) * 0.05);
      g.ellipse(px(x), py(y), s, s * 0.62).fill({ color: 0x8a8272, alpha: 0.5 });
      g.ellipse(px(x), py(y) - s * 0.18, s * 0.7, s * 0.4).fill({ color: 0xa39a88, alpha: 0.45 });
    } else {
      const s = tile * 0.055;
      const col = seeded(i * 17.9) > 0.5 ? 0xf0e08a : 0xe8a0c4;
      g.circle(px(x), py(y) - s, s).fill({ color: col, alpha: 0.75 });
    }
  }

  drawRiver(g, tile, squash);
  drawBridges(g, tile, squash);
}

/** Wavy-edged water band with a shallow-to-deep gradient. */
function drawRiver(g: Graphics, tile: number, squash: number) {
  const px = (v: number) => v * tile;
  const py = (v: number) => v * tile * squash;
  const top = ARENA.riverTop;
  const bottom = ARENA.riverBottom;
  const steps = 40;

  /** Polygon spanning the full width between two wavy horizontal edges. */
  const band = (yTop: number, yBottom: number, ampTop: number, ampBottom: number, seed: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(px(t * ARENA.width), py(yTop + wobble(t, seed) * ampTop));
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      pts.push(px(t * ARENA.width), py(yBottom + wobble(t, seed + 5.5) * ampBottom));
    }
    return pts;
  };

  // wet sand fringe under the wave line, so the bank is not a hard cut
  g.poly(band(top - 0.16, bottom + 0.16, 0.07, 0.07, 3.3)).fill({
    color: 0x9c8a63,
    alpha: 0.5,
  });
  g.poly(band(top, bottom, 0.07, 0.07, 3.3)).fill(TERRAIN.river);
  // depth: a darker core, then a bright lip along the near bank
  g.poly(band(top + 0.3, bottom - 0.28, 0.05, 0.05, 6.1)).fill({
    color: TERRAIN.riverDeep,
    alpha: 0.75,
  });
  g.poly(band(top + 0.04, top + 0.2, 0.07, 0.06, 3.3)).fill({
    color: TERRAIN.riverShallow,
    alpha: 0.85,
  });
  g.poly(band(bottom - 0.16, bottom - 0.03, 0.06, 0.07, 3.3)).fill({
    color: TERRAIN.riverShallow,
    alpha: 0.4,
  });

  // static foam flecks; the moving highlights live in drawWaterFx
  for (let i = 0; i < 22; i++) {
    const x = seeded(i * 3.7 + 500) * ARENA.width;
    const y = top + 0.25 + seeded(i * 5.3 + 91) * (bottom - top - 0.5);
    g.ellipse(px(x), py(y), tile * 0.22, py(0.045)).fill({ color: 0xffffff, alpha: 0.18 });
  }
}

function drawBridges(g: Graphics, tile: number, squash: number) {
  const px = (v: number) => v * tile;
  const py = (v: number) => v * tile * squash;
  const y0 = ARENA.riverTop - 0.5;
  const y1 = ARENA.riverBottom + 0.5;

  for (const bx of [ARENA.bridgeLeftX, ARENA.bridgeRightX]) {
    const bw = ARENA.bridgeHalfWidth * 2 * tile;
    const x0 = px(bx) - bw / 2;

    // cast shadow on the water
    g.roundRect(x0 + tile * 0.1, py(y0) + py(0.12), bw, py(y1 - y0), tile * 0.1).fill({
      color: 0x0d2c40,
      alpha: 0.32,
    });

    g.roundRect(x0, py(y0), bw, py(y1 - y0), tile * 0.09).fill(TERRAIN.bridgeDark);

    // planks — varied widths and tones so it reads as timber, not stripes
    let y = y0 + 0.06;
    let i = 0;
    while (y < y1 - 0.08) {
      const ph = 0.14 + seeded(i * 9.7 + bx) * 0.1;
      const tone = seeded(i * 4.3 + bx * 2);
      g.rect(x0 + tile * 0.05, py(y), bw - tile * 0.1, py(ph)).fill({
        color: tone > 0.66 ? TERRAIN.bridgeLight : tone > 0.33 ? TERRAIN.bridge : TERRAIN.bridgeDark,
      });
      y += ph + 0.045;
      i++;
    }

    // side rails plus posts at the four corners
    for (const side of [-1, 1]) {
      const rx = px(bx) + side * (bw / 2 - tile * 0.07);
      g.rect(rx - tile * 0.05, py(y0), tile * 0.1, py(y1 - y0)).fill(TERRAIN.bridgeDark);
      for (const py0 of [y0 + 0.1, y1 - 0.22]) {
        g.roundRect(rx - tile * 0.11, py(py0), tile * 0.22, py(0.34), tile * 0.05).fill(
          TERRAIN.bridge,
        );
        g.roundRect(rx - tile * 0.11, py(py0), tile * 0.22, py(0.1), tile * 0.04).fill(
          TERRAIN.bridgeLight,
        );
      }
    }
  }
}

/**
 * The only part of the board that animates: highlights drifting downstream and
 * foam pulsing where the bridges meet the water. Redrawn every frame, so it is
 * deliberately kept to a couple dozen primitives.
 */
export function drawWaterFx(g: Graphics, tile: number, squash: number, time: number) {
  const px = (v: number) => v * tile;
  const py = (v: number) => v * tile * squash;
  const top = ARENA.riverTop;
  const bottom = ARENA.riverBottom;

  g.clear();

  for (let i = 0; i < 14; i++) {
    const speed = 0.6 + seeded(i * 2.9) * 0.9;
    const drift = (seeded(i * 6.1) * ARENA.width + time * speed) % (ARENA.width + 3) - 1.5;
    const y = top + 0.2 + seeded(i * 8.3) * (bottom - top - 0.4);
    const len = 0.5 + seeded(i * 12.7) * 1.1;
    const pulse = 0.12 + 0.1 * Math.sin(time * 2.2 + i);
    g.roundRect(px(drift), py(y), px(len), py(0.07), py(0.035)).fill({
      color: 0xffffff,
      alpha: pulse,
    });
  }

  // foam collar where each bridge pier breaks the current
  for (const bx of [ARENA.bridgeLeftX, ARENA.bridgeRightX]) {
    const bw = ARENA.bridgeHalfWidth * 2 * tile;
    for (const side of [-1, 1]) {
      const x = px(bx) + side * (bw / 2);
      const swell = 0.55 + 0.45 * Math.sin(time * 3.1 + side);
      g.ellipse(x, py((top + bottom) / 2), tile * 0.18, py(0.42)).fill({
        color: 0xdff2ff,
        alpha: 0.14 + swell * 0.12,
      });
    }
  }
}

/**
 * Soft darkening toward the edges of the board. Pixi's radial gradients are not
 * worth the risk here, so this is 22 nested rounded rects each adding a sliver
 * of black — built once, then left alone.
 */
export function drawVignette(g: Graphics, w: number, h: number, tile: number) {
  g.clear();
  const rings = 22;
  const depth = tile * 3.4;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    const inset = (depth * i) / rings;
    g.roundRect(inset, inset, w - inset * 2, h - inset * 2, tile * 0.4).stroke({
      width: depth / rings + 1.2,
      color: 0x120c07,
      alpha: 0.075 * (1 - t) ** 1.3,
      alignment: 0,
    });
  }
}

/**
 * The half-board (or whole board, for spells) where the selected card may be
 * dropped. Diagonal hatching reads as "reserved area" far better than the flat
 * white wash it replaces, and the border pulses so the eye finds the line.
 */
export function drawDeployZone(
  g: Graphics,
  tile: number,
  squash: number,
  bands: { y0: number; y1: number; x0: number; x1: number }[],
  time: number,
  color: number,
  /** Punched-out boxes inside the zone — the enemy king's safety area. */
  blocked?: { x0: number; x1: number; y0: number; y1: number }[],
) {
  const px = (v: number) => v * tile;
  const py = (v: number) => v * tile * squash;

  g.clear();
  for (const b of bands) {
    const x0 = px(b.x0);
    const x1 = px(b.x1);
    const y0 = py(b.y0);
    const y1 = py(b.y1);
    const w = x1 - x0;
    const h = y1 - y0;

    g.rect(x0, y0, w, h).fill({ color, alpha: 0.1 });

    // 45° hatch, scrolling slowly so the zone feels live
    const gap = tile * 0.85;
    const shift = (time * tile * 0.22) % gap;
    for (let d = -h; d < w + h; d += gap) {
      const sx = x0 + d + shift;
      g.moveTo(sx, y1)
        .lineTo(sx + h, y0)
        .stroke({ width: Math.max(1, tile * 0.06), color, alpha: 0.09 });
    }
  }

  // bright edge along the front line of the zone
  const front = bands.reduce((min, b) => Math.min(min, b.y0), Infinity);
  if (Number.isFinite(front)) {
    const glow = 0.35 + 0.2 * Math.sin(time * 2.6);
    g.rect(0, py(front) - 1, px(ARENA.width), 2).fill({ color, alpha: glow });
    g.rect(0, py(front) - 3, px(ARENA.width), 6).fill({ color, alpha: glow * 0.25 });
  }

  // king safety box — drawn on top in warning red so it reads as off-limits
  for (const b of blocked ?? []) {
    const x0 = px(b.x0);
    const x1 = px(b.x1);
    const y0 = py(b.y0);
    const y1 = py(b.y1);
    const bw = x1 - x0;
    const bh = y1 - y0;
    const pulse = 0.45 + 0.18 * Math.sin(time * 3.1);

    g.rect(x0, y0, bw, bh).fill({ color: 0x1a0a0a, alpha: 0.3 });
    g.rect(x0, y0, bw, bh).stroke({
      width: Math.max(1.5, tile * 0.07),
      color: 0xff6b5a,
      alpha: pulse,
    });
    // counter-hatch, so the blocked box reads against the zone's own hatching
    const gap = tile * 0.7;
    for (let d = -bh; d < bw + bh; d += gap) {
      const sx = x0 + d;
      const ax = Math.max(x0, Math.min(x1, sx));
      const ay = y0 + (sx - ax);
      const ex = Math.max(x0, Math.min(x1, sx + bh));
      const ey = y0 + (sx + bh - ex);
      g.moveTo(ax, Math.max(y0, Math.min(y1, ay)))
        .lineTo(ex, Math.max(y0, Math.min(y1, ey)))
        .stroke({ width: Math.max(1, tile * 0.05), color: 0xff6b5a, alpha: 0.18 });
    }
  }
}
