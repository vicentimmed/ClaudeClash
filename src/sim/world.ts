import { ARENA, TOWER_SPOTS, nearestBridgeX } from './arena';
import type {
  Balance,
  CardDef,
  Effect,
  Entity,
  MatchPhase,
  MatchResult,
  PendingSpell,
  Projectile,
  Side,
  Team,
} from './types';

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

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
};

export class World {
  readonly b: Balance;
  entities: Entity[] = [];
  projectiles: Projectile[] = [];
  /** spells travelling toward their target; damage lands only on arrival */
  pendingSpells: PendingSpell[] = [];
  /** transient visual events, drained by the renderer every frame */
  effects: Effect[] = [];

  elixir: [number, number];
  time = 0;
  timeLeft: number;
  phase: MatchPhase = 'normal';
  result: MatchResult | null = null;
  /** towers destroyed, indexed by the team that destroyed them */
  crowns: [number, number] = [0, 0];

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

  canDeploy(team: Team, x: number, y: number, cardId?: string): boolean {
    if (x < 0.6 || x > ARENA.width - 0.6 || y < 0.6 || y > ARENA.height - 0.6) return false;
    // spells can be thrown anywhere on the board
    if (cardId && this.b.cards[cardId]?.kind === 'spell') return true;
    const side: Side = x < ARENA.width / 2 ? 'left' : 'right';
    if (team === 0) {
      if (y > ARENA.riverBottom + 0.3) return true;
      return this.sideUnlocked(0, side) && y > 3.5;
    }
    if (y < ARENA.riverTop - 0.3) return true;
    return this.sideUnlocked(1, side) && y < ARENA.height - 3.5;
  }

  // ---------------------------------------------------------------- actions

  /** Returns true if the card was actually played. */
  deploy(team: Team, cardId: string, x: number, y: number): boolean {
    if (this.phase === 'over') return false;
    const card: CardDef | undefined = this.b.cards[cardId];
    if (!card) return false;
    if (this.elixir[team] < card.cost) return false;
    if (!this.canDeploy(team, x, y, cardId)) return false;

    this.elixir[team] -= card.cost;

    if (card.kind === 'spell') {
      this.castSpell(team, card, x, y);
      return true;
    }

    const shape = FORMATIONS[card.count] ?? FORMATIONS[1];
    for (let i = 0; i < card.count; i++) {
      const [ox, oy] = shape[i % shape.length];
      this.spawnTroop(team, cardId, card, x + ox, y + oy);
    }
    this.effects.push({ type: 'deploy', x, y });
    return true;
  }

  /**
   * Throwing a spell doesn't hit instantly: it launches from behind the
   * caster's own edge of the arena and flies to the target, exactly like a
   * real Fireball — damage only lands when `stepPendingSpells` sees it arrive.
   */
  private castSpell(team: Team, card: CardDef, x: number, y: number) {
    const originY = team === 0 ? ARENA.height + 1.6 : -1.6;
    this.pendingSpells.push({
      id: this.nextId++,
      team,
      x0: x,
      y0: originY,
      x,
      y: originY,
      px: x,
      py: originY,
      tx: x,
      ty: y,
      t: 0,
      duration: Math.max(0.2, card.deployTime || 0.8),
      damage: card.damage,
      splashRadius: card.splashRadius,
      towerDamageFactor: card.towerDamageFactor,
      stunSec: card.stunSec,
      shape: card.visual.shape,
      body: card.visual.body,
      accent: card.visual.accent,
    });
  }

