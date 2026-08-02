import type { Entity } from '../../sim/types';
import type { SpriteAnimState } from './types';

/** Derives the SpriteCook clip from simulation state (mirrors Godot top-down FSM, simplified). */
export function resolveAnimState(e: Entity): SpriteAnimState {
  if (e.deployLeft > 0) return 'idle';
  if (e.state === 'attacking' && e.swing > 0) return 'attack';
  if (e.state === 'moving' && e.speed > 0) return 'walk';
  return 'idle';
}
