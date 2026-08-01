import { Application, Container, Graphics, Text } from 'pixi.js';
import { ARENA } from '../sim/arena';
import type { Entity, Team, UnitShape } from '../sim/types';
import type { World } from '../sim/world';
import { TEAM_COLOR, drawLightningBolt, drawTeslaTrapdoor, drawTower, drawUnit, hexToNum, shade, towerMetrics } from './shapes';

const GRASS = 0x6aa834;
const GRASS_ALT = 0x74b23a;
const PATH = 0xc9a86c;
const PATH_EDGE = 0xb08e56;
const RIVER = 0x2f96c9;
const BRIDGE = 0xa5764f;

const HP_FONT = {
  fontFamily: '"Baloo 2", system-ui, sans-serif',
  fontWeight: '700' as const,
  fill: 0xffffff,
  stroke: { color: 0x2b1e14, width: 3 },
};

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  spin: number;
}

interface BarGeom {
  x: number;
  y: number;
  w: number;
  h: number;
}

class EntityView {
  root = new Container();
  shadow = new Graphics();
  /** Tesla only: hatch drawn on the ground while retracted */
  trapdoor = new Graphics();
  bob = new Container();
  body = new Graphics();
  zapLine = new Graphics();
  spawnRing = new Graphics();
  hpBg = new Graphics();
  hpFg = new Graphics();
  hpText: Text | null = null;
  hpFgGeom: BarGeom | null = null;
  /** pixels the body floats above the ground shadow (flying units) */
  flyLift = 0;
  built = false;
  lastHpRatio = -1;
  lastHpValue = -1;
  lastHidden = false;
  dying = 0;

  constructor() {
    this.root.addChild(this.shadow, this.trapdoor, this.spawnRing, this.bob, this.zapLine, this.hpBg, this.hpFg);
    this.bob.addChild(this.body);
  }
}

export class Renderer {
  app = new Application();
  tile = 20;
  squash = 0.72;

  private root = new Container();
  private arenaG = new Graphics();
  private zoneG = new Graphics();
  private previewG = new Graphics();
  private entityLayer = new Container();
  private spellLayer = new Container();
  private projLayer = new Container();
  private fxLayer = new Container();

  private views = new Map<number, EntityView>();
  private projViews = new Map<number, Graphics>();
  private spellViews = new Map<
    number,
    { holder: Container; shadow: Graphics; icon: Graphics; drawn: boolean }
  >();
  private particles: Particle[] = [];

  private shake = 0;
  private host!: HTMLElement;
  /** 'half' = own side (troops), 'all' = whole board (spells) */
  zoneMode: 'none' | 'half' | 'all' = 'none';
  /** Placement preview — attack/splash radius circle at cursor (buildings & spells) */
  deployPreview: { x: number; y: number; range: number; color: number } | null = null;