  private stepPendingSpells(dt: number) {
    for (const s of this.pendingSpells) {
      s.t += dt;
      const k = Math.min(1, s.t / s.duration);
      s.x = s.x0 + (s.tx - s.x0) * k;
      s.y = s.y0 + (s.ty - s.y0) * k;
      if (k >= 1) {
        this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor);
        if (s.stunSec > 0) {
          const enemy: Team = s.team === 0 ? 1 : 0;
          for (const o of this.entities) {
            if (o.team !== enemy || o.hp <= 0 || o.kind === 'tower') continue;
            if (dist(s.tx, s.ty, o.x, o.y) - o.radius > s.splashRadius) continue;
            o.stunLeft = Math.max(o.stunLeft, s.stunSec);
            o.attackCd = Math.max(o.attackCd, s.stunSec);
          }
        }
        this.effects.push({
          type: 'spell',
          x: s.tx,
          y: s.ty,
          radius: s.splashRadius,
          shape: s.shape,
        });
      }
    }
    this.pendingSpells = this.pendingSpells.filter((s) => s.t < s.duration);
  }

  private spawnTroop(team: Team, cardId: string, card: CardDef, x: number, y: number) {
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
      attackCd: 0,
      deployLeft: card.deployTime,
      stunLeft: 0,
      targetId: null,
      state: 'deploying',
      facing: team === 0 ? -1 : 1,
      animT: Math.random() * 2,
      hitFlash: 0,
      swing: 0,
      active: true,
      rubble: false,
    });
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
        if (e.deployLeft <= 0) e.state = 'moving';
        continue;
      }
      if (e.stunLeft > 0) {
        e.stunLeft -= dt;
        continue;
      }
      if (e.attackCd > 0) e.attackCd -= dt;
      this.stepEntity(e, dt);
    }

    this.stepProjectiles(dt);
    this.stepPendingSpells(dt);
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
    this.elixir[0] = Math.min(max, this.elixir[0] + dt / rate);
    this.elixir[1] = Math.min(max, this.elixir[1] + dt / rate);
  }

  private stepEntity(e: Entity, dt: number) {
    const target = this.acquireTarget(e);
    e.targetId = target ? target.id : null;

    if (!target) {
      e.state = 'moving';
      return;
    }

    const d = dist(e.x, e.y, target.x, target.y);
    const reach = e.range + e.radius + target.radius;

    if (d <= reach) {
      e.state = 'attacking';
      if (target.x !== e.x) e.facing = target.x < e.x ? -1 : 1;
      if (e.attackCd <= 0 && e.active) {
        e.attackCd = e.attackSpeed;
        e.swing = 1;
        this.fire(e, target);
      }
      return;
    }

    if (e.kind === 'tower' || e.speed <= 0) {
      e.state = 'moving';
      return;
    }

    e.state = 'moving';
    const [wx, wy] = this.waypoint(e, target.x, target.y);
    const dx = wx - e.x;
    const dy = wy - e.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const stepLen = Math.min(e.speed * dt, len);
    e.x += (dx / len) * stepLen;
    e.y += (dy / len) * stepLen;
    if (Math.abs(dx) > 0.05) e.facing = dx < 0 ? -1 : 1;
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

  private acquireTarget(e: Entity): Entity | undefined {
    const enemy: Team = e.team === 0 ? 1 : 0;

    if (e.targets !== 'buildings') {
      let best: Entity | undefined;
      let bestD = e.kind === 'tower' ? e.range + e.radius : e.sightRange;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0 || o.kind === 'tower') continue;
        if (o.flying && e.targets === 'ground') continue;
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

  private fire(e: Entity, target: Entity) {
    if (e.projectileSpeed > 0) {
      this.projectiles.push({
        id: this.nextId++,
        team: e.team,
        x: e.x,
        y: e.y - 0.4,
        px: e.x,
        py: e.y - 0.4,
        targetId: target.id,
        speed: e.projectileSpeed,
        damage: e.damage,
        splashRadius: e.splashRadius,
        color: e.kind === 'tower' ? '#e8e2d0' : this.b.cards[e.cardId].visual.accent,
        size: e.splashRadius > 0 ? 0.3 : 0.18,
      });
      return;
    }
    // melee: splash is centred on the attacker so it reads as a 360° swing
    if (e.splashRadius > 0) {
      this.splashDamage(e.team, e.x, e.y, e.splashRadius, e.damage);
      this.effects.push({ type: 'splash', x: e.x, y: e.y, radius: e.splashRadius });
    } else {
      this.damage(target, e.damage);
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
          this.damage(target, p.damage);
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
  ) {
    const enemy: Team = team === 0 ? 1 : 0;
    for (const o of this.entities) {
      if (o.team !== enemy || o.hp <= 0) continue;
      if (dist(x, y, o.x, o.y) - o.radius > radius) continue;
      this.damage(o, o.kind === 'tower' ? amount * towerFactor : amount);
    }
  }

  private damage(target: Entity, amount: number) {
    if (target.hp <= 0) return;
    target.hp -= amount;
    target.hitFlash = 0.16;
    if (target.towerKind === 'king') target.active = true;
  }

  /** Push overlapping ground units apart so they don't pile into one pixel. */
  private separate() {
    const movers = this.entities.filter(
      (e) => (e.kind === 'troop' || e.kind === 'building') && e.hp > 0,
    );
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      for (let j = i + 1; j < movers.length; j++) {
        const b = movers[j];
        if (a.flying !== b.flying) continue;
        const aFixed = a.kind === 'building';
        const bFixed = b.kind === 'building';
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
        this.effects.push({ type: 'towerDown', x: e.x, y: e.y });
        // losing a princess wakes up your king
        for (const t of this.entities) {
          if (t.team === e.team && t.towerKind === 'king' && t.hp > 0) t.active = true;
        }
        if (this.phase === 'overtime') {
          this.finish(e.team === 0 ? 'lose' : 'win');
        }
      } else {
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
