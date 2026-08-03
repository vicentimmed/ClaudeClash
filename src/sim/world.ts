import {
  ARENA,
  ARENA_SQUASH,
  TOWER_SPOTS,
  nearestBridgeX,
  towerProjectileOrigin,
} from './arena';
import type {
  Balance,
  CardDef,
  Effect,
  Entity,
  MatchPhase,
  MatchResult,
  PendingSpell,
  Projectile,
  RageZone,
  Side,
  Team,
  TowerKind,
} from './types';

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

/** Offsets for spawner summons — plus shape around the caster (Witch). */
const SPAWN_PLUS: Array<[number, number]> = [
  [0, -0.55],
  [-0.55, 0],
  [0.55, 0],
  [0, 0.55],
];

/** Spawn offsets (in tiles) for multi-unit cards, so they don't stack. */
const FORMATIONS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-0.5, 0],
    [0.5, 0],
  ],
  3: [
    [0, -0.55],
    [-0.6, 0.35],
    [0.6, 0.35],
  ],
  4: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  15: [
    [-1.0, -0.6], [-0.5, -0.6], [0, -0.6], [0.5, -0.6], [1.0, -0.6],
    [-1.0, 0], [-0.5, 0], [0, 0], [0.5, 0], [1.0, 0],
    [-1.0, 0.6], [-0.5, 0.6], [0, 0.6], [0.5, 0.6], [1.0, 0.6],
  ],
};

interface PendingSpawn {
  team: Team;
  cardId: string;
  x: number;
  y: number;
  t: number;
}

export class World {
  readonly b: Balance;
  entities: Entity[] = [];
  projectiles: Projectile[] = [];
  /** spells travelling toward their target; damage lands only on arrival */
  pendingSpells: PendingSpell[] = [];
  /** delayed spawner summons (Tombstone stagger between skeletons) */
  private pendingSpawns: PendingSpawn[] = [];
  /** transient visual events, drained by the renderer every frame */
  effects: Effect[] = [];
  /** Rage spell pools — liquid stain on the ground while the buff is active */
  rageZones: RageZone[] = [];

  elixir: [number, number];
  time = 0;
  timeLeft: number;
  phase: MatchPhase = 'normal';
  result: MatchResult | null = null;
  /** towers destroyed, indexed by the team that destroyed them */
  crowns: [number, number] = [0, 0];

  /** Dev-only multiplier for elixir regen (does not affect units or match clock). */
  elixirSpeedMul = 1;

  /** Last card played per team — used by Mirror. */
  lastPlayed: [string | null, string | null] = [null, null];

  private nextId = 1;

  constructor(balance: Balance) {
    this.b = balance;
    this.elixir = [balance.global.elixirStart, balance.global.elixirStart];
    this.timeLeft = balance.global.matchDurationSec;

    for (const spot of TOWER_SPOTS) {
      const def = balance.towers[spot.towerKind];
      this.entities.push({
        id: this.nextId++,
        team: spot.team,
        kind: 'tower',
        cardId: spot.towerKind,
        x: spot.x,
        y: spot.y,
        px: spot.x,
        py: spot.y,
        hp: def.hp,
        maxHp: def.hp,
        radius: def.radius,
        damage: def.damage,
        range: def.range,
        attackSpeed: def.attackSpeed,
        speed: 0,
        sightRange: def.range,
        splashRadius: 0,
        projectileSpeed: def.projectileSpeed,
        targets: 'air+ground',
        flying: false,
        jumpsRiver: false,
        lifetimeLeft: 0,
        decayPerSec: 0,
        attackCd: 0,
        deployLeft: 0,
        stunLeft: 0,
        targetId: null,
        state: 'moving',
        facing: spot.team === 0 ? -1 : 1,
        animT: 0,
        hitFlash: 0,
        swing: 0,
        towerKind: spot.towerKind,
        side: spot.side,
        active: spot.towerKind === 'princess',
        rubble: false,
      });
    }
  }

  // ---------------------------------------------------------------- queries

  byId(id: number): Entity | undefined {
    return this.entities.find((e) => e.id === id && e.hp > 0);
  }

  towers(team: Team): Entity[] {
    return this.entities.filter((e) => e.kind === 'tower' && e.team === team && e.hp > 0);
  }

  /**
   * Elixir regen rate right now. Matches Clash Royale: last minute of
   * regulation is double, and overtime starts double then tightens to
   * triple for its closing stretch.
   */
  elixirRate(): number {
    const g = this.b.global;
    if (this.phase === 'overtime') {
      return this.timeLeft <= g.tripleElixirLastSec ? g.elixirRateSec / 3 : g.elixirRateSec / 2;
    }
    if (this.timeLeft <= g.doubleElixirLastSec) {
      return g.elixirRateSec / 2;
    }
    return g.elixirRateSec;
  }

  /** Is this side of the enemy's half open for deployment? */
  private sideUnlocked(team: Team, side: Side): boolean {
    const enemy: Team = team === 0 ? 1 : 0;
    return !this.entities.some(
      (e) => e.kind === 'tower' && e.team === enemy && e.side === side && e.hp > 0,
    );
  }

  /**
   * Centre of the enemy king tower, while it still stands. Drives the no-deploy
   * bubble that keeps an opened lane from becoming a free drop on the king.
   */
  enemyKingGuard(team: Team): { x: number; y: number } | undefined {
    const enemy: Team = team === 0 ? 1 : 0;
    const king = this.entities.find(
      (e) => e.kind === 'tower' && e.towerKind === 'king' && e.team === enemy && e.hp > 0,
    );
    return king ? { x: king.x, y: king.y } : undefined;
  }

  private clearOfEnemyKing(team: Team, x: number, y: number): boolean {
    const king = this.enemyKingGuard(team);
    if (!king) return true;
    return (
      Math.abs(x - king.x) >= ARENA.kingDeployBlockHalfW ||
      Math.abs(y - king.y) >= ARENA.kingDeployBlockHalfH
    );
  }

