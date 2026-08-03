import { Application, Container, Graphics, Text } from 'pixi.js';
import { ARENA } from '../sim/arena';
import type { Entity, Team, UnitShape } from '../sim/types';
import type { World } from '../sim/world';
import { getCharacterSpriteSet } from './sprites/character-loader';
import { resolveAnimState } from './sprites/resolve-anim-state';
import { SpriteActor } from './sprites/sprite-actor';
import { TEAM_COLOR, drawBalloonBombDrop, drawInfernoBeam, drawLightningBolt, drawRagePuddle, drawTeslaTrapdoor, drawTower, drawUnit, hexToNum, shade, towerMetrics } from './shapes';
import { drawDeployZone, drawTerrain, drawVignette, drawWaterFx } from './arena-art';
import { Crowd, STANDS } from './crowd';

/**
 * Gameplay draw scale — card art keeps balance `visual.scale`; troops can read
 * larger in the arena. At 18 tiles across on a phone a tile is only ~24 px, so
 * everything gets a flat bump on top of its per-card tuning.
 */
const TROOP_READABILITY_BOOST = 1.2;

function gameplayDrawScale(_cardId: string, scale: number): number {
  return scale * TROOP_READABILITY_BOOST;
}

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
  /** debris cools toward this colour as it dies, instead of just fading out */
  fadeTo?: number;
  /** drag applied to debris velocity, so sparks slow down instead of flying flat */
  drag?: number;
  /** pinned in place — used by projectile trail dots, which only shrink */
  still?: boolean;
}

/** Scorch marks left on the ground; they outlive the blast that made them. */
interface Decal {
  g: Graphics;
  life: number;
  max: number;
}

type BurstShape = 'chip' | 'spark' | 'puff';

/** Straight RGB blend — good enough for debris cooling from ember to ash. */
function lerpColor(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = ((from >> 16) & 255) + (((to >> 16) & 255) - ((from >> 16) & 255)) * k;
  const g = ((from >> 8) & 255) + (((to >> 8) & 255) - ((from >> 8) & 255)) * k;
  const b = (from & 255) + ((to & 255) - (from & 255)) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
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
  /**
   * Dark copy of `body`, drawn a touch larger behind it so troops keep a rim
   * against the grass. It shares `body`'s GraphicsContext, so it costs a draw
   * call but never rebuilds geometry — which matters, since several cards
   * redraw their body every frame.
   */
  outline = new Graphics();
  body = new Graphics();
  zapLine = new Graphics();
  infernoLine = new Graphics();
  bombFx = new Graphics();
  spinFx = new Graphics();
  /**
   * Weapon FX that live inside `bob` (so they follow the facing flip and the
   * recoil tilt) but must stay out of `body` — anything drawn there also gets
   * a dark, 6%-offset copy from `outline`, which turns sparks into mud specks.
   */
  muzzleFx = new Graphics();
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
  lastTowerActive = false;
  /** 0..1 fade for troop HP bars — they only appear once the unit is hurt. */
  hpReveal = 0;
  dying = 0;
  /** SpriteCook animated sprite (troops with visual.spriteCharacter) */
  spriteActor: SpriteActor | null = null;

  constructor() {
    this.root.addChild(this.shadow, this.trapdoor, this.spawnRing, this.spinFx, this.bob, this.zapLine, this.infernoLine, this.bombFx, this.hpBg, this.hpFg);
    this.bob.addChild(this.outline, this.body, this.muzzleFx);
    this.outline.tint = 0x1b1208;
    this.outline.alpha = 0.55;
    this.outline.visible = false;
  }

  /** Links the outline to the body's geometry and centres the 6% expansion. */
  syncOutline(bodyHeight: number) {
    if (this.outline.context !== this.body.context) {
      this.outline.context = this.body.context;
    }
    const grow = 1.06;
    this.outline.scale.set(grow);
    // without this the extra height would all pile onto the head
    this.outline.position.y = bodyHeight * (grow - 1) * 0.5;
    this.outline.visible = this.body.visible;
  }
}

export class Renderer {
  app = new Application();
  tile = 20;
  squash = 0.72;

  /**
   * Faixa de arquibancada em cada lateral / topo e base, em px. Zero quando a
   * plateia está desligada — e aí o tabuleiro volta a ocupar a tela inteira.
   */
  private marginX = 0;
  private marginY = 0;
  /** Vão real (px) sobrando acima e abaixo do tabuleiro dentro do palco. */
  private bandY = 0;

  private crowd = new Crowd();
  private crowdEnabled = true;

  private root = new Container();
  private arenaG = new Graphics();
  private waterFxG = new Graphics();
  private groundFxLayer = new Container();
  private ragePuddleViews = new Map<number, Graphics>();
  private zoneG = new Graphics();
  private previewG = new Graphics();
  private entityLayer = new Container();
  private spellLayer = new Container();
  private projLayer = new Container();
  private fxLayer = new Container();
  private vignetteG = new Graphics();
  private tensionG = new Graphics();

  /** 0 = normal, 1 = elixir 2x, 2 = elixir 3x — warms the arena rim. */
  tension: 0 | 1 | 2 = 0;

  private views = new Map<number, EntityView>();
  private projViews = new Map<number, Graphics>();
  private spellViews = new Map<
    number,
    { holder: Container; shadow: Graphics; icon: Graphics; drawn: boolean }
  >();
  private particles: Particle[] = [];
  private decals: Decal[] = [];
  private flashG = new Graphics();
  private flash = 0;
  /** seconds of trail left to emit per projectile, keyed by projectile id */
  private trailClock = new Map<number, number>();

