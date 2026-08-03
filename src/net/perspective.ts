/**
 * Board perspective: every player must see themselves at the bottom.
 *
 * The simulation always keeps team 0 at the bottom and team 1 at the top
 * (see `TOWER_SPOTS` in `src/sim/arena.ts`). So for whoever is really team 1,
 * we rotate the whole board 180° and swap the team labels before sending. Their
 * client then renders it exactly like a normal "I am team 0" match, which is
 * why `Ui`/`Renderer` need no perspective logic of their own.
 *
 * The rotation is an involution — applying it twice gives back the original —
 * so the same function converts a team-1 client's tap coordinates back into
 * simulation space.
 */

import { ARENA } from '../sim/arena';
import type { Effect, Entity, PendingSpell, Projectile, RageZone, Side, Team } from '../sim/types';
import type { NetWorldSnapshot } from './protocol';

export const flipX = (x: number): number => ARENA.width - x;
export const flipY = (y: number): number => ARENA.height - y;

/** Rotate a point 180° about the centre of the arena. */
export function flipPoint(x: number, y: number): { x: number; y: number } {
  return { x: flipX(x), y: flipY(y) };
}

const otherTeam = (team: Team): Team => (team === 0 ? 1 : 0);
const otherSide = (side?: Side): Side | undefined =>
  side === 'left' ? 'right' : side === 'right' ? 'left' : side;
const swap = <T>(pair: [T, T]): [T, T] => [pair[1], pair[0]];

function flipEntity(e: Entity): Entity {
  const out: Entity = {
    ...e,
    team: otherTeam(e.team),
    side: otherSide(e.side),
    x: flipX(e.x),
    y: flipY(e.y),
    px: flipX(e.px),
    py: flipY(e.py),
    // facing is an x-axis sign, so mirroring x mirrors it too
    facing: -e.facing,
  };
  if (e.jumpFromX !== undefined) out.jumpFromX = flipX(e.jumpFromX);
  if (e.jumpFromY !== undefined) out.jumpFromY = flipY(e.jumpFromY);
  if (e.jumpTargetX !== undefined) out.jumpTargetX = flipX(e.jumpTargetX);
  if (e.jumpTargetY !== undefined) out.jumpTargetY = flipY(e.jumpTargetY);
  return out;
}

function flipProjectile(p: Projectile): Projectile {
  return {
    ...p,
    team: otherTeam(p.team),
    x: flipX(p.x),
    y: flipY(p.y),
    px: flipX(p.px),
    py: flipY(p.py),
  };
}

function flipPendingSpell(s: PendingSpell): PendingSpell {
  return {
    ...s,
    team: otherTeam(s.team),
    x0: flipX(s.x0),
    y0: flipY(s.y0),
    x: flipX(s.x),
    y: flipY(s.y),
    px: flipX(s.px),
    py: flipY(s.py),
    tx: flipX(s.tx),
    ty: flipY(s.ty),
  };
}

function flipRageZone(z: RageZone): RageZone {
  return { ...z, team: otherTeam(z.team), x: flipX(z.x), y: flipY(z.y) };
}

export function flipEffect(fx: Effect): Effect {
  switch (fx.type) {
    case 'teslaZap':
    case 'infernoBeam':
      return { ...fx, x0: flipX(fx.x0), y0: flipY(fx.y0), x1: flipX(fx.x1), y1: flipY(fx.y1) };
    default:
      return { ...fx, x: flipX(fx.x), y: flipY(fx.y) };
  }
}

/** `win` and `lose` are stated from team 0's point of view, so they swap too. */
export function flipResult<T extends 'win' | 'lose' | 'draw' | null>(result: T): T {
  if (result === 'win') return 'lose' as T;
  if (result === 'lose') return 'win' as T;
  return result;
}

/**
 * Rewrite a snapshot so the recipient sees itself as team 0 at the bottom.
 * Pass `flip = false` for the player who really is team 0 — they get the
 * simulation's own view untouched.
 */
export function viewSnapshotAs(snap: NetWorldSnapshot, flip: boolean): NetWorldSnapshot {
  if (!flip) return snap;
  return {
    entities: snap.entities.map(flipEntity),
    projectiles: snap.projectiles.map(flipProjectile),
    pendingSpells: snap.pendingSpells.map(flipPendingSpell),
    rageZones: snap.rageZones.map(flipRageZone),
    elixir: swap(snap.elixir),
    time: snap.time,
    timeLeft: snap.timeLeft,
    phase: snap.phase,
    result: flipResult(snap.result),
    crowns: swap(snap.crowns),
    lastPlayed: swap(snap.lastPlayed),
  };
}

export function viewEffectsAs(effects: Effect[], flip: boolean): Effect[] {
  return flip ? effects.map(flipEffect) : effects;
}