  canDeploy(team: Team, x: number, y: number, cardId?: string): boolean {
    if (x < 0.6 || x > ARENA.width - 0.6 || y < 0.6 || y > ARENA.height - 0.6) return false;
    // spells can be thrown anywhere on the board
    if (cardId && this.b.cards[cardId]?.kind === 'spell') return true;
    const side: Side = x < ARENA.width / 2 ? 'left' : 'right';
    if (team === 0) {
      if (y > ARENA.riverBottom + 0.3) return true;
      return this.sideUnlocked(0, side) && y > 3.5 && this.clearOfEnemyKing(0, x, y);
    }
    if (y < ARENA.riverTop - 0.3) return true;
    return (
      this.sideUnlocked(1, side) && y < ARENA.height - 3.5 && this.clearOfEnemyKing(1, x, y)
    );
  }

  // ---------------------------------------------------------------- actions

  /** Returns true if the card was actually played. */
  deploy(team: Team, cardId: string, x: number, y: number): boolean {
    if (this.phase === 'over') return false;
    let effectiveId = cardId;
    const mirrorCard = this.b.cards[cardId];
    if (!mirrorCard) return false;

    if (mirrorCard.mirror) {
      const last = this.lastPlayed[team];
      if (!last || last === 'mirror') return false;
      effectiveId = last;
    }

    const card: CardDef | undefined = this.b.cards[effectiveId];
    if (!card) return false;
    const cost = mirrorCard.mirror ? card.cost + 1 : mirrorCard.cost;
    if (this.elixir[team] < cost) return false;
    if (!this.canDeploy(team, x, y, effectiveId)) return false;

    this.elixir[team] -= cost;

    if (card.kind === 'spell') {
      this.castSpell(team, effectiveId, card, x, y);
    } else {
      const shape = FORMATIONS[card.count] ?? FORMATIONS[1];
      for (let i = 0; i < card.count; i++) {
        const [ox, oy] = shape[i % shape.length];
        this.spawnTroop(team, effectiveId, card, x + ox, y + oy);
      }
      this.effects.push({ type: 'deploy', x, y });
    }

    this.lastPlayed[team] = cardId;
    return true;
  }

  /**
   * Throwing a spell doesn't hit instantly: it launches from behind the
   * caster's own edge of the arena and flies to the target, exactly like a
   * real Fireball — damage only lands when `stepPendingSpells` sees it arrive.
   */
  private castSpell(team: Team, cardId: string, card: CardDef, x: number, y: number) {
    let originX = x;
    let originY = team === 0 ? ARENA.height + 1.6 : -1.6;
    let duration = Math.max(0.2, card.deployTime || 0.8);

    if (card.spellFromKing) {
      const king = TOWER_SPOTS.find((s) => s.team === team && s.towerKind === 'king');
      if (king) {
        originX = king.x;
        originY = king.y;
      }
      const travel = dist(originX, originY, x, y);
      duration = Math.max(0.7, travel / 7.5);
    }

    this.pendingSpells.push({
      id: this.nextId++,
      team,
      cardId,
      x0: originX,
      y0: originY,
      x: originX,
      y: originY,
      px: originX,
      py: originY,
      tx: x,
      ty: y,
      t: 0,
      duration,
      damage: card.damage,
      splashRadius: card.splashRadius,
      towerDamageFactor: card.towerDamageFactor,
      stunSec: card.stunSec,
      shape: card.visual.shape,
      body: card.visual.body,
      accent: card.visual.accent,
    });
  }

  private resolveSpellImpact(s: PendingSpell) {
    const card = this.b.cards[s.cardId];
    if (!card) return;

    if (s.cardId === 'goblin_barrel') {
      this.effects.push({
        type: 'spell',
        x: s.tx,
        y: s.ty,
        radius: s.splashRadius,
        shape: s.shape,
      });
      const summon = card.spellSpawnCardId ? this.b.cards[card.spellSpawnCardId] : undefined;
      if (summon) {
        const shape = FORMATIONS[card.spellSpawnCount ?? 3] ?? FORMATIONS[3];
        for (let i = 0; i < (card.spellSpawnCount ?? 3); i++) {
          const [ox, oy] = shape[i % shape.length];
          this.pendingSpawns.push({
            team: s.team,
            cardId: card.spellSpawnCardId!,
            x: s.tx + ox,
            y: s.ty + oy,
            t: 1.1,
          });
        }
      }
      return;
    }

    if (s.cardId === 'rage') {
      if (s.damage > 0) {
        this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor, undefined, s.cardId);
      }
      const duration = card.buffDurationSec ?? 5.5;
      this.rageZones.push({
        id: this.nextId++,
        team: s.team,
        x: s.tx,
        y: s.ty,
        radius: s.splashRadius,
        timeLeft: duration,
        duration,
        body: s.body,
        accent: s.accent,
      });
      this.applyRageZoneBuff(s.tx, s.ty, s.splashRadius, s.team, duration, card);
      this.effects.push({ type: 'spell', x: s.tx, y: s.ty, radius: s.splashRadius, shape: s.shape });
      return;
    }