  private shake = 0;
  /**
   * Frames the game should freeze for after a heavy impact. `Game` reads and
   * clears this — the pause has to happen in the simulation, not the draw.
   */
  hitStop = 0;
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
      // a plateia vive fora do tabuleiro, atrás de tudo, e acompanha o shake
      this.crowd.view,
      this.arenaG,
      this.waterFxG,
      this.groundFxLayer,
      this.zoneG,
      this.previewG,
      this.entityLayer,
      this.spellLayer,
      this.projLayer,
      this.fxLayer,
      this.vignetteG,
      this.tensionG,
      this.flashG,
    );
    this.app.stage.addChild(this.root);
    this.layout();
  }

  /**
   * Liga/desliga a arquibancada. Desligada, a margem some e o tabuleiro volta
   * a ocupar 100% da largura — exatamente o layout anterior à plateia.
   */
  setCrowdEnabled(on: boolean) {
    if (this.crowdEnabled === on) return;
    this.crowdEnabled = on;
    if (!on) this.crowd.clear();
    this.crowd.view.visible = on;
    if (this.host) this.layout();
  }

  /** Ola + confete da plateia a partir de um ponto do tabuleiro (tiles). */
  celebrateCrowd(
    tileX = ARENA.width / 2,
    tileY = ARENA.height / 2,
    confettiColor = 0xe8c45a,
  ) {
    if (!this.crowdEnabled) return;
    const [sx, sy] = this.toScreen(tileX, tileY);
    this.crowd.cheer(sx, sy);
    for (const p of this.crowd.confettiPoints(7)) {
      this.burst(p.x, p.y, confettiColor, 8, this.tile * 0.12, 1.5, { lift: 2.6, spread: 0.7 });
    }
  }

  /** Fit the 18x32 board into the available box, squashing vertically for a 2.5D feel. */
  layout() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w <= 0 || h <= 0) return;

    // A arquibancada rouba largura do tabuleiro; sem ela os dois fatores são
    // zero e o cálculo é idêntico ao original (`tile = w / ARENA.width`).
    const mxTiles = this.crowdEnabled ? STANDS.marginXTiles : 0;
    const myTiles = this.crowdEnabled ? STANDS.marginYTiles : 0;
    this.tile = w / (ARENA.width + 2 * mxTiles);
    this.marginX = mxTiles * this.tile;
    this.marginY = myTiles * this.tile;

    const availH = Math.max(1, h - 2 * this.marginY);
    this.squash = Math.min(1, Math.max(0.5, availH / (ARENA.height * this.tile)));

    const boardW = ARENA.width * this.tile;
    const boardH = ARENA.height * this.tile * this.squash;
    // o tabuleiro continua centrado; a sobra vertical vira faixa de plateia
    this.bandY = Math.max(0, (h - boardH) / 2);

    // Pivot at the board centre so the shake can roll the camera without the
    // whole arena swinging off a corner.
    this.root.pivot.set(boardW / 2, boardH / 2);
    this.applyCamera(0, 0, 0);
    drawTerrain(this.arenaG, this.tile, this.squash);
    drawVignette(this.vignetteG, boardW, boardH, this.tile);

    if (this.crowdEnabled) {
      this.crowd.build(this.app.renderer, {
        tile: this.tile,
        squash: this.squash,
        boardW,
        boardH,
        marginX: this.marginX,
        bandTop: this.bandY,
        bandBottom: this.bandY,
      });
    }

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

  /**
   * Convert a pointer position (relative to the canvas) into tile coordinates.
   * Deliberately ignores the shake offset — input must not wobble with the
   * camera.
   */
  fromScreen(px: number, py: number): [number, number] {
    const boardH = ARENA.height * this.tile * this.squash;
    const topY = (this.host.clientHeight - boardH) / 2;
    return [(px - this.marginX) / this.tile, (py - topY) / (this.tile * this.squash)];
  }

  private drawZone(world: World) {
    const g = this.zoneG;
    if (this.zoneMode === 'none') {
      g.clear();
      return;
    }

    // spells can be thrown anywhere
    if (this.zoneMode === 'all') {
      drawDeployZone(
        g,
        this.tile,
        this.squash,
        [{ x0: 0, x1: ARENA.width, y0: 0, y1: ARENA.height }],
        world.time,
        0xffd98a,
      );
      return;
    }

    const top = ARENA.riverBottom + 0.3;
    const bands: { x0: number; x1: number; y0: number; y1: number }[] = [
      { x0: 0, x1: ARENA.width, y0: top, y1: ARENA.height },
    ];
    let anyUnlocked = false;
    for (const side of ['left', 'right'] as const) {
      const stillUp = world.entities.some(
        (e) => e.kind === 'tower' && e.team === 1 && e.side === side && e.hp > 0,
      );
      if (stillUp) continue;
      anyUnlocked = true;
      bands.push({
        x0: side === 'left' ? 0 : ARENA.width / 2,
        x1: side === 'left' ? ARENA.width / 2 : ARENA.width,
        y0: 3.5,
        y1: top,
      });
    }
    // only worth showing once a lane is actually open into the enemy half
    const king = anyUnlocked ? world.enemyKingGuard(0) : undefined;
    const blocked = king
      ? [
          {
            x0: king.x - ARENA.kingDeployBlockHalfW,
            x1: king.x + ARENA.kingDeployBlockHalfW,
            y0: king.y - ARENA.kingDeployBlockHalfH,
            y1: king.y + ARENA.kingDeployBlockHalfH,
          },
        ]
      : undefined;
    drawDeployZone(g, this.tile, this.squash, bands, world.time, 0xffffff, blocked);
  }

  /** Persistent Rage liquid stains on the arena floor. */
  private drawRageGround(world: World) {
    const alive = new Set<number>();
    for (const z of world.rageZones) {
      alive.add(z.id);
      let g = this.ragePuddleViews.get(z.id);
      if (!g) {
        g = new Graphics();
        this.groundFxLayer.addChild(g);
        this.ragePuddleViews.set(z.id, g);
      }
      const [sx, sy] = this.toScreen(z.x, z.y);
      g.position.set(sx, sy);
      const fade = z.timeLeft < 0.85 ? z.timeLeft / 0.85 : 1;
      drawRagePuddle(
        g,
        z.radius,
        this.tile,
        this.squash,
        z.body,
        z.accent,
        z.id,
        world.time,
        fade,
      );
    }
    for (const [id, g] of this.ragePuddleViews) {
      if (alive.has(id)) continue;
      g.destroy();
      this.ragePuddleViews.delete(id);
    }
  }

  /**
   * Warm rim that breathes once the elixir doubles — the visual half of the
   * music's intensity change, so both land at the same moment.
   */
  private drawTension(time: number) {
    const g = this.tensionG;
    g.clear();
    if (this.tension === 0) return;

    const w = ARENA.width * this.tile;
    const h = ARENA.height * this.tile * this.squash;
    const color = this.tension >= 2 ? 0xff6a3d : 0xe04bb0;
    const beats = this.tension >= 2 ? 3.4 : 2.4;
    const pulse = 0.5 + 0.5 * Math.sin(time * beats);
    const rings = 10;
    const depth = this.tile * 2.2;
    for (let i = 0; i < rings; i++) {
      const t = i / rings;
      const inset = (depth * i) / rings;
      g.roundRect(inset, inset, w - inset * 2, h - inset * 2, this.tile * 0.4).stroke({
        width: depth / rings + 1.2,
        color,
        alpha: (0.08 + pulse * 0.07) * (1 - t) ** 1.4 * (this.tension >= 2 ? 1.5 : 1),
        alignment: 0,
      });
    }
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

  private towerBowFlip(e: Entity): number {
    return e.side === 'right' ? -1 : 1;
  }

  private towerAimRad(e: Entity, world: World): number {
    if (e.targetId == null) return e.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    const target = world.entities.find((o) => o.id === e.targetId);
    if (!target) return e.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    return Math.atan2(target.y - e.y, target.x - e.x);
  }

  private buildView(view: EntityView, e: Entity, world: World) {
    const T = this.tile;
    view.body.clear();
    view.shadow.clear();

    if (e.kind === 'tower') {
      const bowFlip = this.towerBowFlip(e);
      const aimRad = this.towerAimRad(e, world);
      drawTower(
        view.body,
        e.towerKind!,
        e.team,
        T,
        this.squash,
        e.hp <= 0,
        e.active,
        aimRad,
        bowFlip,
      );
      if (e.towerKind === 'king') view.lastTowerActive = e.active;
      const metrics = towerMetrics(e.towerKind!, T, this.squash);
      // slimmed down: the old bar was the loudest thing on the board
      const barW = metrics.w * 0.78;
      view.hpBg.clear();
      view.hpFg.clear();
      if (e.hp > 0) {
        const bh = Math.max(5, T * 0.24);
        // never let the bar float off the top of the board
        const baseScreenY = e.y * T * this.squash;
        const by = Math.max(metrics.topY - bh - T * 0.12, 2 - baseScreenY);
        view.hpBg.roundRect(-barW / 2, by, barW, bh, 3).fill(0x241c14);
        view.hpBg.roundRect(-barW / 2, by, barW, bh, 3).stroke({ width: 1.2, color: 0x0f0b07 });
        view.hpFgGeom = { x: -barW / 2 + 1.2, y: by + 1.2, w: barW - 2.4, h: bh - 2.4 };
        const fontSize = Math.max(8, T * 0.33);
        if (!view.hpText) {
          view.hpText = new Text({ text: '', style: { ...HP_FONT, fontSize } });
          view.hpText.anchor.set(0.5);
          view.root.addChild(view.hpText);
        }
        view.hpText.style.fontSize = fontSize;
        view.hpText.position.set(0, by + bh / 2);
        view.hpText.visible = true;
      } else if (view.hpText) {
        view.hpText.visible = false;
      }
    } else {
      const card = world.b.cards[e.cardId];
      const h = gameplayDrawScale(e.cardId, card.visual.scale) * T;
      // flyers sit above their shadow, so it reads smaller and softer
      const airborne = e.flying || card.visual.shape === 'witch';
      const shSize = airborne ? 0.78 : 1;
      const shAlpha = airborne ? 0.16 : 0.28;
      view.shadow
        .ellipse(0, 0, e.radius * T * 1.05 * shSize, e.radius * T * 0.52 * shSize)
        .fill({ color: 0x000000, alpha: shAlpha });
      view.shadow
        .ellipse(0, 0, e.radius * T * 1.15 * shSize, e.radius * T * 0.6 * shSize)
        .stroke({ width: 2, color: TEAM_COLOR[e.team], alpha: airborne ? 0.6 : 0.85 });

      const spriteCharId = card.visual.spriteCharacter;
      const spriteSet = spriteCharId ? getCharacterSpriteSet(spriteCharId) : undefined;
      if (spriteSet) {
        if (!view.spriteActor) {
          view.spriteActor = new SpriteActor(spriteSet);
          view.bob.addChild(view.spriteActor.sprite);
        }
        view.body.clear();
        view.body.visible = false;
        view.spriteActor.sprite.visible = true;
        view.spriteActor.setPixelHeight(h);
      } else {
        if (view.spriteActor) {
          view.spriteActor.sprite.visible = false;
        }
        view.body.visible = true;
        drawUnit(
          view.body,
          e.cardId === 'skeleton_army'
            ? 'skeleton'
            : e.cardId === 'minions'
              ? 'minion'
              : e.cardId === 'goblins'
                ? 'goblin'
                : card.visual.shape,
          h,
          card.visual.body,
          card.visual.accent,
          e.team,
        );
      }

      view.syncOutline(h);

      view.lastHidden = e.cardId === 'tesla' && !!e.hidden;
      if (e.cardId === 'tesla') {
        this.syncTeslaTrapdoor(view, e, world, h);
      }
      // flyers and the Witch hover above their shadow
      view.flyLift = airborne ? h * 0.55 : 0;

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
    // relógio próprio, não `world.time`: a plateia continua se mexendo durante
    // o hit-stop que congela a simulação quando uma torre cai
    if (this.crowdEnabled) this.crowd.update(dt);
    drawWaterFx(this.waterFxG, this.tile, this.squash, world.time);
    this.drawTension(world.time);
    this.drawZone(world);
    this.drawRageGround(world);
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

      // Troops keep their bar hidden until something actually hurts them —
      // a board full of untouched full bars is pure noise. Towers always show.
      if (e.kind !== 'tower') {
        const target = ratio < 0.999 ? 1 : 0;
        const rate = target > view.hpReveal ? 9 : 2.6;
        view.hpReveal += (target - view.hpReveal) * Math.min(1, dt * rate);
        const a = view.hpReveal < 0.01 ? 0 : view.hpReveal;
        view.hpBg.alpha = a;
        view.hpFg.alpha = a;
        view.hpBg.visible = a > 0;
        view.hpFg.visible = a > 0;
      }

      if (e.kind === 'tower' && e.hp > 0) {
        if (e.towerKind === 'king' && e.active) {
          view.body.clear();
          drawTower(
            view.body,
            e.towerKind,
            e.team,
            T,
            this.squash,
            false,
            true,
            this.towerAimRad(e, world),
            this.towerBowFlip(e),
          );
        } else if (e.towerKind === 'king' && e.active !== view.lastTowerActive) {
          this.buildView(view, e, world);
        }
        view.lastTowerActive = e.towerKind === 'king' ? e.active : view.lastTowerActive;
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
      if (e.cardId === 'inferno') {
        view.infernoLine.clear();
        if (e.state === 'attacking' && e.targetId && e.deployLeft <= 0 && !e.hidden) {
          const target = byId.get(e.targetId);
          if (target) {
            const tx = target.px + (target.x - target.px) * alpha;
            const ty = target.py + (target.y - target.py) * alpha;
            const [tsx, tsy] = this.toScreen(tx, ty - 0.3);
            const th = card.visual.scale * T;
            const originY = -th * 0.58;
            drawInfernoBeam(
              view.infernoLine,
              0,
              originY,
              tsx - sx,
              tsy - sy,
              T,
              e.infernoStage ?? 0,
              e.animT * 7,
            );
          }
        }
      }
      if (card?.visual) {
        const th = gameplayDrawScale(e.cardId, card.visual.scale) * T;
        const swingVal = Math.max(0, e.swing);
        const troopShape =
          e.cardId === 'skeleton_army'
            ? 'skeleton'
            : e.cardId === 'minions'
              ? 'minion'
              : e.cardId === 'goblins'
                ? 'goblin'
                : card.visual.shape;

        if (e.cardId === 'prince') {
          view.body.clear();
          drawUnit(view.body, 'prince', th, card.visual.body, card.visual.accent, e.team, {
            animT: e.animT,
            charging: !!e.charging,
            swing: swingVal,
          });
        } else if (e.cardId === 'mega_knight') {
          const jumpDur = card.jumpDurationSec ?? 1.05;
          let jumpRaise = 0;
          if (e.jumping && e.jumpT !== undefined) {
            const k = Math.min(1, e.jumpT / jumpDur);
            jumpRaise = k < 0.2 ? k / 0.2 : 1;
          } else if (e.jumpLandLeft && e.jumpLandLeft > 0) {
            jumpRaise = e.jumpLandLeft / 0.42;
          }
          view.body.clear();
          drawUnit(view.body, 'mega_knight', th, card.visual.body, card.visual.accent, e.team, {
            jumpRaise,
            swing: swingVal,
          });
        } else if (e.cardId === 'xbow') {
          view.body.clear();
          drawUnit(view.body, 'xbow', th, card.visual.body, card.visual.accent, e.team, {
            swing: swingVal,
          });
        } else if (e.cardId === 'musketeer') {
          // redrawn every frame so the muzzle flash, smoke and kick can play
          view.body.clear();
          view.muzzleFx.clear();
          drawUnit(view.body, 'musketeer', th, card.visual.body, card.visual.accent, e.team, {
            swing: swingVal,
            animT: e.animT,
            fx: view.muzzleFx,
          });
        } else if (e.cardId === 'valkyrie') {
          const spinProg = e.state === 'attacking' && e.swing > 0.02 ? 1 - swingVal : 0;
          view.body.clear();
          drawUnit(view.body, 'valkyrie', th, card.visual.body, card.visual.accent, e.team, {
            spin: spinProg,
          });
          view.spinFx.clear();
          if (spinProg > 0.04) {
            const whirlR = th * (0.52 + spinProg * 0.2);
            for (let i = 0; i < 3; i++) {
              const startA = spinProg * Math.PI * 2 + i * (Math.PI * 2 / 3);
              view.spinFx
                .arc(0, 0, whirlR * (0.86 + i * 0.07), startA, startA + Math.PI * 0.58)
                .stroke({
                  width: 2.8 - i * 0.65,
                  color: i === 0 ? 0xffd98a : 0xffffff,
                  alpha: spinProg * (0.58 - i * 0.13),
                });
            }
            view.spinFx
              .ellipse(0, 0, whirlR, whirlR * 0.34)
              .stroke({ width: 1.6, color: 0xffffff, alpha: spinProg * 0.24 });
          }
        } else if (
          e.kind === 'troop' &&
          card.projectileSpeed === 0 &&
          card.range <= 1.6 &&
          e.cardId !== 'balloon' &&
          !card.visual.spriteCharacter
        ) {
          view.body.clear();
          drawUnit(view.body, troopShape, th, card.visual.body, card.visual.accent, e.team, {
            swing: swingVal,
          });
        }

        if (view.spriteActor && card.visual.spriteCharacter) {
          view.spriteActor.setPixelHeight(th);
          const animState = resolveAnimState(e);
          view.spriteActor.setState(animState, swingVal);
          view.spriteActor.advance(dt, swingVal);
        }

        view.bombFx.clear();
        if (e.cardId === 'balloon') {
          view.body.clear();
          drawUnit(view.body, 'balloon', th, card.visual.body, card.visual.accent, e.team);
          if (e.state === 'attacking' && e.swing > 0.02 && e.targetId) {
            const target = byId.get(e.targetId);
            if (target) {
              const tx = target.px + (target.x - target.px) * alpha;
              const ty = target.py + (target.y - target.py) * alpha;
              const [tsx, tsy] = this.toScreen(tx, ty - 0.3);
              const drop = 1 - swingVal;
              const startY = bob.position.y - th * 0.12 - view.flyLift;
              drawBalloonBombDrop(view.bombFx, 0, startY, tsx - sx, tsy - sy, drop, T);
            }
          }
        }
      } else {
        view.bombFx.clear();
      }
      if (e.kind === 'tower') {
        bob.position.y = Math.max(0, e.swing) ** 2 * T * 0.1;
      } else {
        let bobY = -view.flyLift;
        let bobX = 0;
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
          } else if (e.cardId === 'prince' && e.charging) {
            const t = e.animT * 10;
            bobY -= Math.abs(Math.sin(t)) * T * 0.2;
            bob.rotation = Math.sin(t) * 0.06;
          } else if (e.cardId === 'prince' && e.state === 'moving') {
            const t = e.animT * 4.2;
            bobY -= Math.abs(Math.sin(t)) * T * 0.09;
            bob.rotation = Math.sin(t) * 0.035;
          } else if (e.jumping) {
            const jumpDur = card?.jumpDurationSec ?? 1.05;
            const k = Math.min(1, (e.jumpT ?? 0) / jumpDur);
            bobY -= Math.sin(k * Math.PI) * T * 2.15;
            bob.rotation = 0;
          } else if (e.jumpLandLeft && e.jumpLandLeft > 0) {
            const landK = 1 - e.jumpLandLeft / 0.42;
            bobY += landK * landK * T * 0.14;
            bob.rotation = 0;
          } else if (e.state === 'moving' && e.speed > 0 && !card?.visual.spriteCharacter) {
            const t = e.animT * (4 + e.speed * 2.2);
            bobY -= Math.abs(Math.sin(t)) * T * 0.1;
            bob.rotation = Math.sin(t) * 0.05;
          } else if (e.cardId === 'xbow' && e.swing > 0.05) {
            const recoil = Math.max(0, e.swing) ** 2;
            bobX = Math.sin(e.animT * 58) * recoil * T * 0.1;
            bob.rotation = Math.sin(e.animT * 44 + 0.7) * recoil * 0.05;
            bobY -= recoil * T * 0.02;
          } else if (e.cardId === 'musketeer' && e.swing > 0.02) {
            // the blunderbuss shoves her back instead of lunging forward
            const kick = Math.max(0, e.swing) ** 1.4;
            const dir = bob.scale.x >= 0 ? 1 : -1;
            bobX = -kick * T * 0.13 * dir;
            bobY -= kick * T * 0.025;
            bob.rotation = -kick * 0.09 * dir;
          } else if (e.cardId === 'valkyrie' && e.state === 'attacking' && e.swing > 0.02) {
            const spinProg = 1 - Math.max(0, e.swing);
            bob.rotation = spinProg * Math.PI * 2 * (bob.scale.x >= 0 ? 1 : -1);
            bobY += spinProg * T * 0.05;
          } else {
            bob.rotation = 0;
          }
          if (e.state === 'attacking') {
            const lunge = Math.max(0, e.swing) ** 2;
            if (e.cardId === 'balloon' && lunge > 0.05) {
              bobY -= lunge * T * 0.05;
              bob.rotation = lunge * 0.08 * (bob.scale.x >= 0 ? 1 : -1);
            } else if (e.cardId !== 'xbow' && e.cardId !== 'valkyrie' && e.cardId !== 'inferno' && e.cardId !== 'musketeer' && !card?.visual.spriteCharacter) {
              const lungeMul =
                e.cardId === 'prince'
                  ? 0.22
                  : e.cardId === 'golem'
                    ? 0.1
                    : e.cardId === 'giant'
                      ? 0.08
                      : e.cardId === 'hogrider'
                        ? 0.12
                        : e.cardId === 'mega_knight'
                          ? 0.14
                          : card?.projectileSpeed === 0 && card?.range <= 1.6
                            ? 0.12
                            : 0.14;
              bobY -= lunge * T * lungeMul;
              bob.rotation += lunge * 0.3 * (bob.scale.x >= 0 ? 1 : -1);
            }
          }
        }
        bob.position.x = bobX;
        bob.position.y = bobY;
      }

      const tint =
        e.hitFlash > 0
          ? 0xff9c9c
          : e.stunLeft > 0
            ? 0x9fd8ff
            : e.rageLeft && e.rageLeft > 0
            ? 0xffaad4
            : e.cardId === 'prince' && e.charging
            ? 0xfff4c8
            : e.cardId === 'tesla' && e.state === 'attacking' && e.swing > 0.1
              ? 0xc8f8ff
              : 0xffffff;
      if (view.spriteActor?.sprite.visible) {
        view.spriteActor.sprite.tint = tint;
      } else {
        view.body.tint = tint;
      }
    }

    this.drawPendingSpells(world, alpha);
    this.drawProjectiles(world, alpha, dt);
    this.drainEffects(world);
    this.stepParticles(dt);
    this.stepShake(dt);
    this.stepFlash(dt);
  }

  /** Places the board, with `pivot` already at its centre, plus a shake offset. */
  private applyCamera(dx: number, dy: number, roll: number) {
    const boardH = ARENA.height * this.tile * this.squash;
    const restY = (this.host.clientHeight - boardH) / 2;
    this.root.position.set(
      this.marginX + (ARENA.width * this.tile) / 2 + dx,
      restY + boardH / 2 + dy,
    );
    this.root.rotation = roll;
  }

  /** Camera kick — X, Y and a hair of roll, decaying together. */
  private stepShake(dt: number) {
    if (this.shake <= 0) {
      this.applyCamera(0, 0, 0);
      return;
    }
    this.shake -= dt;
    const s = Math.max(0, this.shake);
    const amp = s * 26;
    this.applyCamera(
      (Math.random() - 0.5) * amp,
      (Math.random() - 0.5) * amp * 0.55,
      (Math.random() - 0.5) * s * 0.012,
    );
  }

  /** Full-board white-out on heavy impacts — one frame of "that mattered". */
  private stepFlash(dt: number) {
    if (this.flash <= 0) {
      if (this.flashG.alpha !== 0) {
        this.flashG.clear();
        this.flashG.alpha = 0;
      }
      return;
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.flashG.clear();
    this.flashG
      .rect(0, 0, ARENA.width * this.tile, ARENA.height * this.tile * this.squash)
      .fill(0xffffff);
    this.flashG.alpha = this.flash * 0.5;
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
      const isBarrel = s.shape === 'goblin_barrel';
      const arcT = Math.sin(k * Math.PI);
      const barrelScale = 0.54 + arcT * 0.78;
      const shadowScale = isBarrel ? 0.22 + k * 0.72 : k;
      entry.shadow
        .ellipse(
          0,
          0,
          this.tile * (isBarrel ? 0.82 : 0.55) * shadowScale,
          this.tile * this.squash * (isBarrel ? 0.52 : 0.4) * shadowScale,
        )
        .fill({ color: 0x000000, alpha: (isBarrel ? 0.18 + k * 0.22 : 0.3 * k) });
      entry.shadow.position.set(tx, ty);

      const spellH = this.tile * (isBarrel ? 1.55 : 0.85);
      if (!entry.drawn) {
        drawUnit(entry.icon, s.shape, spellH, s.body, s.accent);
        entry.icon.pivot.set(0, -spellH * 0.44);
        entry.drawn = true;
      }
      const arcLift = arcT * this.tile * (isBarrel ? 2.2 : 1.4);
      entry.icon.position.set(sx, sy - arcLift);
      entry.icon.scale.set(isBarrel ? barrelScale : 0.55 + k * 0.55);
      if (isBarrel) {
        entry.icon.rotation = k * Math.PI * 6;
      } else {
        entry.icon.rotation = 0;
      }
    }
    for (const [id, entry] of this.spellViews) {
      if (alive.has(id)) continue;
      entry.holder.destroy({ children: true });
      this.spellViews.delete(id);
    }
  }

  private drawProjectiles(world: World, alpha: number, dt: number) {
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

      // Trail: one fading dot every ~35 ms, so the shot reads as travelling
      // rather than teleporting between frames.
      const due = (this.trailClock.get(p.id) ?? 0) - dt;
      if (due <= 0) {
        this.trailClock.set(p.id, 0.035);
        const c = hexToNum(p.color);
        const dot = new Graphics();
        dot.circle(0, 0, p.size * this.tile * 0.8).fill({ color: c, alpha: 0.5 });
        dot.position.set(sx, sy);
        this.projLayer.addChildAt(dot, 0);
        this.particles.push({
          g: dot,
          vx: 0,
          vy: 0,
          life: 0.16,
          max: 0.16,
          grow: 0,
          spin: 0,
          still: true,
        });
      } else {
        this.trailClock.set(p.id, due);
      }
    }
    for (const [id, g] of this.projViews) {
      if (alive.has(id)) continue;
      g.destroy();
      this.projViews.delete(id);
      this.trailClock.delete(id);
    }
  }

  private drainEffects(world: World) {
    for (const fx of world.effects) {
      switch (fx.type) {
        case 'hit': {
          const [sx, sy] = this.toScreen(fx.x, fx.y);
          if (fx.color === '#8ff0ff') {
            this.burst(sx, sy, 0x8ff0ff, 8, this.tile * 0.1, 0.32, {
              shape: 'spark',
              fadeTo: 0x2f6f8f,
            });
            const zap = new Graphics();
            zap.poly([0, -this.tile * 0.35, this.tile * 0.12, -this.tile * 0.12, this.tile * 0.04, -this.tile * 0.12, this.tile * 0.16, this.tile * 0.22, -this.tile * 0.04, this.tile * 0.04, -this.tile * 0.12, 0, -this.tile * 0.12]).fill(0xfffbe0);
            zap.position.set(sx, sy);
            this.fxLayer.addChild(zap);
            this.particles.push({ g: zap, vx: 0, vy: 0, life: 0.18, max: 0.18, grow: 0, spin: 0 });
          } else {
            this.burst(sx, sy, hexToNum(fx.color), 5, this.tile * 0.11, 0.28, {
              shape: 'spark',
            });
          }
          break;
        }
        case 'splash': {
          const [sx, sy] = this.toScreen(fx.x, fx.y);
          const ring = new Graphics();
          ring
            .ellipse(0, 0, fx.radius * this.tile * 0.6, fx.radius * this.tile * this.squash * 0.6)
            .stroke({ width: 2.5, color: 0xffd98a, alpha: 0.75 });
          ring.position.set(sx, sy);
          this.fxLayer.addChild(ring);
          this.particles.push({ g: ring, vx: 0, vy: 0, life: 0.26, max: 0.26, grow: 0.9, spin: 0 });
          break;
        }
        case 'death': {
          const [sx, sy] = this.toScreen(fx.x, fx.y);
          this.burst(sx, sy - fx.scale * this.tile * 0.4, hexToNum(fx.color), 8, this.tile * 0.14, 0.45, {
            fadeTo: 0x3a2f22,
          });
          this.burst(sx, sy - fx.scale * this.tile * 0.3, 0x7d7364, 4, this.tile * 0.16, 0.55, {
            shape: 'puff',
            spread: 0.4,
            lift: 0.7,
          });
          break;
        }
        case 'deploy': {
          const [sx, sy] = this.toScreen(fx.x, fx.y);
          const ring = new Graphics();
          ring
            .ellipse(0, 0, this.tile * 0.8, this.tile * 0.8 * this.squash)
            .stroke({ width: 2.5, color: 0xffffff, alpha: 0.7 });
          ring.position.set(sx, sy);
          this.fxLayer.addChild(ring);
          this.particles.push({ g: ring, vx: 0, vy: 0, life: 0.35, max: 0.35, grow: 1.2, spin: 0 });
          break;
        }
        case 'towerDown': {
          const [sx, sy] = this.toScreen(fx.x, fx.y);
          this.burst(sx, sy - this.tile, 0xb0a696, 18, this.tile * 0.22, 0.8, {
            fadeTo: 0x54493c,
          });
          this.burst(sx, sy - this.tile * 0.6, 0x8b8172, 10, this.tile * 0.3, 1.4, {
            shape: 'puff',
            spread: 0.5,
            lift: 0.9,
          });
          this.addDecal(sx, sy, 1.5, 0x3a2f22, 6);
          this.shake = 0.45;
          this.flash = 0.35;
          // the whole match should feel the tower go down
          this.hitStop = 0.09;
          // a plateia vai ao delírio, com a ola partindo da torre que caiu
          if (this.crowdEnabled) {
            this.celebrateCrowd(fx.x, fx.y, TEAM_COLOR[fx.team === 0 ? 1 : 0]);
          }
          break;
        }
        case 'spell': {
          const [sx, sy] = this.toScreen(fx.x, fx.y);
          this.spellBlast(sx, sy, fx.radius, fx.shape);
          break;
        }
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
        case 'infernoBeam': {
          const [sx0, sy0] = this.toScreen(fx.x0, fx.y0);
          const [sx1, sy1] = this.toScreen(fx.x1, fx.y1);
          const beam = new Graphics();
          drawInfernoBeam(beam, sx0, sy0, sx1, sy1, this.tile, fx.stage, Math.random() * 10);
          this.fxLayer.addChild(beam);
          this.particles.push({ g: beam, vx: 0, vy: 0, life: 0.1, max: 0.1, grow: 0, spin: 0 });
          this.burst(sx1, sy1, 0xff4422, 4, this.tile * 0.08, 0.18);
          break;
        }
      }
    }
    world.effects.length = 0;
  }

  /** The impact of a spell: a coloured shockwave plus debris in its own palette. */
  private spellBlast(x: number, y: number, radius: number, shape: UnitShape) {
    interface Look {
      ring: number;
      bits: number;
      count: number;
      shake: number;
      /** colour the debris cools to as it dies */
      ash: number;
      bitShape: BurstShape;
      /** scorch left behind, or 0 for spells that mark nothing */
      decal: number;
      flash: number;
    }
    const looks: Record<string, Look> = {
      fireball: { ring: 0xffa63d, bits: 0xffd76a, count: 22, shake: 0.28, ash: 0x6b2f14, bitShape: 'chip', decal: 0x3a2416, flash: 0.3 },
      arrows: { ring: 0xe8e2d0, bits: 0x9a7448, count: 18, shake: 0.1, ash: 0x54432c, bitShape: 'spark', decal: 0, flash: 0 },
      zap: { ring: 0x8ff0ff, bits: 0xd6f6ff, count: 14, shake: 0.15, ash: 0x4a2f9c, bitShape: 'spark', decal: 0, flash: 0.22 },
      rage: { ring: 0xff6ec7, bits: 0xff9ede, count: 16, shake: 0.12, ash: 0x8c1257, bitShape: 'puff', decal: 0, flash: 0 },
      freeze: { ring: 0xb3e5fc, bits: 0xe4f6ff, count: 20, shake: 0.14, ash: 0x3f7fa8, bitShape: 'chip', decal: 0x9ecfe8, flash: 0.18 },
      goblin_barrel: { ring: 0xc9a86c, bits: 0xc09163, count: 14, shake: 0.22, ash: 0x4a3120, bitShape: 'chip', decal: 0, flash: 0 },
    };
    const look = looks[shape] ?? looks.fireball;

    const ring = new Graphics();
    ring
      .ellipse(0, 0, radius * this.tile * 0.45, radius * this.tile * this.squash * 0.45)
      .stroke({ width: 4, color: look.ring });
    ring.position.set(x, y);
    this.fxLayer.addChild(ring);
    this.particles.push({ g: ring, vx: 0, vy: 0, life: 0.42, max: 0.42, grow: 1.35, spin: 0 });

    // second, faster ring — reads as a shockwave rather than a single hoop
    const ring2 = new Graphics();
    ring2
      .ellipse(0, 0, radius * this.tile * 0.3, radius * this.tile * this.squash * 0.3)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
    ring2.position.set(x, y);
    this.fxLayer.addChild(ring2);
    this.particles.push({ g: ring2, vx: 0, vy: 0, life: 0.26, max: 0.26, grow: 2.4, spin: 0 });

    const flash = new Graphics();
    flash
      .ellipse(0, 0, radius * this.tile * 0.6, radius * this.tile * this.squash * 0.6)
      .fill({ color: look.ring, alpha: 0.4 });
    flash.position.set(x, y);
    this.fxLayer.addChild(flash);
    this.particles.push({ g: flash, vx: 0, vy: 0, life: 0.22, max: 0.22, grow: 0.5, spin: 0 });

    this.burst(x, y, look.bits, look.count, this.tile * 0.2, 0.55, {
      shape: look.bitShape,
      fadeTo: look.ash,
    });
    if (look.decal) this.addDecal(x, y, radius * 0.55, look.decal, 4.5);
    this.shake = Math.max(this.shake, look.shake);
    this.flash = Math.max(this.flash, look.flash);
    if (shape === 'fireball') this.hitStop = Math.max(this.hitStop, 0.05);
  }

  /**
   * Debris. `shape` picks the silhouette — chunky chips for stone and bone,
   * thin sparks for energy, soft puffs for smoke — and `fadeTo` lets a piece
   * cool through a second colour on its way out instead of only losing alpha.
   */
  private burst(
    x: number,
    y: number,
    color: number,
    count: number,
    size: number,
    life: number,
    opts?: { shape?: BurstShape; fadeTo?: number; spread?: number; lift?: number },
  ) {
    const shape = opts?.shape ?? 'chip';
    const spread = opts?.spread ?? 1;
    const lift = opts?.lift ?? 1.5;

    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const s = size * (0.6 + Math.random() * 0.8);
      if (shape === 'spark') {
        g.roundRect(-s * 1.6, -s * 0.28, s * 3.2, s * 0.56, s * 0.28).fill(color);
      } else if (shape === 'puff') {
        g.circle(0, 0, s * 0.85).fill({ color, alpha: 0.85 });
      } else {
        // slightly irregular chip, so debris doesn't read as a grid of squares
        g.poly([
          -s * 0.5, -s * 0.5,
          s * 0.55, -s * 0.38,
          s * 0.42, s * 0.52,
          -s * 0.46, s * 0.4,
        ]).fill(color);
      }
      g.position.set(x, y);
      this.fxLayer.addChild(g);

      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random()) * this.tile * 3 * spread;
      const pLife = life * (0.7 + Math.random() * 0.6);
      this.particles.push({
        g,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6 - this.tile * lift,
        life: pLife,
        max: pLife,
        grow: shape === 'puff' ? 0.9 : 0,
        spin: shape === 'puff' ? 0 : (Math.random() - 0.5) * 12,
        fadeTo: opts?.fadeTo,
        drag: shape === 'spark' ? 3.2 : shape === 'puff' ? 5 : 1.1,
      });
    }
  }

  /** A mark on the ground that lingers well after the blast that made it. */
  private addDecal(x: number, y: number, radius: number, color: number, life: number) {
    const g = new Graphics();
    const r = radius * this.tile;
    g.ellipse(0, 0, r * 0.9, r * 0.9 * this.squash).fill({ color, alpha: 0.2 });
    g.ellipse(0, 0, r * 0.55, r * 0.55 * this.squash).fill({ color, alpha: 0.14 });
    // ragged rim so it doesn't read as a perfect circle
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random();
      const rr = r * (0.7 + Math.random() * 0.45);
      g.ellipse(
        Math.cos(a) * rr,
        Math.sin(a) * rr * this.squash,
        r * 0.24,
        r * 0.24 * this.squash,
      ).fill({ color, alpha: 0.13 });
    }
    g.position.set(x, y);
    this.groundFxLayer.addChild(g);
    this.decals.push({ g, life, max: life });
  }

  private stepParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.g.alpha = p.grow > 0 ? k * 0.8 : Math.min(1, k * 1.6);
      if (p.fadeTo !== undefined) {
        // tint drifts toward the cool-down colour over the particle's life
        p.g.tint = lerpColor(0xffffff, p.fadeTo, 1 - k);
      }
      if (p.still) {
        p.g.scale.set(0.35 + k * 0.65);
      } else if (p.grow > 0 && p.drag === undefined) {
        p.g.scale.set(1 + (1 - k) * p.grow);
      } else {
        const drag = p.drag ?? 1.1;
        const decay = Math.max(0, 1 - drag * dt);
        p.vx *= decay;
        p.vy *= decay;
        p.vy += this.tile * 10 * dt;
        p.g.position.x += p.vx * dt;
        p.g.position.y += p.vy * dt;
        p.g.rotation += p.spin * dt;
        if (p.grow > 0) p.g.scale.set(1 + (1 - k) * p.grow);
      }
    }
    this.particles = this.particles.filter((p) => {
      if (p.life > 0) return true;
      p.g.destroy();
      return false;
    });

    for (const d of this.decals) {
      d.life -= dt;
      const k = Math.max(0, d.life / d.max);
      // hold full opacity, then fade only over the last third
      d.g.alpha = Math.min(1, k * 3);
    }
    this.decals = this.decals.filter((d) => {
      if (d.life > 0) return true;
      d.g.destroy();
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
    for (const g of this.ragePuddleViews.values()) g.destroy();
    this.ragePuddleViews.clear();
    for (const p of this.particles) p.g.destroy();
    this.particles = [];
    for (const d of this.decals) d.g.destroy();
    this.decals = [];
    this.trailClock.clear();
    this.shake = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.tension = 0;
    this.flashG.clear();
    this.flashG.alpha = 0;
    this.tensionG.clear();
    this.deployPreview = null;
    this.previewG.clear();
  }

  teamColor(team: Team): number {
    return TEAM_COLOR[team];
  }
}
