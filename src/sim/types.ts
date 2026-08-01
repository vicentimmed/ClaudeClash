export type Team = 0 | 1;
export type TargetKind = 'ground' | 'air+ground' | 'buildings';
export type CardKind = 'troop' | 'building' | 'spell';

export type UnitShape =
  | 'giant'
  | 'goblin'
  | 'goblins'
  | 'skeleton'
  | 'skeleton_army'
  | 'wizard'
  | 'witch'
  | 'valkyrie'
  | 'knight'
  | 'archer'
  | 'musketeer'
  | 'minipekka'
  | 'hogrider'
  | 'prince'
  | 'babydragon'
  | 'minion'
  | 'minions'
  | 'cannon'
  | 'tesla'
  | 'tombstone'
  | 'fireball'
  | 'arrows'
  | 'zap'
  | 'goblin_barrel'
  | 'balloon'
  | 'rage'
  | 'xbow'
  | 'freeze'
  | 'pekka'
  | 'mirror'
  | 'golem'
  | 'golemite'
  | 'mega_knight'
  | 'inferno';

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
  /** seconds after deploy before the first attack (Witch: 0.7) */
  firstAttackDelay?: number;
  /** spawner troops: card to summon periodically */
  spawnCardId?: string;
  /** spawner troops: how many units per wave */
  spawnCount?: number;
  /** spawner troops: seconds between waves after the first */
  spawnIntervalSec?: number;
  /** spawner troops: delay between each unit within the same wave (Tombstone: 0.5 s) */
  spawnStaggerSec?: number;
  /** spawner buildings: card to summon when destroyed or lifetime expires */
  deathSpawnCardId?: string;
  /** spawner buildings: how many units on death */
  deathSpawnCount?: number;
  /** buildings that retract underground when idle (Tesla) */
  hidesUnderground?: boolean;
  /** Prince-like: uninterrupted walk distance (tiles) before charge starts */
  chargeDistTiles?: number;
  /** speed while charging (tiles/s) */
  chargeSpeed?: number;
  /** damage multiplier on a charge hit */
  chargeDamageMul?: number;
  /** can jump the river only while charging */
  chargeJumpsRiver?: boolean;
  /** spell: spawns troops on arrival (Goblin Barrel) */
  spellSpawnCardId?: string;
  /** spell: number of troops spawned on arrival */
  spellSpawnCount?: number;
  /** spell: launches from king tower instead of board edge */
  spellFromKing?: boolean;
  /** spell: buff duration (Rage) */
  buffDurationSec?: number;
  /** spell: movement speed multiplier while buffed */
  buffSpeedMul?: number;
  /** spell: attack speed multiplier while buffed */
  buffAttackMul?: number;
  /** spell: freeze duration (Freeze) */
  freezeSec?: number;
  /** death explosion damage */
  deathSplashDamage?: number;
  /** death explosion radius (tiles) */
  deathSplashRadius?: number;
  /** splits into another card on death (Golem) */
  deathSplitCardId?: string;
  /** how many units on split */
  deathSplitCount?: number;
  /** inferno tower damage stages */
  infernoStages?: number[];
  /** seconds on same target before inferno stage increases */
  infernoStageSec?: number;
  /** splash damage when deployed (Mega Knight) */
  deploySplashDamage?: number;
  deploySplashRadius?: number;
  /** Mega Knight jump */
  jumpMinDist?: number;
  jumpMaxDist?: number;
  jumpDamage?: number;
  jumpRadius?: number;
  /** seconds for the leap arc (heavy = slow) */
  jumpDurationSec?: number;
  /** Mirror spell — copies last played card */
  mirror?: boolean;
  /** Internal spawn units — hidden from deck builder (Golemites) */
  spawnOnly?: boolean;
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
  /** spawner troops: countdown until the next summon wave */
  spawnCd?: number;
  /** Prince: tiles walked toward current target without attacking */
  chargeAccum?: number;
  /** Prince: currently charging — double damage, fast speed */
  charging?: boolean;
  /** Prince: target id used for charge tracking */
  chargeTargetId?: number | null;
  /** Tesla: retracted underground — immune to most damage, can't attack */
  hidden?: boolean;
  /** Once attacking a tower, unit ignores nearby enemy troops until Tesla resets focus */
  towerFocusLocked?: boolean;
  /** Inferno Tower: current beam damage stage (0–2) */
  infernoStage?: number;
  /** Inferno Tower: time on current target at current stage */
  infernoStageT?: number;
  /** Inferno Tower: last target id for ramp tracking */
  infernoTargetId?: number | null;
  /** Rage buff time remaining */
  rageLeft?: number;
  rageSpeedMul?: number;
  rageAttackMul?: number;
  /** Mega Knight: jump in progress */
  jumping?: boolean;
  jumpFromX?: number;
  jumpFromY?: number;
  jumpTargetX?: number;
  jumpTargetY?: number;
  jumpT?: number;
  /** seconds left — arms lowering after landing */
  jumpLandLeft?: number;
  /** Mega Knight: deploy landing splash not yet fired */
  deploySplashPending?: boolean;

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
  cardId: string;
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

/** Persistent Rage spell pool on the arena floor — buffs allies while active. */
export interface RageZone {
  id: number;
  team: Team;
  x: number;
  y: number;
  radius: number;
  timeLeft: number;
  duration: number;
  body: string;
  accent: string;
}

export type Effect =
  | { type: 'hit'; x: number; y: number; color: string }
  | { type: 'splash'; x: number; y: number; radius: number }
  | { type: 'death'; x: number; y: number; color: string; scale: number }
  | { type: 'deploy'; x: number; y: number }
  | { type: 'towerDown'; x: number; y: number }
  | { type: 'spell'; x: number; y: number; radius: number; shape: UnitShape }
  | { type: 'teslaZap'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'infernoBeam'; x0: number; y0: number; x1: number; y1: number; stage: number };

export type MatchPhase = 'normal' | 'overtime' | 'over';
export type MatchResult = 'win' | 'lose' | 'draw';
