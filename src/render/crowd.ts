import { Container, Graphics, Sprite, Texture, type Renderer as PixiRenderer } from 'pixi.js';

/**
 * Arquibancada em volta da arena: goblins e caveiras assistindo à partida, que
 * pulam e comemoram quando uma torre cai.
 *
 * Tudo aqui é opcional — com a plateia desligada o renderer não constrói nada
 * deste módulo e a margem lateral vira zero, devolvendo o tabuleiro exatamente
 * ao que era antes (largura cheia da tela).
 *
 * Custo: os espectadores são desenhados uma vez em ~8 texturas (`build`) e
 * depois são só `Sprite`s — por frame só mudam posição e rotação.
 */

/** Largura das arquibancadas, em tiles. Alimenta o cálculo de `tile` no layout. */
export const STANDS = {
  /** faixa em cada lateral */
  marginXTiles: 0.95,
  /** faixa acima e abaixo do tabuleiro */
  marginYTiles: 0.85,
} as const;

/** Duração da comemoração de cada espectador, em segundos. */
const CHEER_DUR = 2.2;
/** Velocidade da "ola" que percorre a arquibancada, em px/s (multiplicado por tile). */
const WAVE_TILES_PER_SEC = 16;

const STAND = {
  floor: 0x3b2f24,
  floorDark: 0x2f251c,
  tier: 0x4a3b2c,
  tierLight: 0x584634,
  wall: 0x261e17,
  wallTop: 0x6b5540,
  post: 0x1d1710,
  banner: 0xe8c45a,
  bannerAlt: 0xf0e3c8,
} as const;

interface Palette {
  skin: number;
  skinDark: number;
  cloth: number;
}

const GOBLIN_PALETTES: Palette[] = [
  { skin: 0x7bc043, skinDark: 0x4f8a2a, cloth: 0x8b5a2b },
  { skin: 0x66b03a, skinDark: 0x437524, cloth: 0xa8442f },
];

const BONE_PALETTES: Palette[] = [
  { skin: 0xe8e2d0, skinDark: 0xb0a894, cloth: 0x6a4a8c },
  { skin: 0xd8cfb6, skinDark: 0xa39a80, cloth: 0x3f6fa8 },
];

/** Pseudoaleatório determinístico — a plateia é idêntica a cada layout. */
function seeded(i: number): number {
  const x = Math.sin(i * 91.7 + 43.1) * 24634.6345;
  return x - Math.floor(x);
}

export interface CrowdLayout {
  tile: number;
  squash: number;
  /** largura do tabuleiro em px */
  boardW: number;
  /** altura do tabuleiro em px */
  boardH: number;
  /** faixa de arquibancada em cada lateral, em px */
  marginX: number;
  /** espaço livre acima do tabuleiro dentro do palco, em px */
  bandTop: number;
  /** espaço livre abaixo do tabuleiro dentro do palco, em px */
  bandBottom: number;
}

interface Variant {
  idle: Texture;
  cheer: Texture;
}

interface Member {
  sprite: Sprite;
  variant: Variant;
  baseX: number;
  baseY: number;
  /** deslocamento de fase, para ninguém respirar em sincronia */
  phase: number;
  /** velocidade do balanço parado */
  speed: number;
  /** amplitude do balanço parado, em px */
  bob: number;
  /** altura do pulo comemorando, em px */
  hop: number;
  /** atraso da ola, em segundos */
  delay: number;
  cheering: boolean;
}