  async init(host: HTMLElement) {
    this.host = host;
    await this.app.init({
      backgroundColor: 0x2a2119,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(this.app.canvas);
    this.entityLayer.sortableChildren = true;
    this.root.addChild(
      this.arenaG,
      this.zoneG,
      this.previewG,
      this.entityLayer,
      this.spellLayer,
      this.projLayer,
      this.fxLayer,
    );
    this.app.stage.addChild(this.root);
    this.layout();
  }

  /** Fit the 18x32 board into the available box, squashing vertically for a 2.5D feel. */
  layout() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.tile = w / ARENA.width;
    this.squash = Math.min(1, Math.max(0.5, h / (ARENA.height * this.tile)));
    this.root.position.set(0, (h - ARENA.height * this.tile * this.squash) / 2);
    this.drawArena();
    for (const view of this.views.values()) view.lastHpRatio = -1;
    this.rebuildBodies();
  }

  private rebuildBodies() {
    for (const view of this.views.values()) {
      view.body.clear();
      view.shadow.clear();
      view.trapdoor.clear();
      view.zapLine.clear();
      view.built = false;
    }
  }

  toScreen(x: number, y: number): [number, number] {
    return [x * this.tile, y * this.tile * this.squash];
  }

  /** Convert a pointer position (relative to the canvas) into tile coordinates. */
  fromScreen(px: number, py: number): [number, number] {
    return [px / this.tile, (py - this.root.position.y) / (this.tile * this.squash)];
  }

  private drawArena() {
    const g = this.arenaG;
    const T = this.tile;
    const ty = (v: number) => v * T * this.squash;
    const W = ARENA.width * T;
    const H = ty(ARENA.height);

    g.clear();
    g.rect(0, 0, W, H).fill(GRASS);

    for (let cy = 0; cy < ARENA.height / 2; cy++) {
      for (let cx = 0; cx < ARENA.width / 2; cx++) {
        if ((cx + cy) % 2 === 0) continue;
        g.rect(cx * 2 * T, ty(cy * 2), 2 * T, ty(2)).fill(GRASS_ALT);
      }
    }

    const laneW = 2.6 * T;
    const lx = ARENA.bridgeLeftX * T - laneW / 2;
    const rx = ARENA.bridgeRightX * T - laneW / 2;
    const spanW = (ARENA.bridgeRightX - ARENA.bridgeLeftX) * T + laneW;
    g.rect(lx - 2, ty(3), laneW + 4, ty(26)).fill(PATH_EDGE);
    g.rect(rx - 2, ty(3), laneW + 4, ty(26)).fill(PATH_EDGE);
    g.rect(lx - 2, ty(3), spanW + 4, ty(2.2)).fill(PATH_EDGE);
    g.rect(lx - 2, ty(26.8), spanW + 4, ty(2.2)).fill(PATH_EDGE);
    g.rect(lx, ty(3.1), laneW, ty(25.8)).fill(PATH);
    g.rect(rx, ty(3.1), laneW, ty(25.8)).fill(PATH);
    g.rect(lx, ty(3.1), spanW, ty(2)).fill(PATH);
    g.rect(lx, ty(26.9), spanW, ty(2)).fill(PATH);

    g.rect(0, ty(ARENA.riverTop), W, ty(ARENA.riverBottom - ARENA.riverTop)).fill(RIVER);
    g.rect(0, ty(ARENA.riverTop), W, ty(0.22)).fill(0x5ec2e8);
    g.rect(0, ty(ARENA.riverBottom - 0.22), W, ty(0.22)).fill(0x2477a3);
    for (let i = 0; i < 7; i++) {
      const wx = (i * 2.7 + 0.6) * T;
      g.ellipse(wx, ty(ARENA.riverTop + 0.45), T * 0.5, ty(0.1)).fill({
        color: 0xffffff,
        alpha: 0.22,
      });
    }

    for (const bx of [ARENA.bridgeLeftX, ARENA.bridgeRightX]) {
      const bw = ARENA.bridgeHalfWidth * 2 * T;
      const x0 = bx * T - bw / 2;
      g.roundRect(x0, ty(ARENA.riverTop - 0.35), bw, ty(1.9), 4).fill(BRIDGE);
      for (let i = 0; i < 5; i++) {
        g.rect(x0, ty(ARENA.riverTop - 0.2 + i * 0.34), bw, ty(0.1)).fill(0x8a5f3d);
      }
      g.rect(x0, ty(ARENA.riverTop - 0.35), bw, ty(0.12)).fill(0xc0906a);
    }

    g.rect(0, 0, W, H).stroke({ width: 3, color: 0x3f5a1f, alignment: 1 });
  }

  private drawZone(world: World) {
    const g = this.zoneG;
    g.clear();
    if (this.zoneMode === 'none') return;
    const T = this.tile;
    const ty = (v: number) => v * T * this.squash;
    const W = ARENA.width * T;

    // spells can be thrown anywhere
    if (this.zoneMode === 'all') {
      g.rect(0, 0, W, ty(ARENA.height)).fill({ color: 0xffd98a, alpha: 0.12 });
      return;
    }

    const top = ARENA.riverBottom + 0.3;
    g.rect(0, ty(top), W, ty(ARENA.height - top)).fill({ color: 0xffffff, alpha: 0.19 });

    for (const side of ['left', 'right'] as const) {
      const stillUp = world.entities.some(
        (e) => e.kind === 'tower' && e.team === 1 && e.side === side && e.hp > 0,
      );
      if (stillUp) continue;
      const x0 = side === 'left' ? 0 : W / 2;
      g.rect(x0, ty(3.5), W / 2, ty(top - 3.5)).fill({ color: 0xffffff, alpha: 0.19 });
    }
    g.rect(0, ty(top), W, 2).fill({ color: 0xffffff, alpha: 0.45 });
  }

  private drawDeployPreview() {
    const g = this.previewG;
    g.clear();
    if (!this.deployPreview) return;

    const { x, y, range, color } = this.deployPreview;
    const [sx, sy] = this.toScreen(x, y);
    const rx = range * this.tile;
    const ry = range * this.tile * this.squash;

    g.ellipse(sx, sy, rx, ry).fill({ color, alpha: 0.07 });
    g.ellipse(sx, sy, rx, ry).stroke({ width: 2.5, color, alpha: 0.55 });
    g.ellipse(sx, sy, rx * 0.985, ry * 0.985).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
  }

  // ------------------------------------------------------------------ views

  private buildView(view: EntityView, e: Entity, world: World) {
    const T = this.tile;
    view.body.clear();
    view.shadow.clear();

    if (e.kind === 'tower') {
      drawTower(view.body, e.towerKind!, e.team, T, this.squash, e.hp <= 0);
      const metrics = towerMetrics(e.towerKind!, T, this.squash);
      const barW = metrics.w;
      view.hpBg.clear();
      view.hpFg.clear();
      if (e.hp > 0) {
        const bh = Math.max(7, T * 0.34);
        // never let the bar float off the top of the board
        const baseScreenY = e.y * T * this.squash;
        const by = Math.max(metrics.topY - bh - T * 0.12, 2 - baseScreenY);
        view.hpBg.roundRect(-barW / 2, by, barW, bh, 3).fill(0x241c14);
        view.hpBg.roundRect(-barW / 2, by, barW, bh, 3).stroke({ width: 1.5, color: 0x0f0b07 });
        view.hpFgGeom = { x: -barW / 2 + 1.5, y: by + 1.5, w: barW - 3, h: bh - 3 };
        if (!view.hpText) {
          view.hpText = new Text({
            text: '',
            style: { ...HP_FONT, fontSize: Math.max(10, T * 0.52) },
          });
          view.hpText.anchor.set(0.5);
          view.root.addChild(view.hpText);
        }
        view.hpText.style.fontSize = Math.max(10, T * 0.52);
        view.hpText.position.set(0, by + bh / 2);
        view.hpText.visible = true;
      } else if (view.hpText) {
        view.hpText.visible = false;
      }
    } else {
      const card = world.b.cards[e.cardId];
      const h = card.visual.scale * T;
      view.shadow
        .ellipse(0, 0, e.radius * T * 1.05, e.radius * T * 0.52)
        .fill({ color: 0x000000, alpha: 0.28 });
      view.shadow
        .ellipse(0, 0, e.radius * T * 1.15, e.radius * T * 0.6)
        .stroke({ width: 2, color: TEAM_COLOR[e.team], alpha: 0.85 });
      drawUnit(view.body, card.visual.shape, h, card.visual.body, card.visual.accent, e.team);
      view.lastHidden = e.cardId === 'tesla' && !!e.hidden;
      if (e.cardId === 'tesla') {
        this.syncTeslaTrapdoor(view, e, world, h);
      }
      // flyers and the Witch hover above their shadow
      view.flyLift = e.flying || card.visual.shape === 'witch' ? h * 0.55 : 0;

      const barW = Math.max(14, e.radius * T * 2.1);
      const bh = Math.max(4, T * 0.2);
      const by =
        e.cardId === 'tesla' && e.hidden
          ? -bh - T * 0.22
          : -h - bh - T * 0.18 - view.flyLift;
      view.hpBg.clear();
      view.hpFg.clear();
      view.hpBg.roundRect(-barW / 2, by, barW, bh, 2).fill(0x241c14);
      view.hpFgGeom = { x: -barW / 2 + 1, y: by + 1, w: barW - 2, h: bh - 2 };
    }
    view.built = true;
    view.lastHpRatio = -1;
    view.lastHpValue = -1;
  }

  private syncTeslaTrapdoor(view: EntityView, e: Entity, world: World, h: number) {
    const card = world.b.cards.tesla;
    view.trapdoor.clear();
    if (e.hidden) {
      drawTeslaTrapdoor(view.trapdoor, h, card.visual.accent, e.team);
      view.trapdoor.visible = true;
      view.bob.visible = false;
      view.shadow.visible = false;
    } else {
      view.trapdoor.visible = false;
      view.bob.visible = true;
      view.shadow.visible = true;
    }
  }

  private syncViews(world: World) {
    const seen = new Set<number>();
    for (const e of world.entities) {
      seen.add(e.id);
      let view = this.views.get(e.id);
      if (!view) {
        view = new EntityView();
        this.views.set(e.id, view);
        this.entityLayer.addChild(view.root);
      }
      if (!view.built) this.buildView(view, e, world);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      if (view.dying === 0) view.dying = 0.001;
    }
  }

  // ------------------------------------------------------------------- draw

  draw(world: World, alpha: number, dt: number) {
    this.syncViews(world);
    this.drawZone(world);
    this.drawDeployPreview();

    const T = this.tile;
    const byId = new Map(world.entities.map((e) => [e.id, e]));

    for (const [id, view] of this.views) {
      const e = byId.get(id);
      if (!e) {
        view.dying += dt;
        const k = Math.min(1, view.dying / 0.3);
        view.root.alpha = 1 - k;
        view.root.scale.set(1 - k * 0.35);
        if (k >= 1) {
          view.root.destroy({ children: true });
          this.views.delete(id);
        }
        continue;
      }

      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const [sx, sy] = this.toScreen(x, y);
      view.root.position.set(sx, sy);
      view.root.zIndex = sy;

      if (e.kind === 'tower' && e.hp <= 0 && view.built) {
        // swap to the rubble sprite once, and drop any hit-flash tint it died with
        if (view.lastHpValue !== 0) {
          this.buildView(view, e, world);
          view.lastHpValue = 0;
          view.body.tint = 0xffffff;
          view.hpFg.clear();
        }
        continue;
      }

      const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
      if (Math.abs(ratio - view.lastHpRatio) > 0.002 && view.hpFgGeom) {
        view.lastHpRatio = ratio;
        const geo = view.hpFgGeom;
        view.hpFg.clear();
        if (ratio > 0) {
          const color = e.team === 0 ? 0x4a90ea : 0xe05555;
          view.hpFg.roundRect(geo.x, geo.y, geo.w * ratio, geo.h, 2).fill(color);
        }
      }
      if (view.hpText) {
        const shown = Math.max(0, Math.ceil(e.hp));
        if (shown !== view.lastHpValue) {
          view.lastHpValue = shown;
          view.hpText.text = String(shown);
        }
      }

      // animation
      const bob = view.bob;
      const card = world.b.cards[e.cardId];
      if (e.cardId === 'tesla' && !!e.hidden !== view.lastHidden) {
        const th = card.visual.scale * T;
        if (!e.hidden) {
          view.body.clear();
          drawUnit(view.body, 'tesla', th, card.visual.body, card.visual.accent, e.team);
        }
        this.syncTeslaTrapdoor(view, e, world, th);
        view.lastHidden = !!e.hidden;
        // reposition HP bar above trapdoor or tower
        if (view.hpFgGeom) {
          const bh = Math.max(4, T * 0.2);
          const barW = Math.max(14, e.radius * T * 2.1);
          const by = e.hidden ? -bh - T * 0.22 : -th - bh - T * 0.18;
          view.hpBg.clear();
          view.hpFg.clear();
          view.hpBg.roundRect(-barW / 2, by, barW, bh, 2).fill(0x241c14);
          view.hpFgGeom = { x: -barW / 2 + 1, y: by + 1, w: barW - 2, h: bh - 2 };
          view.lastHpRatio = -1;
        }
      }
      if (e.cardId === 'tesla') {
        view.zapLine.clear();
        if (!e.hidden && e.state === 'attacking' && e.targetId) {
          const target = byId.get(e.targetId);
          if (target) {
            const tx = target.px + (target.x - target.px) * alpha;
            const ty = target.py + (target.y - target.py) * alpha;
            const [tsx, tsy] = this.toScreen(tx, ty - 0.3);
            const th = card.visual.scale * T;
            const coilY = bob.position.y - th * 0.88;
            drawLightningBolt(view.zapLine, 0, coilY, tsx - sx, tsy - sy, T, e.animT * 7 + e.swing * 3);
          }
        }
      }
      if (e.kind === 'tower') {
        bob.position.y = Math.max(0, e.swing) ** 2 * T * 0.1;
      } else {
        let bobY = -view.flyLift;
        bob.scale.x = e.facing >= 0 ? 1 : -1;
        if (e.deployLeft > 0) {
          const k = 1 - e.deployLeft / Math.max(0.01, world.b.cards[e.cardId].deployTime);
          view.root.alpha = 0.35 + k * 0.65;
          bobY -= (1 - k) * T * 0.5;
          view.spawnRing.clear();
          view.spawnRing
            .ellipse(0, 0, e.radius * T * (1.2 + (1 - k) * 0.9), e.radius * T * (0.6 + (1 - k) * 0.45))
            .stroke({ width: 2.5, color: 0xffffff, alpha: 0.25 + k * 0.45 });
        } else {
          view.root.alpha = 1;
          view.spawnRing.clear();
          if (e.flying || card?.visual.shape === 'witch') {
            bobY -= Math.sin(e.animT * 3.4) * T * 0.09;
            bob.rotation = Math.sin(e.animT * 3.4) * 0.04;
          } else if (e.state === 'moving' && e.speed > 0) {
            const t = e.animT * (4 + e.speed * 2.2);
            bobY -= Math.abs(Math.sin(t)) * T * 0.1;
            bob.rotation = Math.sin(t) * 0.05;
          } else {
            bob.rotation = 0;
          }
          if (e.state === 'attacking') {
            const lunge = Math.max(0, e.swing) ** 2;
            bobY -= lunge * T * 0.14;
            bob.rotation += lunge * 0.3 * (bob.scale.x >= 0 ? 1 : -1);
          }
        }
        bob.position.y = bobY;
      }

      view.body.tint =
        e.hitFlash > 0
          ? 0xff9c9c
          : e.stunLeft > 0
            ? 0x9fd8ff
            : e.cardId === 'tesla' && e.state === 'attacking' && e.swing > 0.1
              ? 0xc8f8ff
              : 0xffffff;
    }

    this.drawPendingSpells(world, alpha);
    this.drawProjectiles(world, alpha);
    this.drainEffects(world);
    this.stepParticles(dt);

    if (this.shake > 0) {
      this.shake -= dt;
      const s = Math.max(0, this.shake) * 26;
      this.root.position.x = (Math.random() - 0.5) * s;
    } else {
      this.root.position.x = 0;
    }
  }

  /**
   * A spell mid-flight: a shadow grows at the landing spot while the icon
   * arcs in from the caster's edge, shrinking into the shadow as it nears
   * impact. Damage isn't applied until the world marks it as landed.
   */
  private drawPendingSpells(world: World, alpha: number) {
    const alive = new Set<number>();
    for (const s of world.pendingSpells) {
      alive.add(s.id);
      let entry = this.spellViews.get(s.id);
      if (!entry) {
        const holder = new Container();
        const shadow = new Graphics();
        const icon = new Graphics();
        holder.addChild(shadow, icon);
        this.spellLayer.addChild(holder);
        entry = { holder, shadow, icon, drawn: false };
        this.spellViews.set(s.id, entry);
      }

      const x = s.px + (s.x - s.px) * alpha;
      const y = s.py + (s.y - s.py) * alpha;
      const k = Math.min(1, s.t / s.duration);
      const [tx, ty] = this.toScreen(s.tx, s.ty);
      const [sx, sy] = this.toScreen(x, y);

      entry.shadow.clear();
      entry.shadow
        .ellipse(0, 0, this.tile * 0.55 * k, this.tile * this.squash * 0.4 * k)
        .fill({ color: 0x000000, alpha: 0.3 * k });
      entry.shadow.position.set(tx, ty);

      if (!entry.drawn) {
        drawUnit(entry.icon, s.shape, this.tile * 0.85, s.body, s.accent);
        entry.icon.pivot.set(0, -this.tile * 0.42);
        entry.drawn = true;
      }
      const arcLift = Math.sin(k * Math.PI) * this.tile * 1.4;
      entry.icon.position.set(sx, sy - arcLift);
      const scale = 0.55 + k * 0.55;
      entry.icon.scale.set(scale);
    }
    for (const [id, entry] of this.spellViews) {
      if (alive.has(id)) continue;
      entry.holder.destroy({ children: true });
      this.spellViews.delete(id);
    }
  }

  private drawProjectiles(world: World, alpha: number) {
    const alive = new Set<number>();
    for (const p of world.projectiles) {
      alive.add(p.id);
      let g = this.projViews.get(p.id);
      if (!g) {
        g = new Graphics();
        const c = hexToNum(p.color);
        g.circle(0, 0, p.size * this.tile * 1.9).fill({ color: c, alpha: 0.28 });
        g.circle(0, 0, p.size * this.tile).fill(c);
        g.circle(0, 0, p.size * this.tile * 0.45).fill(shade(c, 0.55));
        this.projViews.set(p.id, g);
        this.projLayer.addChild(g);
      }
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      const [sx, sy] = this.toScreen(x, y);
      g.position.set(sx, sy);
    }
    for (const [id, g] of this.projViews) {
      if (alive.has(id)) continue;
      g.destroy();
      this.projViews.delete(id);
    }
  }

  private drainEffects(world: World) {
    for (const fx of world.effects) {
      const [sx, sy] = this.toScreen(fx.x, fx.y);
      switch (fx.type) {
        case 'hit':
          if (fx.color === '#8ff0ff') {
            this.burst(sx, sy, 0x8ff0ff, 8, this.tile * 0.1, 0.32);
            const zap = new Graphics();
            zap.poly([0, -this.tile * 0.35, this.tile * 0.12, -this.tile * 0.12, this.tile * 0.04, -this.tile * 0.12, this.tile * 0.16, this.tile * 0.22, -this.tile * 0.04, this.tile * 0.04, -this.tile * 0.12, 0, -this.tile * 0.12]).fill(0xfffbe0);
            zap.position.set(sx, sy);
            this.fxLayer.addChild(zap);
            this.particles.push({ g: zap, vx: 0, vy: 0, life: 0.18, max: 0.18, grow: 0, spin: 0 });
          } else {
            this.burst(sx, sy, hexToNum(fx.color), 5, this.tile * 0.11, 0.28);
          }
          break;
        case 'splash': {
          const ring = new Graphics();
          ring
            .ellipse(0, 0, fx.radius * this.tile * 0.6, fx.radius * this.tile * this.squash * 0.6)
            .stroke({ width: 2.5, color: 0xffd98a, alpha: 0.75 });
          ring.position.set(sx, sy);
          this.fxLayer.addChild(ring);
          this.particles.push({ g: ring, vx: 0, vy: 0, life: 0.26, max: 0.26, grow: 0.9, spin: 0 });
          break;
        }
        case 'death':
          this.burst(sx, sy - fx.scale * this.tile * 0.4, hexToNum(fx.color), 8, this.tile * 0.14, 0.45);
          break;
        case 'deploy': {
          const ring = new Graphics();
          ring
            .ellipse(0, 0, this.tile * 0.8, this.tile * 0.8 * this.squash)
            .stroke({ width: 2.5, color: 0xffffff, alpha: 0.7 });
          ring.position.set(sx, sy);
          this.fxLayer.addChild(ring);
          this.particles.push({ g: ring, vx: 0, vy: 0, life: 0.35, max: 0.35, grow: 1.2, spin: 0 });
          break;
        }
        case 'towerDown':
          this.burst(sx, sy - this.tile, 0xb0a696, 18, this.tile * 0.22, 0.8);
          this.shake = 0.4;
          break;
        case 'spell':
          this.spellBlast(sx, sy, fx.radius, fx.shape);
          break;
        case 'teslaZap': {
          const [sx0, sy0] = this.toScreen(fx.x0, fx.y0);
          const [sx1, sy1] = this.toScreen(fx.x1, fx.y1);
          const bolt = new Graphics();
          drawLightningBolt(bolt, sx0, sy0, sx1, sy1, this.tile, Math.random() * 10);
          this.fxLayer.addChild(bolt);
          this.particles.push({ g: bolt, vx: 0, vy: 0, life: 0.12, max: 0.12, grow: 0, spin: 0 });
          this.burst(sx1, sy1, 0x8ff0ff, 6, this.tile * 0.09, 0.22);
          break;
        }
      }
    }
    world.effects.length = 0;
  }

  /** The impact of a spell: a coloured shockwave plus debris in its own palette. */
  private spellBlast(x: number, y: number, radius: number, shape: UnitShape) {
    const looks: Record<string, { ring: number; bits: number; count: number; shake: number }> = {
      fireball: { ring: 0xffa63d, bits: 0xe2622a, count: 22, shake: 0.28 },
      arrows: { ring: 0xe8e2d0, bits: 0x9a7448, count: 18, shake: 0.1 },
      zap: { ring: 0x8ff0ff, bits: 0x7b4fd6, count: 14, shake: 0.15 },
    };
    const look = looks[shape] ?? looks.fireball;

    const ring = new Graphics();
    ring
      .ellipse(0, 0, radius * this.tile * 0.45, radius * this.tile * this.squash * 0.45)
      .stroke({ width: 4, color: look.ring });
    ring.position.set(x, y);
    this.fxLayer.addChild(ring);
    this.particles.push({ g: ring, vx: 0, vy: 0, life: 0.42, max: 0.42, grow: 1.35, spin: 0 });

    const flash = new Graphics();
    flash
      .ellipse(0, 0, radius * this.tile * 0.6, radius * this.tile * this.squash * 0.6)
      .fill({ color: look.ring, alpha: 0.4 });
    flash.position.set(x, y);
    this.fxLayer.addChild(flash);
    this.particles.push({ g: flash, vx: 0, vy: 0, life: 0.22, max: 0.22, grow: 0.5, spin: 0 });

    this.burst(x, y, look.bits, look.count, this.tile * 0.2, 0.55);
    this.shake = Math.max(this.shake, look.shake);
  }

  private burst(x: number, y: number, color: number, count: number, size: number, life: number) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      g.rect(-size / 2, -size / 2, size, size).fill(color);
      g.position.set(x, y);
      this.fxLayer.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random()) * this.tile * 3;
      this.particles.push({
        g,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6 - this.tile * 1.5,
        life,
        max: life,
        grow: 0,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  private stepParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.g.alpha = k;
      if (p.grow > 0) {
        p.g.scale.set(1 + (1 - k) * p.grow);
      } else {
        p.vy += this.tile * 10 * dt;
        p.g.position.x += p.vx * dt;
        p.g.position.y += p.vy * dt;
        p.g.rotation += p.spin * dt;
      }
    }
    this.particles = this.particles.filter((p) => {
      if (p.life > 0) return true;
      p.g.destroy();
      return false;
    });
  }

  /** Wipe every entity view — used when restarting a match. */
  clear() {
    for (const view of this.views.values()) view.root.destroy({ children: true });
    this.views.clear();
    for (const g of this.projViews.values()) g.destroy();
    this.projViews.clear();
    for (const entry of this.spellViews.values()) entry.holder.destroy({ children: true });
    this.spellViews.clear();
    for (const p of this.particles) p.g.destroy();
    this.particles = [];
    this.shake = 0;
    this.deployPreview = null;
    this.previewG.clear();
  }

  teamColor(team: Team): number {
    return TEAM_COLOR[team];
  }
}