    if (s.cardId === 'freeze') {
      if (s.damage > 0) {
        this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor, undefined, s.cardId);
      }
      const enemy: Team = s.team === 0 ? 1 : 0;
      const freezeSec = card.freezeSec ?? 4.0;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0) continue;
        if (dist(s.tx, s.ty, o.x, o.y) - o.radius > s.splashRadius) continue;
        o.stunLeft = Math.max(o.stunLeft, freezeSec);
        o.attackCd = Math.max(o.attackCd, freezeSec);
        if (o.infernoStage !== undefined) {
          o.infernoStage = 0;
          o.infernoStageT = 0;
          o.infernoTargetId = null;
        }
      }
      this.effects.push({ type: 'spell', x: s.tx, y: s.ty, radius: s.splashRadius, shape: s.shape });
      return;
    }

    this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor, undefined, s.cardId);
    if (s.stunSec > 0) {
      const enemy: Team = s.team === 0 ? 1 : 0;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0 || o.kind === 'tower') continue;
        if (dist(s.tx, s.ty, o.x, o.y) - o.radius > s.splashRadius) continue;
        o.stunLeft = Math.max(o.stunLeft, s.stunSec);
        o.attackCd = Math.max(o.attackCd, s.stunSec);
      }
    }
    this.effects.push({ type: 'spell', x: s.tx, y: s.ty, radius: s.splashRadius, shape: s.shape });
  }

  private stepPendingSpells(dt: number) {
    for (const s of this.pendingSpells) {
      s.t += dt;
      const k = Math.min(1, s.t / s.duration);
      s.x = s.x0 + (s.tx - s.x0) * k;
      s.y = s.y0 + (s.ty - s.y0) * k;
      if (k >= 1) {
        this.resolveSpellImpact(s);
      }
    }
    this.pendingSpells = this.pendingSpells.filter((s) => s.t < s.duration);
  }

  private applyRageZoneBuff(
    x: number,
    y: number,
    radius: number,
    team: Team,
    duration: number,
    card: CardDef,
  ) {
    const speedMul = card.buffSpeedMul ?? 1.35;
    const attackMul = card.buffAttackMul ?? 1.35;
    for (const o of this.entities) {
      if (o.team !== team || o.hp <= 0 || o.kind === 'tower') continue;
      if (dist(x, y, o.x, o.y) - o.radius > radius) continue;
      o.rageLeft = Math.max(o.rageLeft ?? 0, duration);
      o.rageSpeedMul = speedMul;
      o.rageAttackMul = attackMul;
    }
  }

  private stepRageZones(dt: number) {
    const card = this.b.cards.rage;
    if (!card) return;
    for (let i = this.rageZones.length - 1; i >= 0; i--) {
      const z = this.rageZones[i];
      z.timeLeft -= dt;
      if (z.timeLeft <= 0) {
        this.rageZones.splice(i, 1);
        continue;
      }
      this.applyRageZoneBuff(z.x, z.y, z.radius, z.team, z.timeLeft, card);
    }
  }

  private spawnTroop(
    team: Team,
    cardId: string,
    card: CardDef,
    x: number,
    y: number,
    instant = false,
  ) {
    const cx = Math.min(Math.max(x, 0.4), ARENA.width - 0.4);
    const cy = Math.min(Math.max(y, 0.4), ARENA.height - 0.4);
    this.entities.push({
      id: this.nextId++,
      team,
      kind: card.kind === 'building' ? 'building' : 'troop',
      cardId,
      x: cx,
      y: cy,
      px: cx,
      py: cy,
      hp: card.hp,
      maxHp: card.hp,
      radius: card.radius,
      damage: card.damage,
      range: card.range,
      attackSpeed: card.attackSpeed,
      speed: card.speed,
      sightRange: card.sightRange,
      splashRadius: card.splashRadius,
      projectileSpeed: card.projectileSpeed,
      targets: card.targets,
      flying: card.flying,
      jumpsRiver: card.jumpsRiver,
      lifetimeLeft: card.lifetimeSec,
      decayPerSec: card.lifetimeSec > 0 ? card.hp / card.lifetimeSec : 0,
      attackCd: card.firstAttackDelay ?? 0,
      deployLeft: instant ? 0 : card.deployTime,
      stunLeft: 0,
      targetId: null,
      state: instant ? 'moving' : 'deploying',
      facing: team === 0 ? -1 : 1,
      animT: Math.random() * 2,
      hitFlash: 0,
      swing: 0,
      spawnCd: card.spawnIntervalSec ? 0 : undefined,
      chargeAccum: card.chargeDistTiles ? 0 : undefined,
      charging: false,
      chargeTargetId: null,
      hidden: card.hidesUnderground ? false : undefined,
      towerFocusLocked: false,
      infernoStage: card.infernoStages ? 0 : undefined,
      infernoStageT: card.infernoStages ? 0 : undefined,
      infernoTargetId: card.infernoStages ? null : undefined,
      rageLeft: 0,
      rageSpeedMul: 1,
      rageAttackMul: 1,
      deploySplashPending: card.deploySplashDamage ? true : undefined,
      active: true,
      rubble: false,
    });
  }

  /** Periodic summons (Witch skeletons, Tombstone) — stops when the spawner dies. */
  private stepSpawner(e: Entity, dt: number) {
    if (e.deployLeft > 0 || e.spawnCd === undefined) return;
    const card = this.b.cards[e.cardId];
    if (!card?.spawnIntervalSec || !card.spawnCardId || !card.spawnCount) return;
    const summon = this.b.cards[card.spawnCardId];
    if (!summon) return;

    e.spawnCd -= dt;
    if (e.spawnCd > 0) return;

    for (let i = 0; i < card.spawnCount; i++) {
      const [ox, oy] = SPAWN_PLUS[i % SPAWN_PLUS.length];
      const delay = i * (card.spawnStaggerSec ?? 0);
      const sx = e.x + ox;
      const sy = e.y + oy;
      if (delay <= 0) {
        this.spawnTroop(e.team, card.spawnCardId, summon, sx, sy, true);
      } else {
        this.pendingSpawns.push({ team: e.team, cardId: card.spawnCardId, x: sx, y: sy, t: delay });
      }
    }
    this.effects.push({ type: 'deploy', x: e.x, y: e.y });
    e.spawnCd = card.spawnIntervalSec;
  }

  private stepPendingSpawns(dt: number) {
    const remaining: PendingSpawn[] = [];
    for (const p of this.pendingSpawns) {
      p.t -= dt;
      if (p.t <= 0) {
        const summon = this.b.cards[p.cardId];
        if (summon) this.spawnTroop(p.team, p.cardId, summon, p.x, p.y, true);
      } else {
        remaining.push(p);
      }
    }
    this.pendingSpawns = remaining;
  }

  /** Summon troops when a spawner building is destroyed or expires. */
  private deathSpawn(e: Entity) {
    const card = this.b.cards[e.cardId];
    if (!card) return;

    if (card.deathSplashDamage && card.deathSplashRadius) {
      this.splashDamage(e.team, e.x, e.y, card.deathSplashRadius, card.deathSplashDamage, 1, e);
      this.effects.push({ type: 'splash', x: e.x, y: e.y, radius: card.deathSplashRadius });
    }

    const splitId = card.deathSplitCardId;
    const splitCount = card.deathSplitCount;
    if (splitId && splitCount) {
      const summon = this.b.cards[splitId];
      if (summon) {
        for (let i = 0; i < splitCount; i++) {
          const [ox, oy] = SPAWN_PLUS[i % SPAWN_PLUS.length];
          this.spawnTroop(e.team, splitId, summon, e.x + ox, e.y + oy, true);
        }
        this.effects.push({ type: 'deploy', x: e.x, y: e.y });
      }
      return;
    }

    if (!card.deathSpawnCardId || !card.deathSpawnCount) return;
    const summon = this.b.cards[card.deathSpawnCardId];
    if (!summon) return;

    for (let i = 0; i < card.deathSpawnCount; i++) {
      const [ox, oy] = SPAWN_PLUS[i % SPAWN_PLUS.length];
      this.spawnTroop(e.team, card.deathSpawnCardId, summon, e.x + ox, e.y + oy, true);
    }
    this.effects.push({ type: 'deploy', x: e.x, y: e.y });
  }

  /** Tesla: retract underground when idle, rise when an enemy enters range. */
  private stepHiddenBuilding(e: Entity) {
    if (e.deployLeft > 0 || !this.b.cards[e.cardId]?.hidesUnderground) return;

    const inRange = this.nearestEnemyInRange(e, e.range);
    const wasHidden = e.hidden;

    if (inRange) {
      e.hidden = false;
      if (wasHidden) {
        e.attackCd = this.b.cards[e.cardId].firstAttackDelay ?? 0.5;
      }
    } else {
      e.hidden = true;
      e.targetId = null;
      e.state = 'moving';
    }
  }

  private nearestEnemyInRange(e: Entity, range: number): Entity | undefined {
    const enemy: Team = e.team === 0 ? 1 : 0;
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const o of this.entities) {
      if (o.team !== enemy || o.hp <= 0 || o.kind === 'tower') continue;
      if (o.flying && e.targets === 'ground') continue;
      const d = dist(e.x, e.y, o.x, o.y) - o.radius;
      if (d <= range && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ tick

  step(dt: number) {
    if (this.phase === 'over') return;
    this.time += dt;

    for (const e of this.entities) {
      e.px = e.x;
      e.py = e.y;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
    }
    for (const s of this.pendingSpells) {
      s.px = s.x;
      s.py = s.y;
    }

    this.stepClock(dt);
    this.stepElixir(dt);

    for (const e of this.entities) {
      if (e.hp <= 0) continue;
      e.animT += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.swing > 0) e.swing -= dt * 4;
      if (e.decayPerSec > 0) {
        e.lifetimeLeft -= dt;
        e.hp -= e.decayPerSec * dt;
      }
      if (e.deployLeft > 0) {
        e.deployLeft -= dt;
        if (e.deployLeft <= 0) {
          e.state = 'moving';
          if (e.deploySplashPending) {
            this.deploySplash(e);
            e.deploySplashPending = false;
          }
        }
        continue;
      }
      if (e.rageLeft && e.rageLeft > 0) {
        e.rageLeft -= dt;
        if (e.rageLeft <= 0) {
          e.rageSpeedMul = 1;
          e.rageAttackMul = 1;
        }
      }
      if (e.stunLeft > 0) {
        if (this.b.cards[e.cardId]?.chargeDistTiles) this.resetCharge(e);
        if (e.jumping) {
          e.jumping = false;
          e.jumpT = undefined;
          e.jumpLandLeft = 0;
        }
        e.stunLeft -= dt;
        this.stepSpawner(e, dt);
        this.stepHiddenBuilding(e);
        continue;
      }
      if (e.attackCd > 0) e.attackCd -= dt;
      if (e.jumpLandLeft && e.jumpLandLeft > 0) {
        e.jumpLandLeft -= dt;
        if (e.jumpLandLeft < 0) e.jumpLandLeft = 0;
      }
      this.stepSpawner(e, dt);
      this.stepHiddenBuilding(e);
      this.stepEntity(e, dt);
    }

    this.stepProjectiles(dt);
    this.stepPendingSpells(dt);
    this.stepPendingSpawns(dt);
    this.stepRageZones(dt);
    this.separate();
    this.cleanup();
    this.checkEnd();
  }

  private stepClock(dt: number) {
    this.timeLeft -= dt;
    if (this.timeLeft > 0) return;
    if (this.phase === 'normal') {
      if (this.crowns[0] !== this.crowns[1]) {
        this.finish(this.crowns[0] > this.crowns[1] ? 'win' : 'lose');
      } else {
        this.phase = 'overtime';
        this.timeLeft = this.b.global.overtimeSec;
      }
    } else if (this.phase === 'overtime') {
      if (this.crowns[0] !== this.crowns[1]) {
        this.finish(this.crowns[0] > this.crowns[1] ? 'win' : 'lose');
      } else {
        this.resolveTiebreaker();
      }
    }
  }

  /**
   * Clash Royale's real tiebreaker when overtime runs out still tied: every
   * troop vanishes and whichever crown tower is weakest by HP% falls. That
   * feeds into the same sudden-death branch `cleanup()` already uses for a
   * tower killed during overtime, so it decides the match immediately.
   */
  private resolveTiebreaker() {
    this.entities = this.entities.filter((e) => e.kind === 'tower');
    this.projectiles = [];
    this.pendingSpells = [];

    let weakest: Entity | undefined;
    let weakestRatio = Infinity;
    for (const t of this.entities) {
      if (t.hp <= 0) continue;
      const ratio = t.hp / t.maxHp;
      if (ratio < weakestRatio - 1e-9) {
        weakestRatio = ratio;
        weakest = t;
      }
    }
    if (!weakest) {
      this.finish('draw');
      return;
    }
    const tied = this.entities.some(
      (t) => t !== weakest && t.hp > 0 && Math.abs(t.hp / t.maxHp - weakestRatio) < 1e-9,
    );
    if (tied) {
      this.finish('draw');
      return;
    }
    weakest.hp = 0; // cleanup() below awards the crown and ends the match
  }

  private stepElixir(dt: number) {
    const rate = this.elixirRate();
    const max = this.b.global.elixirMax;
    const elixirDt = dt * this.elixirSpeedMul;
    this.elixir[0] = Math.min(max, this.elixir[0] + elixirDt / rate);
    this.elixir[1] = Math.min(max, this.elixir[1] + elixirDt / rate);
  }

  private stepEntity(e: Entity, dt: number) {
    if (e.hidden && e.cardId === 'tesla') return;

    const card = this.b.cards[e.cardId];

    if (e.jumping && card?.jumpMinDist) {
      this.stepMegaKnightJump(e, dt, card);
      return;
    }

    const target = this.acquireTarget(e);
    const prevTargetId = e.targetId;
    e.targetId = target ? target.id : null;

    if (card?.chargeDistTiles) {
      if (e.chargeTargetId != null && e.targetId !== e.chargeTargetId) this.resetCharge(e);
      if (e.targetId == null) this.resetCharge(e);
      else if (prevTargetId !== e.targetId) e.chargeTargetId = e.targetId;
      else if (e.chargeTargetId == null) e.chargeTargetId = e.targetId;
    }

    if (!target) {
      e.state = 'moving';
      return;
    }

    const d = dist(e.x, e.y, target.x, target.y);
    const reach = this.meleeReach(e, target);

    if (d <= reach) {
      e.state = 'attacking';
      if (target.kind === 'tower' && e.kind === 'troop' && e.targets !== 'buildings') {
        e.towerFocusLocked = true;
      }
      if (target.x !== e.x) e.facing = target.x < e.x ? -1 : 1;
      if (e.attackCd <= 0 && e.active) {
        e.attackCd = e.attackSpeed / (e.rageAttackMul ?? 1);
        e.swing = 1;
        const dmg =
          e.charging && card?.chargeDamageMul ? e.damage * card.chargeDamageMul : e.damage;
        if (e.charging) this.resetCharge(e);
        this.fire(e, target, dmg);
      }
      return;
    }

    if (e.kind === 'tower' || e.speed <= 0) {
      e.state = 'moving';
      return;
    }

    // Mega Knight jump — slow arc, damage on landing
    if (card?.jumpMinDist && card.jumpMaxDist && card.jumpDamage && !e.jumping) {
      const edgeD = d - target.radius;
      if (edgeD >= card.jumpMinDist && edgeD <= card.jumpMaxDist && e.attackCd <= 0) {
        const jx = target.x + (e.x - target.x) * 0.25;
        const jy = target.y + (e.y - target.y) * 0.25;
        e.jumping = true;
        e.jumpFromX = e.x;
        e.jumpFromY = e.y;
        e.jumpTargetX = jx;
        e.jumpTargetY = jy;
        e.jumpT = 0;
        e.jumpLandLeft = 0;
        e.state = 'moving';
        if (target.x !== e.x) e.facing = target.x < e.x ? -1 : 1;
        return;
      }
    }

    e.state = 'moving';
    const [bwx, bwy] = this.waypoint(e, target.x, target.y);
    const [wx, wy] = this.avoidTowers(e, bwx, bwy);
    const dx = wx - e.x;
    const dy = wy - e.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const moveSpeed = e.speed * (e.rageSpeedMul ?? 1);
    const stepLen = Math.min(moveSpeed * dt, len);
    e.x += (dx / len) * stepLen;
    e.y += (dy / len) * stepLen;
    if (Math.abs(dx) > 0.05) e.facing = dx < 0 ? -1 : 1;

    if (card?.chargeDistTiles && !e.charging) {
      e.chargeAccum = (e.chargeAccum ?? 0) + stepLen;
      if (e.chargeAccum >= card.chargeDistTiles) {
        e.charging = true;
        e.speed = card.chargeSpeed ?? card.speed * 2;
        if (card.chargeJumpsRiver) e.jumpsRiver = true;
      }
    }
  }

  /** Mega Knight: heavy leap — position lerps slowly; splash fires when he lands. */
  private stepMegaKnightJump(e: Entity, dt: number, card: CardDef) {
    const duration = card.jumpDurationSec ?? 1.05;
    e.jumpT = (e.jumpT ?? 0) + dt;
    const k = Math.min(1, e.jumpT / duration);
    const ease = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    e.x = e.jumpFromX! + (e.jumpTargetX! - e.jumpFromX!) * ease;
    e.y = e.jumpFromY! + (e.jumpTargetY! - e.jumpFromY!) * ease;
    e.state = 'moving';
    if (k < 1) return;

    e.jumping = false;
    e.x = e.jumpTargetX!;
    e.y = e.jumpTargetY!;
    e.jumpT = undefined;
    this.splashDamage(e.team, e.x, e.y, card.jumpRadius ?? 2.5, card.jumpDamage!, 1, e);
    this.effects.push({ type: 'splash', x: e.x, y: e.y, radius: card.jumpRadius ?? 2.5 });
    e.attackCd = 0.65;
    e.swing = 1;
    e.jumpLandLeft = 0.42;
  }

  /** Prince: end charge and restore normal movement. */
  private resetCharge(e: Entity) {
    const card = this.b.cards[e.cardId];
    if (!card?.chargeDistTiles) return;
    e.charging = false;
    e.chargeAccum = 0;
    e.chargeTargetId = null;
    e.speed = card.speed;
    e.jumpsRiver = card.jumpsRiver;
  }

  /** Mega Knight landing shockwave when deploy finishes. */
  private deploySplash(e: Entity) {
    const card = this.b.cards[e.cardId];
    if (!card?.deploySplashDamage) return;
    this.splashDamage(
      e.team,
      e.x,
      e.y,
      card.deploySplashRadius ?? 2.5,
      card.deploySplashDamage,
      1,
      e,
    );
    this.effects.push({
      type: 'splash',
      x: e.x,
      y: e.y,
      radius: card.deploySplashRadius ?? 2.5,
    });
  }

  /**
   * Ground units can only cross the river on a bridge, so we steer them to the
   * nearest bridge mouth first and only then toward the real target.
   */
  private waypoint(e: Entity, tx: number, ty: number): [number, number] {
    if (e.flying || e.jumpsRiver) return [tx, ty];
    const { riverTop, riverBottom } = ARENA;
    const onTop = e.y < riverTop;
    const onBottom = e.y > riverBottom;
    const inRiver = !onTop && !onBottom;
    const targetTop = ty < riverTop;
    const targetBottom = ty > riverBottom;
    const mustCross = (onTop && targetBottom) || (onBottom && targetTop);

    if (!mustCross && !inRiver) return [tx, ty];

    const bx = nearestBridgeX(e.x);
    if (inRiver) {
      // already on the bridge — keep walking straight across
      return [bx, targetTop || onBottom ? riverTop - 0.7 : riverBottom + 0.7];
    }
    if (Math.abs(e.x - bx) > 0.35) {
      // line up with the bridge mouth on our own side of the river
      return [bx, onBottom ? riverBottom + 0.7 : riverTop - 0.7];
    }
    return [bx, onBottom ? riverTop - 0.7 : riverBottom + 0.7];
  }

  /**
   * Towers are solid now, and steering alone stalls when one sits exactly on
   * the line to the waypoint — the separation push comes back along the same
   * axis the unit is pushing into. That is the common case, since each princess
   * tower shares its lane's x with the bridge. So when a tower blocks the path
   * we aim at its edge instead and let the unit resume once it is clear.
   */
  private avoidTowers(e: Entity, wx: number, wy: number): [number, number] {
    if (e.flying) return [wx, wy];
    const dx = wx - e.x;
    const dy = wy - e.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return [wx, wy];
    const ux = dx / len;
    const uy = dy / len;

    for (const t of this.entities) {
      if (t.kind !== 'tower' || t.hp <= 0) continue;
      // walking in to attack it is not "blocked"
      if (e.targetId === t.id) continue;
      const clear = t.radius + e.radius + 0.15;
      const relX = t.x - e.x;
      const relY = t.y - e.y;
      const along = relX * ux + relY * uy;
      // ignore towers behind us or well past the waypoint
      if (along <= 0 || along > len + t.radius) continue;
      const side = relX * -uy + relY * ux;
      if (Math.abs(side) >= clear) continue;

      let dir: number;
      if (Math.abs(side) < 0.05) {
        // dead-on: step off toward mid-field rather than into the side wall
        dir = (ARENA.width / 2 - t.x) * -uy >= 0 ? 1 : -1;
      } else {
        dir = side >= 0 ? -1 : 1;
      }
      // Aim past the tower, not merely beside it: a point level with the tower
      // is one the unit can actually reach, and it would then sit there with a
      // zero-length move vector instead of rounding the corner.
      const ahead = t.radius + 0.5;
      return [
        t.x + -uy * dir * clear + ux * ahead,
        t.y + ux * dir * clear + uy * ahead,
      ];
    }
    return [wx, wy];
  }

  private acquireTarget(e: Entity): Entity | undefined {
    const enemy: Team = e.team === 0 ? 1 : 0;

    if (this.b.cards[e.cardId]?.hidesUnderground) {
      return this.nearestEnemyInRange(e, e.range);
    }

    if (e.towerFocusLocked) {
      const locked = e.targetId != null ? this.byId(e.targetId) : undefined;
      if (locked && locked.kind === 'tower' && locked.team === enemy) {
        return locked;
      }
      e.towerFocusLocked = false;
    }

    const canScanTroops = !e.towerFocusLocked && e.targets !== 'buildings';
    if (canScanTroops) {
      let best: Entity | undefined;
      let bestD = e.kind === 'tower' ? e.range + e.radius : e.sightRange;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0 || o.kind === 'tower') continue;
        if (o.flying && e.targets === 'ground') continue;
        if (o.hidden && o.cardId === 'tesla') continue;
        const d = dist(e.x, e.y, o.x, o.y) - o.radius;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      if (best) return best;
    }

    if (e.kind === 'tower') return undefined;
    return this.nearestStructure(e, enemy);
  }

  /** Nearest enemy tower or building — what Giants and Hog Riders walk toward. */
  private nearestStructure(e: Entity, team: Team): Entity | undefined {
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const o of this.entities) {
      if (o.kind === 'troop' || o.team !== team || o.hp <= 0) continue;
      const d = dist(e.x, e.y, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /**
   * How close a melee unit must be before it stops and swings.
   * Self-centred splash (Valkyrie) uses the spin radius; others use weapon reach.
   */
  private meleeReach(e: Entity, target: Entity): number {
    if (e.splashRadius > 0 && e.projectileSpeed <= 0 && !e.flying) {
      return e.splashRadius + target.radius;
    }
    return e.range + e.radius + target.radius;
  }

  private fire(e: Entity, target: Entity, damageOverride?: number) {
    const card = this.b.cards[e.cardId];
    let dmg = damageOverride ?? e.damage;

    if (card?.infernoStages) {
      if (e.infernoTargetId !== target.id) {
        e.infernoStage = 0;
        e.infernoStageT = 0;
        e.infernoTargetId = target.id;
      } else {
        e.infernoStageT = (e.infernoStageT ?? 0) + e.attackSpeed;
        const maxStage = card.infernoStages.length - 1;
        if (
          e.infernoStageT >= (card.infernoStageSec ?? 1.2) &&
          (e.infernoStage ?? 0) < maxStage
        ) {
          e.infernoStage = (e.infernoStage ?? 0) + 1;
          e.infernoStageT = 0;
        }
      }
      dmg = card.infernoStages[e.infernoStage ?? 0];
    }

    if (e.projectileSpeed > 0) {
      let sx = e.x;
      let sy = e.y - 0.4;
      if (e.kind === 'tower' && e.towerKind) {
        const bowFlip = e.side === 'right' ? -1 : 1;
        const aimRad = Math.atan2(target.y - e.y, target.x - e.x);
        const origin = towerProjectileOrigin(e.towerKind as TowerKind, ARENA_SQUASH, e.active, {
          bowFlip,
          aimRad,
        });
        sx = e.x + origin.ox;
        sy = e.y + origin.oy;
      }
      this.projectiles.push({
        id: this.nextId++,
        team: e.team,
        x: sx,
        y: sy,
        px: sx,
        py: sy,
        targetId: target.id,
        speed: e.projectileSpeed,
        damage: dmg,
        splashRadius: e.splashRadius,
        color:
          e.kind === 'tower'
            ? '#e8e2d0'
            : e.cardId === 'witch'
              ? '#ff4da6'
              : this.b.cards[e.cardId].visual.accent,
        size: e.splashRadius > 0 ? 0.3 : 0.18,
      });
      return;
    }
    // instant ranged zap (Tesla, Inferno)
    if (e.projectileSpeed <= 0 && e.range > 1.2 && e.kind === 'building') {
      this.damage(target, dmg, { attacker: e });
      if (e.cardId === 'tesla') {
        this.effects.push({
          type: 'teslaZap',
          x0: e.x,
          y0: e.y - 0.55,
          x1: target.x,
          y1: target.y - 0.3,
        });
        this.effects.push({ type: 'hit', x: target.x, y: target.y - 0.3, color: '#8ff0ff' });
      } else if (e.cardId === 'inferno') {
        this.effects.push({
          type: 'infernoBeam',
          x0: e.x,
          y0: e.y - 0.45,
          x1: target.x,
          y1: target.y - 0.3,
          stage: e.infernoStage ?? 0,
        });
        this.effects.push({ type: 'hit', x: target.x, y: target.y - 0.3, color: '#ff4422' });
      } else {
        this.effects.push({ type: 'hit', x: target.x, y: target.y - 0.3, color: '#fff2c4' });
      }
      return;
    }
    // melee: splash is centred on the attacker so it reads as a 360° spin (Valkyrie)
    if (e.splashRadius > 0 && e.projectileSpeed <= 0 && !e.flying) {
      this.splashDamage(e.team, e.x, e.y, e.splashRadius, dmg, 1, e);
      // At max melee reach the primary target can sit just outside the splash disc (large towers).
      if (dist(e.x, e.y, target.x, target.y) - target.radius > e.splashRadius) {
        this.damage(target, dmg, { attacker: e });
        this.effects.push({ type: 'hit', x: target.x, y: target.y - 0.3, color: '#fff2c4' });
      }
      this.effects.push({ type: 'splash', x: e.x, y: e.y, radius: e.splashRadius });
    } else if (e.splashRadius > 0) {
      this.splashDamage(e.team, e.x, e.y, e.splashRadius, dmg, 1, e);
      this.effects.push({ type: 'splash', x: e.x, y: e.y, radius: e.splashRadius });
    } else {
      this.damage(target, dmg, { attacker: e });
      this.effects.push({ type: 'hit', x: target.x, y: target.y - 0.3, color: '#fff2c4' });
    }
  }

  private stepProjectiles(dt: number) {
    for (const p of this.projectiles) {
      const target = this.byId(p.targetId);
      if (!target) {
        p.speed = -1; // orphaned, drop it
        continue;
      }
      const dx = target.x - p.x;
      const dy = target.y - 0.3 - p.y;
      const len = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      if (len <= stepLen + target.radius) {
        if (p.splashRadius > 0) {
          this.splashDamage(p.team, target.x, target.y, p.splashRadius, p.damage);
          this.effects.push({
            type: 'splash',
            x: target.x,
            y: target.y,
            radius: p.splashRadius,
          });
        } else {
          this.damage(target, p.damage, { attackerTeam: p.team });
          this.effects.push({ type: 'hit', x: target.x, y: target.y - 0.3, color: p.color });
        }
        p.speed = -1;
        continue;
      }
      p.x += (dx / len) * stepLen;
      p.y += (dy / len) * stepLen;
    }
    this.projectiles = this.projectiles.filter((p) => p.speed > 0);
  }

  private splashDamage(
    team: Team,
    x: number,
    y: number,
    radius: number,
    amount: number,
    towerFactor = 1,
    attacker?: Entity,
    spellCardId?: string,
  ) {
    const enemy: Team = team === 0 ? 1 : 0;
    for (const o of this.entities) {
      if (o.team !== enemy || o.hp <= 0) continue;
      if (dist(x, y, o.x, o.y) - o.radius > radius) continue;
      this.damage(o, o.kind === 'tower' ? amount * towerFactor : amount, {
        spell: !attacker,
        attacker,
        spellCardId,
      });
    }
  }

  private damage(
    target: Entity,
    amount: number,
    opts?: { spell?: boolean; attacker?: Entity; attackerTeam?: Team; spellCardId?: string },
  ) {
    if (target.hp <= 0) return;
    if (this.isDamageBlocked(target, opts)) return;
    target.hp -= amount;
    target.hitFlash = 0.16;
    if (target.towerKind === 'king') target.active = true;
    this.resetTowerFocusIfHit(target, opts);
  }

  /** Tesla zap and Zap spell reset tower focus on troops that can attack units. */
  private resetTowerFocusIfHit(
    target: Entity,
    opts?: { attacker?: Entity; spellCardId?: string },
  ) {
    const hitByTesla = opts?.attacker?.cardId === 'tesla';
    const hitByZap = opts?.spellCardId === 'zap';
    if ((hitByTesla || hitByZap) && target.targets !== 'buildings') {
      target.towerFocusLocked = false;
    }
  }

  /** Hidden Tesla ignores most damage while underground. */
  private isDamageBlocked(
    target: Entity,
    opts?: { spell?: boolean; attacker?: Entity; attackerTeam?: Team },
  ): boolean {
    if (!target.hidden || target.cardId !== 'tesla' || target.deployLeft > 0) return false;
    if (opts?.spell) return true;
    if (opts?.attacker?.targets === 'buildings') return false;
    return true;
  }

  /** Push overlapping ground units apart so they don't pile into one pixel. */
  private separate() {
    // Towers join as immovable bodies: ground troops collide with them
    // regardless of team, so a unit dropped behind a friendly tower has to walk
    // around it instead of straight through. Standing rubble is skipped by the
    // hp check, and flyers never match a tower's `flying` flag.
    const movers = this.entities.filter(
      (e) =>
        (e.kind === 'troop' || e.kind === 'building' || e.kind === 'tower') && e.hp > 0,
    );
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      for (let j = i + 1; j < movers.length; j++) {
        const b = movers[j];
        if (a.flying !== b.flying) continue;
        const aFixed = a.kind !== 'troop';
        const bFixed = b.kind !== 'troop';
        if (aFixed && bFixed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min || d < 1e-5) continue;
        const push = (min - d) / 2;
        const nx = (dx / d) * push;
        const ny = (dy / d) * push;
        // heavier units (bigger radius) give way less; buildings never budge
        const aw = aFixed ? 0 : bFixed ? 2 : (b.radius / min) * 2;
        const bw = bFixed ? 0 : aFixed ? 2 : (a.radius / min) * 2;
        a.x -= nx * aw;
        a.y -= ny * aw;
        b.x += nx * bw;
        b.y += ny * bw;
      }
    }

    const troops = movers.filter((e) => e.kind === 'troop');
    for (const e of troops) {
      e.x = Math.min(Math.max(e.x, e.radius), ARENA.width - e.radius);
      e.y = Math.min(Math.max(e.y, e.radius), ARENA.height - e.radius);
      // keep ground units on the bridge while crossing (jumpers vault it)
      if (!e.flying && !e.jumpsRiver && e.y > ARENA.riverTop - 0.2 && e.y < ARENA.riverBottom + 0.2) {
        const bx = nearestBridgeX(e.x);
        const half = ARENA.bridgeHalfWidth - e.radius * 0.5;
        e.x = Math.min(Math.max(e.x, bx - half), bx + half);
      }
    }
  }

  private cleanup() {
    // rubble towers stay in the list forever, so skip the ones already scored
    const dead = this.entities.filter((e) => e.hp <= 0 && !e.rubble);
    if (dead.length === 0) return;

    for (const e of dead) {
      if (e.kind === 'tower') {
        e.rubble = true;
        this.crowns[e.team === 0 ? 1 : 0] += 1;
        this.effects.push({ type: 'towerDown', x: e.x, y: e.y, team: e.team });
        // losing a princess wakes up your king
        for (const t of this.entities) {
          if (t.team === e.team && t.towerKind === 'king' && t.hp > 0) t.active = true;
        }
        if (this.phase === 'overtime') {
          this.finish(e.team === 0 ? 'lose' : 'win');
        }
      } else {
        this.deathSpawn(e);
        const v = this.b.cards[e.cardId]?.visual;
        this.effects.push({
          type: 'death',
          x: e.x,
          y: e.y,
          color: v?.body ?? '#cccccc',
          scale: v?.scale ?? 1,
        });
      }
    }

    this.entities = this.entities.filter((e) => e.hp > 0 || e.kind === 'tower');
    // keep destroyed towers around as rubble, but make them inert
    for (const e of this.entities) {
      if (e.hp <= 0) {
        e.hp = 0;
        e.active = false;
        e.targetId = null;
      }
    }
  }

  private checkEnd() {
    if (this.phase === 'over') return;
    for (const e of this.entities) {
      if (e.towerKind === 'king' && e.hp <= 0) {
        this.finish(e.team === 0 ? 'lose' : 'win');
        return;
      }
    }
  }

  private finish(result: MatchResult) {
    this.phase = 'over';
    this.result = result;
    this.timeLeft = 0;
  }
}

/** Rotating hand of 4 + 1 next card, exactly like Clash Royale's cycle. */
export class Hand {
  hand: string[];
  queue: string[];

  constructor(deck: string[]) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.hand = shuffled.slice(0, 4);
    this.queue = shuffled.slice(4);
  }

  get next(): string {
    return this.queue[0];
  }

  play(index: number): string | null {
    const card = this.hand[index];
    if (!card) return null;
    const incoming = this.queue.shift();
    if (incoming === undefined) return null;
    this.hand[index] = incoming;
    this.queue.push(card);
    return card;
  }
}