/** Um goblin da plateia, pés em (cx, cy). */
function drawGoblin(g: Graphics, h: number, cx: number, cy: number, p: Palette, cheer: boolean) {
  const armW = h * 0.08;
  const shoulderY = cy - h * 0.55;
  const headY = cy - h * 0.74;

  g.rect(cx - h * 0.13, cy - h * 0.22, h * 0.09, h * 0.22).fill(p.skinDark);
  g.rect(cx + h * 0.04, cy - h * 0.22, h * 0.09, h * 0.22).fill(p.skinDark);
  g.roundRect(cx - h * 0.16, cy - h * 0.36, h * 0.32, h * 0.16, h * 0.04).fill(p.cloth);
  g.roundRect(cx - h * 0.15, cy - h * 0.58, h * 0.3, h * 0.26, h * 0.08).fill(p.skin);

  if (cheer) {
    g.moveTo(cx - h * 0.13, shoulderY)
      .lineTo(cx - h * 0.3, shoulderY - h * 0.3)
      .stroke({ width: armW, color: p.skin, cap: 'round' });
    g.moveTo(cx + h * 0.13, shoulderY)
      .lineTo(cx + h * 0.3, shoulderY - h * 0.3)
      .stroke({ width: armW, color: p.skin, cap: 'round' });
  } else {
    g.moveTo(cx - h * 0.14, shoulderY)
      .lineTo(cx - h * 0.19, shoulderY + h * 0.22)
      .stroke({ width: armW, color: p.skinDark, cap: 'round' });
    g.moveTo(cx + h * 0.14, shoulderY)
      .lineTo(cx + h * 0.19, shoulderY + h * 0.22)
      .stroke({ width: armW, color: p.skinDark, cap: 'round' });
  }

  // orelhas atrás da cabeça — é o que identifica um goblin a esse tamanho
  g.poly([
    cx - h * 0.14, headY - h * 0.04,
    cx - h * 0.34, headY - h * 0.15,
    cx - h * 0.12, headY + h * 0.08,
  ]).fill(p.skinDark);
  g.poly([
    cx + h * 0.14, headY - h * 0.04,
    cx + h * 0.34, headY - h * 0.15,
    cx + h * 0.12, headY + h * 0.08,
  ]).fill(p.skinDark);

  g.circle(cx, headY, h * 0.18).fill(p.skin);
  g.circle(cx - h * 0.07, headY - h * 0.02, h * 0.05).fill(0xffe14d);
  g.circle(cx + h * 0.07, headY - h * 0.02, h * 0.05).fill(0xffe14d);
  g.circle(cx - h * 0.06, headY - h * 0.015, h * 0.022).fill(0x24170f);
  g.circle(cx + h * 0.08, headY - h * 0.015, h * 0.022).fill(0x24170f);

  if (cheer) {
    g.ellipse(cx + h * 0.01, headY + h * 0.09, h * 0.06, h * 0.055).fill(0x2c1a14);
  } else {
    g.roundRect(cx - h * 0.06, headY + h * 0.06, h * 0.13, h * 0.045, h * 0.015).fill(0x2c1a14);
  }
}

/** Uma caveira da plateia, pés em (cx, cy). */
function drawSkeleton(g: Graphics, h: number, cx: number, cy: number, p: Palette, cheer: boolean) {
  const armW = h * 0.065;
  const shoulderY = cy - h * 0.54;
  const headY = cy - h * 0.72;

  g.rect(cx - h * 0.1, cy - h * 0.24, h * 0.055, h * 0.24).fill(p.skinDark);
  g.rect(cx + h * 0.045, cy - h * 0.24, h * 0.055, h * 0.24).fill(p.skinDark);
  g.roundRect(cx - h * 0.13, cy - h * 0.56, h * 0.26, h * 0.32, h * 0.06).fill(p.skin);
  for (let i = 0; i < 3; i++) {
    g.rect(cx - h * 0.13, cy - h * 0.5 + i * h * 0.075, h * 0.26, h * 0.024).fill(p.skinDark);
  }
  g.rect(cx - h * 0.14, cy - h * 0.29, h * 0.28, h * 0.055).fill(p.cloth);

  if (cheer) {
    g.moveTo(cx - h * 0.12, shoulderY)
      .lineTo(cx - h * 0.28, shoulderY - h * 0.3)
      .stroke({ width: armW, color: p.skin, cap: 'round' });
    g.moveTo(cx + h * 0.12, shoulderY)
      .lineTo(cx + h * 0.28, shoulderY - h * 0.3)
      .stroke({ width: armW, color: p.skin, cap: 'round' });
  } else {
    g.moveTo(cx - h * 0.13, shoulderY)
      .lineTo(cx - h * 0.17, shoulderY + h * 0.22)
      .stroke({ width: armW, color: p.skin, cap: 'round' });
    g.moveTo(cx + h * 0.13, shoulderY)
      .lineTo(cx + h * 0.17, shoulderY + h * 0.22)
      .stroke({ width: armW, color: p.skin, cap: 'round' });
  }

  g.circle(cx, headY, h * 0.17).fill(p.skin);
  g.rect(cx - h * 0.075, headY + h * 0.05, h * 0.15, h * 0.08).fill(p.skin);
  g.circle(cx - h * 0.06, headY - h * 0.02, h * 0.045).fill(0x1a1410);
  g.circle(cx + h * 0.06, headY - h * 0.02, h * 0.045).fill(0x1a1410);
  if (cheer) {
    // mandíbula escancarada
    g.rect(cx - h * 0.05, headY + h * 0.075, h * 0.1, h * 0.065).fill(0x1a1410);
  }
}

