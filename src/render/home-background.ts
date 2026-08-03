import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import type { UnitShape } from '../sim/types';
import { drawUnit, hexToNum } from './shapes';

/**
 * Animated backdrop for the home screen — reuses the same vector `drawUnit`
 * shapes the arena renders, so the walkers are visually identical to the real
 * troops instead of being separate art. A tiny dedicated PIXI.Application
 * because the main `Renderer` only exists once a match is created, and this
 * has to run before the player has picked anything.
 */

interface Walker {
  view: Container;
  shape: UnitShape;
  lane: number;
  x: number;
  dir: 1 | -1;
  speed: number;
  scale: number;
  bobPhase: number;
  bobFreq: number;
}

/** Small flying debris — spark off a stuck arrow, chip off a scorch mark. */
interface Bit {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
  gravity: number;
  spin: number;
}

/** A mark left on the grass that slowly fades — scorch ring or nothing (arrows use their own shaft). */
interface Decal {
  g: Graphics;
  life: number;
  max: number;
  baseAlpha: number;
}

interface FallingArrow {
  g: Graphics;
  startX: number;
  landX: number;
  landY: number;
  t: number;
  dur: number;
  landTilt: number;
  landed: boolean;
  stickT: number;
  stickLife: number;
}

interface FallingFireball {
  g: Graphics;
  startX: number;
  landX: number;
  landY: number;
  t: number;
  dur: number;
  trailClock: number;
  landed: boolean;
}

/** Ground troops only — buildings, spells and card-icon-only shapes stay out. */
const ROSTER: Array<{ shape: UnitShape; body: string; accent: string }> = [
  { shape: 'knight', body: '#d4af37', accent: '#9aa8bc' },
  { shape: 'archer', body: '#4e9d6b', accent: '#c9a227' },
  { shape: 'goblin', body: '#78d048', accent: '#6b4226' },
  { shape: 'skeleton', body: '#efe7d2', accent: '#8e836b' },
  { shape: 'musketeer', body: '#3f6fc4', accent: '#d8b24a' },
  { shape: 'valkyrie', body: '#c8543c', accent: '#e8913a' },
  { shape: 'hogrider', body: '#c98a4b', accent: '#8a5a2b' },
  { shape: 'prince', body: '#d4af37', accent: '#7a4a28' },
  { shape: 'wizard', body: '#3f6fc4', accent: '#ff7a2f' },
  { shape: 'witch', body: '#5c2d8a', accent: '#d4af37' },
  { shape: 'minipekka', body: '#3b3f52', accent: '#57e0d8' },
  { shape: 'giant', body: '#d6a86a', accent: '#7b4a24' },
];

