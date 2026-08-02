import type { Side, Team, TowerKind } from './types';

/**
 * The arena is an 18 x 32 tile grid.
 * y = 0 is the enemy (team 1) back line, y = 32 is the player (team 0) back line.
 * All simulation math is in tiles; the renderer converts to pixels.
 */
export const ARENA = {
  width: 18,
  height: 32,
  riverTop: 15.4,
  riverBottom: 16.6,
  bridgeLeftX: 3.5,
  bridgeRightX: 14.5,
  bridgeHalfWidth: 1.05,
} as const;

/** Vertical squash used by the renderer — tower muzzle math stays aligned with sprites. */
export const ARENA_SQUASH = 0.72;

export interface TowerSpot {
  team: Team;
  towerKind: TowerKind;
  side: Side;
  x: number;
  y: number;
}

export const TOWER_SPOTS: TowerSpot[] = [
  { team: 1, towerKind: 'king', side: 'center', x: 9, y: 5.2 },
  { team: 1, towerKind: 'princess', side: 'left', x: 3.5, y: 6.8 },
  { team: 1, towerKind: 'princess', side: 'right', x: 14.5, y: 6.8 },
  { team: 0, towerKind: 'princess', side: 'left', x: 3.5, y: 25.2 },
  { team: 0, towerKind: 'princess', side: 'right', x: 14.5, y: 25.2 },
  { team: 0, towerKind: 'king', side: 'center', x: 9, y: 26.8 },
];

export function nearestBridgeX(x: number): number {
  return x < ARENA.width / 2 ? ARENA.bridgeLeftX : ARENA.bridgeRightX;
}

export function inRiverBand(y: number): boolean {
  return y > ARENA.riverTop && y < ARENA.riverBottom;
}

export function sideOfX(x: number): 'left' | 'right' {
  return x < ARENA.width / 2 ? 'left' : 'right';
}

/**
 * Sim-space offset (tiles) from a tower entity centre to its muzzle / bow.
 *
 * Lives here rather than next to the tower drawing code because the simulation
 * needs it to spawn projectiles, and `src/sim/` must stay free of any renderer
 * (and therefore Pixi) imports so it can run on the Node server.
 */
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