export class Crowd {
  /** Container que o renderer pendura atrás do tabuleiro. */
  readonly view = new Container();

  private floorG = new Graphics();
  private railG = new Graphics();
  private backLayer = new Container();
  private frontLayer = new Container();

  private variants: Variant[] = [];
  private members: Member[] = [];
  private time = 0;
  private cheerStart = -999;
  private tile = 20;

  constructor() {
    this.view.addChild(this.floorG, this.backLayer, this.frontLayer, this.railG);
  }

  /** Derruba sprites e texturas — chamado antes de reconstruir e ao desligar. */
  clear() {
    this.backLayer.removeChildren().forEach((c) => c.destroy());
    this.frontLayer.removeChildren().forEach((c) => c.destroy());
    for (const v of this.variants) {
      v.idle.destroy(true);
      v.cheer.destroy(true);
    }
    this.variants = [];
    this.members = [];
    this.floorG.clear();
    this.railG.clear();
    this.cheerStart = -999;
  }

  /** (Re)constrói a arquibancada inteira para um layout. */
  build(pixi: PixiRenderer, L: CrowdLayout) {
    this.clear();
    this.tile = L.tile;
    this.drawStands(L);
    this.bakeVariants(pixi, L);
    this.placeMembers(L);
  }

  /** Dispara a comemoração, com a ola partindo do ponto onde a torre caiu. */
  cheer(x: number, y: number) {
    if (this.members.length === 0) return;
    this.cheerStart = this.time;
    const speed = WAVE_TILES_PER_SEC * this.tile;
    for (const m of this.members) {
      const dx = m.baseX - x;
      const dy = m.baseY - y;
      m.delay = Math.sqrt(dx * dx + dy * dy) / speed;
    }
  }