/** Back (small/slow) to front (big/fast) — gives the crowd a sense of depth. */
const LANES = [
  { yFrac: 0.5, scale: 0.5, speed: 16 },
  { yFrac: 0.66, scale: 0.72, speed: 26 },
  { yFrac: 0.84, scale: 1.0, speed: 40 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class HomeBackground {
  app = new Application();
  private root = new Container();
  private sky = new Graphics();
  private ground = new Graphics();
  private clouds = new Graphics();
  private walkerLayer = new Container();
  private walkers: Walker[] = [];
  private time = 0;
  private cloudSeeds = Array.from({ length: 6 }, () => ({
    x: Math.random(),
    y: 0.06 + Math.random() * 0.22,
    scale: 0.6 + Math.random() * 0.8,
    speed: 4 + Math.random() * 6,
  }));
  private horizon = 0;

  // sky events — arrows and fireballs falling, rare and low in number
  private skyLayer = new Container();
  private decalLayer = new Container();
  private arrows: FallingArrow[] = [];
  private fireballs: FallingFireball[] = [];
  private bits: Bit[] = [];
  private decals: Decal[] = [];
  private nextArrowIn = 3 + Math.random() * 3;
  private nextFireballIn = 10 + Math.random() * 8;

  async init(host: HTMLElement) {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
    });
    host.appendChild(this.app.canvas);
    this.root.addChild(
      this.sky,
      this.clouds,
      this.ground,
      this.decalLayer,
      this.walkerLayer,
      this.skyLayer,
    );
    this.app.stage.addChild(this.root);

    for (let i = 0; i < 9; i++) this.walkers.push(this.spawnWalker(true));

    this.paintStatic();
    this.app.renderer.on('resize', () => this.paintStatic());
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS / 1000));
  }

  start() {
    this.app.ticker.start();
  }

  /** Stops the render loop while the home screen is hidden behind a match. */
  stop() {
    this.app.ticker.stop();
  }

  destroy() {
    this.app.destroy(true, { children: true });
  }

  private spawnWalker(randomizeX: boolean): Walker {
    const laneIdx = Math.floor(Math.random() * LANES.length);
    const lane = LANES[laneIdx];
    const pick_ = pick(ROSTER);
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const view = new Container();
    const body = new Graphics();
    const w = this.app.screen.width || 800;
    drawUnit(body, pick_.shape, 90, pick_.body, pick_.accent, undefined, { swing: 0 });
    const shadow = new Graphics();
    shadow.ellipse(0, 6, 34, 10).fill({ color: 0x0a0800, alpha: 0.28 });
    view.addChild(shadow, body);
    this.walkerLayer.addChild(view);
    return {
      view,
      shape: pick_.shape,
      lane: laneIdx,
      x: randomizeX ? Math.random() * w : dir === 1 ? -80 : w + 80,
      dir,
      speed: lane.speed,
      scale: lane.scale,
      bobPhase: Math.random() * Math.PI * 2,
      bobFreq: 5 + Math.random() * 1.4,
    };
  }

  private tick(dt: number) {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    // guards against the one-frame 0/undersized readout some hosts report
    // before their first real layout pass lands
    if (w < 150 || h < 150) return;
    this.time += dt;

    this.clouds.clear();
    for (const c of this.cloudSeeds) {
      const cx = (((c.x * w + this.time * c.speed) % (w + 200)) + w + 200) % (w + 200) - 100;
      const cy = c.y * h;
      const s = c.scale * (w / 800);
      this.clouds.ellipse(cx, cy, 46 * s, 16 * s).fill({ color: 0xfff2d8, alpha: 0.16 });
      this.clouds.ellipse(cx + 30 * s, cy + 5 * s, 30 * s, 12 * s).fill({ color: 0xfff2d8, alpha: 0.13 });
    }

    for (const wk of this.walkers) {
      const lane = LANES[wk.lane];
      wk.x += wk.dir * wk.speed * dt;
      const margin = 90 * wk.scale;
      if (wk.dir === 1 && wk.x > w + margin) wk.x = -margin;
      if (wk.dir === -1 && wk.x < -margin) wk.x = w + margin;

      const bob = Math.abs(Math.sin(this.time * wk.bobFreq + wk.bobPhase)) * 5 * wk.scale;
      const rock = Math.sin(this.time * wk.bobFreq + wk.bobPhase) * 0.05;
      wk.view.position.set(wk.x, lane.yFrac * h - bob);
      wk.view.scale.set(wk.dir * wk.scale, wk.scale);
      wk.view.rotation = rock * wk.dir;
      wk.view.zIndex = lane.yFrac;
    }
    this.walkerLayer.children.sort((a, b) => a.zIndex - b.zIndex);

    this.tickSkyEvents(dt, w, h);
  }

  // -------------------------------------------------------- arrows & fire

  private tickSkyEvents(dt: number, w: number, h: number) {
    if (!w || !h) return;

    this.nextArrowIn -= dt;
    if (this.nextArrowIn <= 0 && this.arrows.length < 5) {
      this.spawnArrow(w, h);
      this.nextArrowIn = 4 + Math.random() * 4;
    }
    this.nextFireballIn -= dt;
    if (this.nextFireballIn <= 0 && this.fireballs.length < 1) {
      this.spawnFireball(w, h);
      this.nextFireballIn = 14 + Math.random() * 12;
    }

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (!a.landed) {
        a.t += dt / a.dur;
        if (a.t >= 1) {
          a.t = 1;
          a.landed = true;
          this.emitBits(a.landX, a.landY, hexToNum('#6d9c40'), 4, { spread: 0.6, lift: 0.9, life: 0.35 });
        }
        // linear sideways drift + accelerating (gravity-like) fall traces a
        // parabola instead of a straight vertical drop
        const startY = -40;
        const px = a.startX + (a.landX - a.startX) * a.t;
        const py = startY + (a.landY - startY) * a.t * a.t;
        a.g.position.set(px, py);
        // rotation follows the instantaneous velocity direction, so the arrow
        // leans into its arc instead of just tilting on a fixed schedule
        const vx = a.landX - a.startX;
        const vy = 2 * a.t * (a.landY - startY);
        const flightAngle = Math.atan2(vx, vy);
        a.g.rotation = a.t < 1 ? flightAngle : (a.landTilt * Math.PI) / 180;
        a.g.alpha = 1;
      } else {
        a.stickT += dt;
        if (a.stickT > a.stickLife - 1) {
          a.g.alpha = Math.max(0, 1 - (a.stickT - (a.stickLife - 1)));
        }
        if (a.stickT >= a.stickLife) {
          this.skyLayer.removeChild(a.g);
          a.g.destroy();
          this.arrows.splice(i, 1);
        }
      }
    }

    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt / f.dur;
      const startY = -40;
      const clampedT = Math.min(1, f.t);
      const px = f.startX + (f.landX - f.startX) * clampedT;
      const py = startY + (f.landY - startY) * clampedT * clampedT;
      f.g.position.set(px, py);
      f.trailClock -= dt;
      if (f.trailClock <= 0 && f.t < 1) {
        f.trailClock = 0.03;
        const puff = new Graphics();
        puff.circle(0, 0, 5).fill({ color: 0xffb35a, alpha: 0.35 });
        puff.position.set(f.g.position.x, f.g.position.y - 4);
        this.skyLayer.addChild(puff);
        this.bits.push({ g: puff, vx: 0, vy: 0, life: 0.22, max: 0.22, gravity: 0, spin: 0 });
      }
      if (f.t >= 1 && !f.landed) {
        f.landed = true;
        this.skyLayer.removeChild(f.g);
        f.g.destroy();
        this.impactFireball(f.landX, f.landY);
        this.fireballs.splice(i, 1);
      }
    }

    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.skyLayer.removeChild(b.g);
        b.g.destroy();
        this.bits.splice(i, 1);
        continue;
      }
      b.vy += b.gravity * dt;
      b.g.position.x += b.vx * dt;
      b.g.position.y += b.vy * dt;
      b.g.rotation += b.spin * dt;
      b.g.alpha = Math.max(0, b.life / b.max);
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.decalLayer.removeChild(d.g);
        d.g.destroy();
        this.decals.splice(i, 1);
        continue;
      }
      d.g.alpha = d.baseAlpha * Math.min(1, d.life / (d.max * 0.4));
    }
  }

  private spawnArrow(w: number, h: number) {
    const landX = 20 + Math.random() * (w - 40);
    const landY = this.horizon + 0.15 * (h - this.horizon) + Math.random() * 0.75 * (h - this.horizon);
    const drift = (70 + Math.random() * 130) * (Math.random() < 0.5 ? -1 : 1);
    const startX = landX - drift;
    const g = new Graphics();
    // tip sits at the origin, feathers trail above it — so rotation 0 has the
    // arrow pointing straight down, ready to stick tip-first into the grass
    g.poly([-5, -8, 5, -8, 0, 0]).fill(hexToNum('#c9c9c9'));
    g.rect(-1.6, -28, 3.2, 20).fill(hexToNum('#8a5f3d'));
    g.poly([-4, -22, 0, -28, 4, -22, 0, -14]).fill(hexToNum('#e8e2d0'));
    g.ellipse(0, 2, 6, 2.4).fill({ color: 0x0a0800, alpha: 0.22 });
    g.position.set(startX, -40);
    this.skyLayer.addChild(g);
    this.arrows.push({
      g,
      startX,
      landX,
      landY,
      t: 0,
      dur: 0.55 + Math.random() * 0.25,
      landTilt: (Math.random() - 0.5) * 16,
      landed: false,
      stickT: 0,
      stickLife: 6 + Math.random() * 4,
    });
  }

  private spawnFireball(w: number, h: number) {
    const landX = 20 + Math.random() * (w - 40);
    const landY = this.horizon + 0.2 * (h - this.horizon) + Math.random() * 0.7 * (h - this.horizon);
    const drift = (60 + Math.random() * 110) * (Math.random() < 0.5 ? -1 : 1);
    const startX = landX - drift;
    const g = new Graphics();
    g.circle(0, 0, 9).fill(hexToNum('#e2622a'));
    g.circle(-1.5, -1.5, 5.5).fill(hexToNum('#ffd45e'));
    g.circle(-2.5, -2.5, 2.5).fill(0xfff3c0);
    g.position.set(startX, -40);
    this.skyLayer.addChild(g);
    this.fireballs.push({
      g,
      startX,
      landX,
      landY,
      t: 0,
      dur: 0.85 + Math.random() * 0.3,
      trailClock: 0,
      landed: false,
    });
  }

  private impactFireball(x: number, y: number) {
    const ring = new Graphics();
    ring.ellipse(0, 0, 14, 6).stroke({ width: 3, color: 0xffa63d, alpha: 0.9 });
    ring.position.set(x, y);
    this.skyLayer.addChild(ring);
    this.bits.push({ g: ring, vx: 0, vy: 0, life: 0.32, max: 0.32, gravity: 0, spin: 0 });

    const flash = new Graphics();
    flash.ellipse(0, 0, 20, 9).fill({ color: 0xffcf7a, alpha: 0.45 });
    flash.position.set(x, y);
    this.skyLayer.addChild(flash);
    this.bits.push({ g: flash, vx: 0, vy: 0, life: 0.18, max: 0.18, gravity: 0, spin: 0 });

    this.emitBits(x, y, hexToNum('#ffd76a'), 8, { spread: 1.4, lift: 2.2, life: 0.55, gravity: 260 });

    const scorch = new Graphics();
    scorch.ellipse(0, 0, 16, 7).fill({ color: 0x2a1810, alpha: 1 });
    scorch.ellipse(0, 0, 9, 4).fill({ color: 0x1a0f0a, alpha: 1 });
    scorch.position.set(x, y);
    this.decalLayer.addChild(scorch);
    this.decals.push({ g: scorch, life: 5, max: 5, baseAlpha: 0.4 });
  }

  private emitBits(
    x: number,
    y: number,
    color: number,
    count: number,
    opts: { spread: number; lift: number; life: number; gravity?: number },
  ) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const s = 2 + Math.random() * 2;
      g.poly([-s, -s * 0.5, s * 0.6, -s, s, s * 0.6, -s * 0.6, s]).fill(color);
      g.position.set(x, y);
      this.skyLayer.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const sp = (30 + Math.random() * 40) * opts.spread;
      const life = opts.life * (0.7 + Math.random() * 0.6);
      this.bits.push({
        g,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - opts.lift * 30,
        life,
        max: life,
        gravity: opts.gravity ?? 140,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  /** Sky gradient + grassy ground — redrawn only on init/resize, not per frame. */
  private paintStatic() {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w < 150 || h < 150) return;

    const skyGrad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x2a1c30 },
        { offset: 0.55, color: 0x6b3f4a },
        { offset: 1, color: 0xc9793f },
      ],
    });
    this.sky.clear();
    this.sky.rect(0, 0, w, h).fill(skyGrad);

    const horizon = h * 0.46;
    this.horizon = horizon;
    const groundGrad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: horizon },
      end: { x: 0, y: h },
      colorStops: [
        { offset: 0, color: 0x5b8635 },
        { offset: 1, color: 0x39511f },
      ],
    });
    this.ground.clear();
    this.ground.rect(0, horizon, w, h - horizon).fill(groundGrad);
    // soft blend line so the horizon isn't a hard seam
    this.ground.rect(0, horizon - 10, w, 20).fill({ color: 0x39511f, alpha: 0.25 });

    // faint checker + tufts for texture, thinning out toward the horizon
    const seeded = (i: number) => {
      const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 90; i++) {
      const y = horizon + seeded(i * 3.1) ** 1.4 * (h - horizon);
      const x = seeded(i * 5.7 + 1.3) * w;
      const s = 3 + ((y - horizon) / (h - horizon)) * 7;
      this.ground.ellipse(x, y, s, s * 0.5).fill({
        color: seeded(i * 9.1) > 0.5 ? hexToNum('#4f7a2d') : hexToNum('#739f46'),
        alpha: 0.35,
      });
    }

    // rim light along the horizon, matching the parchment/gold palette used elsewhere
    this.ground.rect(0, horizon - 2, w, 4).fill({ color: 0xffd98a, alpha: 0.22 });
  }
}
