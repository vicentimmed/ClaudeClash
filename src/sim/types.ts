export type Team = 0 | 1;
export type TargetKind = 'ground' | 'air+ground' | 'buildings';
export type CardKind = 'troop' | 'building' | 'spell';

export type UnitShape =
  | 'giant'
  | 'goblin'
  | 'skeleton'
  | 'wizard'
  | 'valkyrie'
  | 'knight'
  | 'archer'
  | 'musketeer'
  | 'minipekka'
  | 'hogrider'
  | 'babydragon'
  | 'minion'
  | 'cannon'
  | 'fireball'
  | 'arrows'
  | 'zap';

export interface Visual {
  shape: UnitShape;
  /** hex string, e.g. "#d6a86a" */
  body: string;
  accent: string;
  /** height in tiles */
  scale: number;
}

export interface CardDef {
  name: string;
  kind: CardKind;
  cost: number;
  /** how many units spawn per card */
  count: number;
  hp: number;
  damage: number;
  /** seconds between hits */
  attackSpeed: number;
  /** tiles, edge to edge */
  range: number;
  /** tiles per second */
  speed: number;
  /** tiles — how far it looks for a target to divert to */
  sightRange: number;
  /** 0 = single target */
  splashRadius: number;
  targets: TargetKind;
  flying: boolean;
  /** seconds before it can act after being placed */
  deployTime: number;
  /** collision radius in tiles */
  radius: number;
  /** tiles per second; 0 = melee (instant hit) */
  projectileSpeed: number;
  /** troops that hop the river instead of using a bridge (Hog Rider) */
  jumpsRiver: boolean;
  /** buildings only: seconds before it decays away completely */
  lifetimeSec: number;
  /** spells only: seconds the hit units are frozen for */
  stunSec: number;
  /** spells only: fraction of the damage that reaches towers */
  towerDamageFactor: number;
  visual: Visual;
}

export interface TowerDef {
  hp: number;
  damage: number;
  attackSpeed: number;
  range: number;
  projectileSpeed: number;
  radius: number;
}

export interface GlobalDef {
  matchDurationSec: number;
  /** total length of overtime (sudden death) — double elixir, then triple for the closing stretch */
  overtimeSec: number;
  elixirStart: number;
  elixirMax: number;
  elixirRateSec: number;
  /** last N seconds of regulation run at double elixir */
  doubleElixirLastSec: number;
  /** last N seconds of overtime run at triple elixir */
  tripleElixirLastSec: number;
  tickRate: number;
}

export interface Balance {
  version: number;
  global: GlobalDef;
  towers: { princess: TowerDef; king: TowerDef };
  /** how many cards a deck holds */
  deckSize: number;
  /** the deck the player last used */
  deck: string[];
  cards: Record<string, CardDef>;
}

export type EntityKind = 'troop' | 'building' | 'tower';
export type EntityState = 'deploying' | 'moving' | 'attacking';
export type TowerKind = 'princess' | 'king';
export type Side = 'left' | 'right' | 'center';

export interface Entity {
  id: number;
  team: Team;
  kind: EntityKind;
  /** card id for troops, tower kind for towers */
  cardId: string;

  x: number;
  y: number;
  /** position at the start of the current tick, for render interpolation */
  px: number;
  py: number;

  hp: number;
  maxHp: number;
  radius: number;

  damage: number;
  range: number;
  attackSpeed: number;
  speed: number;
  sightRange: number;
  splashRadius: number;
  projectileSpeed: number;
  targets: TargetKind;
  flying: boolean;

  jumpsRiver: boolean;
  /** buildings: seconds of life left, and how fast they bleed HP */
  lifetimeLeft: number;
  decayPerSec: number;

  attackCd: number;
  deployLeft: number;
  /** frozen by a Zap; counts down before it can act again */
  stunLeft: number;
  targetId: number | null;
  state: EntityState;
  /** -1 facing left, 1 facing right */
  facing: number;
  /** seconds alive, drives walk cycle */
  animT: number;
  /** counts down after taking damage */
  hitFlash: number;
  /** 0..1 progress of the current swing, for the lunge animation */
  swing: number;

  towerKind?: TowerKind;
  side?: Side;
  /** king towers only shoot once activated */
  active: boolean;
  /** set once a destroyed tower has been scored, so it isn't counted twice */
  rubble: boolean;
}

export interface Projectile {
  id: number;
  team: Team;
  x: number;
  y: number;
  px: number;
  py: number;
  targetId: number;
  speed: number;
  damage: number;
  splashRadius: number;
  color: string;
  size: number;
}

/**
 * A spell in flight. It travels from the caster's edge of the arena to the
 * target and only deals damage on arrival — mirrors the real game, where you
 * can see a Fireball coming and pull troops back before it lands.
 */
export interface PendingSpell {
  id: number;
  team: Team;
  x0: number;
  y0: number;
  x: number;
  y: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  t: number;
  duration: number;
  damage: number;
  splashRadius: number;
  towerDamageFactor: number;
  stunSec: number;
  shape: UnitShape;
  body: string;
  accent: string;
}

export type Effect =
  | { type: 'hit'; x: number; y: number; color: string }
  | { type: 'splash'; x: number; y: number; radius: number }
  | { type: 'death'; x: number; y: number; color: string; scale: number }
  | { type: 'deploy'; x: number; y: number }
  | { type: 'towerDown'; x: number; y: number }
  | { type: 'spell'; x: number; y: number; radius: number; shape: UnitShape };

export type MatchPhase = 'normal' | 'overtime' | 'over';
export type MatchResult = 'win' | 'lose' | 'draw';