  /** Alguns pontos na arquibancada, para o renderer jogar confete de lá. */
  confettiPoints(count: number): { x: number; y: number }[] {
    if (this.members.length === 0) return [];
    const out: { x: number; y: number }[] = [];
    // os mais perto do estrago comemoram primeiro, então é de lá que sai o confete
    const sorted = [...this.members].sort((a, b) => a.delay - b.delay);
    const pool = sorted.slice(0, Math.max(count, Math.ceil(sorted.length * 0.25)));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const m = pool[Math.floor(seeded(this.time * 13 + i * 7.7) * pool.length)];
      out.push({ x: m.baseX, y: m.baseY - this.tile * 0.5 });
    }
    return out;
  }

  update(dt: number) {
    this.time += dt;
    if (this.members.length === 0) return;
    const since = this.time - this.cheerStart;

    for (const m of this.members) {
      const t = since - m.delay;
      const cheering = t >= 0 && t < CHEER_DUR;
      let y = m.baseY;
      let rot: number;

      if (cheering) {
        // pulo alto que vai perdendo força, mais um chacoalhar do corpo
        const fade = 1 - (t / CHEER_DUR) ** 2;
        y -= Math.abs(Math.sin(t * 9.5 + m.phase)) * m.hop * fade;
        rot = Math.sin(t * 12 + m.phase) * 0.13 * fade;
      } else {
        y -= (Math.sin(this.time * m.speed + m.phase) + 1) * 0.5 * m.bob;
        rot = Math.sin(this.time * m.speed * 0.6 + m.phase) * 0.035;
      }

      if (cheering !== m.cheering) {
        m.cheering = cheering;
        m.sprite.texture = cheering ? m.variant.cheer : m.variant.idle;
      }
      m.sprite.position.set(m.baseX, y);
      m.sprite.rotation = rot;
    }
  }

  // ------------------------------------------------------------ construção

  /** Piso, degraus, mureta da frente e bandeirinhas. */
  private drawStands(L: CrowdLayout) {
    const { tile, boardW, boardH, marginX, bandTop, bandBottom } = L;
    const floor = this.floorG;
    const rail = this.railG;
    floor.clear();
    rail.clear();
    if (marginX <= 0) return;

    // sobra generosa para fora da tela: o shake da câmera nunca revela um vão
    const over = tile * 4;
    const top = -bandTop - over;
    const bottom = boardH + bandBottom + over;

    const band = (x0: number, y0: number, x1: number, y1: number, vertical: boolean) => {
      floor.rect(x0, y0, x1 - x0, y1 - y0).fill(STAND.floor);
      // dois degraus, o de fora mais escuro, para dar profundidade à arquibancada
      if (vertical) {
        const w = x1 - x0;
        floor.rect(x0, y0, w * 0.46, y1 - y0).fill(STAND.floorDark);
        floor.rect(x0 + w * 0.44, y0, w * 0.1, y1 - y0).fill(STAND.tierLight);
      } else {
        const h = y1 - y0;
        floor.rect(x0, y0, x1 - x0, h * 0.46).fill(STAND.floorDark);
        floor.rect(x0, y0 + h * 0.44, x1 - x0, h * 0.1).fill(STAND.tierLight);
      }
    };

    band(-marginX - over, top, 0, bottom, true);
    band(boardW, top, boardW + marginX + over, bottom, true);
    band(-marginX - over, top, boardW + marginX + over, 0, false);
    band(-marginX - over, boardH, boardW + marginX + over, bottom, false);

    // mureta encostada no campo, com o topo iluminado
    const wallW = Math.max(2, tile * 0.16);
    const wall = (x0: number, y0: number, x1: number, y1: number) => {
      rail.rect(x0, y0, x1 - x0, y1 - y0).fill(STAND.wall);
    };
    wall(-wallW, top, 0, bottom);
    wall(boardW, top, boardW + wallW, bottom);
    wall(-marginX - over, -wallW, boardW + marginX + over, 0);
    wall(-marginX - over, boardH, boardW + marginX + over, boardH + wallW);
    rail.rect(-wallW, top, wallW * 0.34, bottom - top).fill(STAND.wallTop);
    rail
      .rect(boardW + wallW * 0.66, top, wallW * 0.34, bottom - top)
      .fill(STAND.wallTop);
    rail
      .rect(-marginX - over, -wallW, boardW + marginX * 2 + over * 2, wallW * 0.34)
      .fill(STAND.wallTop);
    rail
      .rect(-marginX - over, boardH + wallW * 0.66, boardW + marginX * 2 + over * 2, wallW * 0.34)
      .fill(STAND.wallTop);

    // postes e bandeirinhas ao longo das laterais
    const postGap = tile * 2.6;
    let i = 0;
    for (let y = top; y < bottom; y += postGap, i++) {
      for (const x of [-wallW * 0.5, boardW + wallW * 0.5]) {
        rail.rect(x - wallW * 0.5, y, wallW, tile * 0.22).fill(STAND.post);
        const flag = i % 2 === 0 ? STAND.banner : STAND.bannerAlt;
        const dir = x < 0 ? -1 : 1;
        rail
          .poly([
            x + dir * wallW * 0.5, y,
            x + dir * wallW * 2.1, y + tile * 0.05,
            x + dir * wallW * 0.5, y + tile * 0.2,
          ])
          .fill({ color: flag, alpha: 0.75 });
      }
    }

    // sombra do campo caindo sobre a primeira fila
    floor.rect(-marginX - over, -wallW, boardW + marginX * 2 + over * 2, tile * 0.18).fill({
      color: 0x000000,
      alpha: 0.22,
    });
  }

  /** Renderiza cada tipo de espectador uma vez para textura. */
  private bakeVariants(pixi: PixiRenderer, L: CrowdLayout) {
    const figH = L.tile * 0.9;
    const boxW = figH * 1.25;
    const boxH = figH * 1.15;
    const feetY = boxH * 0.96;
    const resolution = Math.min(window.devicePixelRatio || 1, 2);

    const bake = (
      draw: (g: Graphics, h: number, cx: number, cy: number, p: Palette, cheer: boolean) => void,
      p: Palette,
      cheer: boolean,
    ): Texture => {
      const g = new Graphics();
      // caixa transparente fixando o enquadramento — sem ela cada pose geraria
      // uma textura de tamanho diferente e a âncora dos pés escorregaria
      g.rect(0, 0, boxW, boxH).fill({ color: 0x000000, alpha: 0.001 });
      draw(g, figH, boxW / 2, feetY, p, cheer);
      const tex = pixi.generateTexture({ target: g, resolution, antialias: true });
      g.destroy();
      return tex;
    };

    for (const p of GOBLIN_PALETTES) {
      this.variants.push({ idle: bake(drawGoblin, p, false), cheer: bake(drawGoblin, p, true) });
    }
    for (const p of BONE_PALETTES) {
      this.variants.push({
        idle: bake(drawSkeleton, p, false),
        cheer: bake(drawSkeleton, p, true),
      });
    }
  }

  /** Distribui os espectadores nas quatro faixas, em duas fileiras de profundidade. */
  private placeMembers(L: CrowdLayout) {
    const { tile, squash, boardW, boardH, marginX, bandTop, bandBottom } = L;
    if (marginX <= 0 || this.variants.length === 0) return;

    const slots: { x: number; y: number; back: boolean }[] = [];
    // duas fileiras de profundidade, intercaladas meio passo para a plateia
    // parecer cheia sem que os vizinhos de uma mesma fileira se sobreponham
    const gapY = tile * squash * 1.3;
    const gapX = tile * 1.3;
    // as laterais passam do tabuleiro para fechar os cantos com a faixa de cima
    const y0 = -bandTop;
    const y1 = boardH + bandBottom;

    for (const back of [true, false]) {
      // a fileira da frente para a 0.42 da faixa: com meia largura de corpo
      // (~0.35 tile) ela encosta na mureta sem invadir o campo
      const depth = back ? 0.8 : 0.42;
      const offset = back ? 0 : gapY * 0.5;
      for (let y = y0 + offset; y <= y1; y += gapY) {
        slots.push({ x: -marginX * depth, y, back });
        slots.push({ x: boardW + marginX * depth, y, back });
      }
    }

    // faixas de cima e de baixo: a fileira da frente fica colada na mureta e a
    // de trás sobe, saindo parcialmente da tela — a arquibancada continua lá
    for (const back of [true, false]) {
      const near = back ? 0.62 : 0.1;
      const offset = back ? 0 : gapX * 0.5;
      for (let x = -marginX * 0.6 + offset; x <= boardW + marginX * 0.6; x += gapX) {
        slots.push({ x, y: -bandTop * near, back });
        slots.push({ x, y: boardH + bandBottom * near + tile * 0.1, back });
      }
    }

    // agrupar por variante mantém o batch do Pixi inteiro; a ordem dentro de
    // uma fileira não importa porque os vizinhos quase não se sobrepõem
    const buckets: { slot: (typeof slots)[number]; variant: number }[][] = this.variants.map(
      () => [],
    );
    slots.forEach((slot, i) => {
      const variant = Math.floor(seeded(i * 3.3) * this.variants.length) % this.variants.length;
      buckets[variant].push({ slot, variant });
    });

    let n = 0;
    buckets.forEach((bucket, variantIndex) => {
      const variant = this.variants[variantIndex];
      for (const { slot } of bucket) {
        const sprite = new Sprite(variant.idle);
        sprite.anchor.set(0.5, 0.96);
        // fileira de trás menor e mais escura: profundidade sem custo
        const scale = slot.back ? 0.8 : 0.95;
        sprite.scale.set(scale);
        sprite.tint = slot.back ? 0xc4bcae : 0xffffff;
        sprite.position.set(slot.x, slot.y);
        (slot.back ? this.backLayer : this.frontLayer).addChild(sprite);

        this.members.push({
          sprite,
          variant,
          baseX: slot.x,
          baseY: slot.y,
          phase: seeded(n * 7.1) * Math.PI * 2,
          speed: 1.6 + seeded(n * 5.3) * 1.4,
          bob: tile * (0.04 + seeded(n * 9.7) * 0.05),
          hop: tile * (0.34 + seeded(n * 11.9) * 0.26) * scale,
          delay: 0,
          cheering: false,
        });
        n++;
      }
    });
  }
}
