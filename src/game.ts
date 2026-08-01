import { Container, Graphics, type Ticker } from 'pixi.js';
import { GameAudio } from './audio';
import {
  cardArtShape,
  deckSelectableIds,
  loadBalance,
  loadSavedDeck,
  saveBalance,
  saveDeck,
  sanitizeDeck,
} from './balance';
import { loadDevSettings, saveDevSettings, type SpeedMultiplier } from './dev/settings';
import { Renderer } from './render/renderer';
import { drawUnit } from './render/shapes';
import { Bot } from './sim/bot';
import type { Balance, CardDef, Effect } from './sim/types';
import { Hand, World } from './sim/world';
import { AdminPanel } from './ui/admin';
import { DeckBuilder } from './ui/deck';
import { Ui } from './ui/hud';

export class Game {
  private balance: Balance = loadBalance();
  private renderer = new Renderer();
  private audio = new GameAudio();
  private ui!: Ui;
  private admin!: AdminPanel;
  private deckBuilder!: DeckBuilder;

  private world!: World;
  private hand!: Hand;
  private botHand!: Hand;
  private bot = new Bot();

  private acc = 0;
  private stepSec = 0.05;
  private resultShown = false;
  private wasElixirFull = false;
  private lastTimerTick = -1;
  private running = false;
  private devSettings = loadDevSettings();
  private gameSpeed: SpeedMultiplier = this.devSettings.gameSpeed;
  private elixirSpeed: SpeedMultiplier = this.devSettings.elixirSpeed;
  private botEnabled = this.devSettings.botEnabled;

  private stage!: HTMLElement;
  private hint!: HTMLElement;

  async start() {
    this.stage = document.getElementById('stage')!;
    await this.renderer.init(this.stage);

    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.style.display = 'none';
    this.stage.appendChild(this.hint);

    this.ui = new Ui(this.balance, (cardId, size) => this.makeArt(cardId, size), {
      onSelectCard: (index) => this.onSelectCard(index),
      onDragRelease: (x, y) => this.onDragRelease(x, y),
      onRestart: () => this.openDeckBuilder(),
      onOpenAdmin: () => {
        this.audio.play('uiTap');
        this.admin.open(this.balance, this.gameSpeed, this.elixirSpeed, this.botEnabled);
      },
      onToggleSound: () => this.toggleSound(),
      onEditDeck: () => {
        this.audio.play('uiTap');
        this.openDeckBuilder();
      },
    });
    this.ui.setSoundOn(this.audio.enabled);
    this.ui.setDevSpeeds(this.gameSpeed, this.elixirSpeed);

    this.admin = new AdminPanel(
      this.balance,
      (balance) => this.applyBalance(balance),
      (gameSpeed) => this.setGameSpeed(gameSpeed),
      (elixirSpeed) => this.setElixirSpeed(elixirSpeed),
      (enabled) => this.setBotEnabled(enabled),
    );

    this.deckBuilder = new DeckBuilder(
      this.balance,
      (cardId, size) => this.makeArt(cardId, size, this.deckArtFillBoost(cardId)),
      {
      onStart: (deck) => this.startMatch(deck),
      onTap: () => this.audio.play('uiTap'),
      onToggleSound: () => this.toggleSound(),
    });
    this.deckBuilder.setSoundOn(this.audio.enabled);

    this.stage.addEventListener('pointerdown', (ev) => this.onStagePointer(ev));
    this.stage.addEventListener('pointermove', (ev) => this.updateDeployPreview(ev.clientX, ev.clientY));
    document.addEventListener('pointermove', (ev) => {
      if (this.ui.selected !== null && this.running) this.updateDeployPreview(ev.clientX, ev.clientY);
    });

    const relayout = () => this.renderer.layout();
    window.addEventListener('resize', relayout);
    new ResizeObserver(relayout).observe(this.stage);

    // audio can only start from a real gesture
    const wake = () => {
      void this.audio.unlock().then(() => {
        if (this.audio.musicOn && !this.running) this.audio.startMusic('deck');
      });
    };
    document.addEventListener('pointerdown', wake, { once: true });

    this.newMatch(this.balance.deck);
    this.openDeckBuilder();
    this.renderer.app.ticker.add((ticker) => this.tick(ticker));

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__game = this;
    }
  }

  // ---------------------------------------------------------------- screens

  private openDeckBuilder() {
    this.running = false;
    this.ui.hideResult();
    this.ui.clearSelection();
    this.renderer.zoneMode = 'none';
    this.hint.style.display = 'none';
    // empty slots the very first time; the deck the player last played after that
    this.deckBuilder.open(sanitizeDeck(this.balance, loadSavedDeck() ?? []));
    void this.audio.unlock().then(() => {
      if (this.audio.musicOn && !this.running) this.audio.startMusic('deck');
    });
  }

  private startMatch(deck: string[]) {
    this.balance.deck = deck;
    saveBalance(this.balance);
    saveDeck(deck);
    this.deckBuilder.close();
    this.newMatch(deck);
    this.running = true;
    void this.audio.unlock().then(() => {
      if (this.audio.musicOn) this.audio.startMusic('battle', { force: true });
    });
  }

  private newMatch(deck: string[]) {
    this.world = new World(this.balance);
    this.world.elixirSpeedMul = this.elixirSpeed;
    this.hand = new Hand(deck);
    this.botHand = new Hand(this.randomBotDeck());
    this.bot = new Bot();
    this.stepSec = 1 / this.balance.global.tickRate;
    this.acc = 0;
    this.resultShown = false;
    this.wasElixirFull = false;
    this.lastTimerTick = -1;
    this.renderer.clear();
    this.renderer.zoneMode = 'none';
    this.ui.hideResult();
    this.ui.clearSelection();
    this.hint.style.display = 'none';
  }

  private randomBotDeck(): string[] {
    const ids = deckSelectableIds(this.balance);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, this.balance.deckSize);
  }

  private applyBalance(balance: Balance) {
    this.balance = balance;
    this.ui.setBalance(balance);
    this.deckBuilder.setBalance(balance);
    this.newMatch(balance.deck);
    this.openDeckBuilder();
  }

  private toggleSound() {
    void this.audio.unlock().then(() => {
      const on = this.audio.toggleAll();
      this.ui.setSoundOn(on);
      this.deckBuilder.setSoundOn(on);
      if (on) this.audio.startMusic(this.running ? 'battle' : 'deck', { force: true });
      else this.audio.stopMusic();
      if (on) this.audio.play('uiTap');
    });
  }

  private setGameSpeed(speed: SpeedMultiplier) {
    this.gameSpeed = speed;
    this.persistDevSettings();
    this.ui.setDevSpeeds(speed, this.elixirSpeed);
  }

  private setElixirSpeed(speed: SpeedMultiplier) {
    this.elixirSpeed = speed;
    if (this.world) this.world.elixirSpeedMul = speed;
    this.persistDevSettings();
    this.ui.setDevSpeeds(this.gameSpeed, speed);
  }

  private setBotEnabled(enabled: boolean) {
    this.botEnabled = enabled;
    this.persistDevSettings();
  }

  private persistDevSettings() {
    saveDevSettings({
      gameSpeed: this.gameSpeed,
      elixirSpeed: this.elixirSpeed,
      botEnabled: this.botEnabled,
    });
  }

  // ------------------------------------------------------------------ input

  private onSelectCard(index: number | null) {
    if (index === null) {
      this.renderer.zoneMode = 'none';
      this.renderer.deployPreview = null;
      this.hint.style.display = 'none';
      return;
    }
    this.audio.play('select');
    const card = this.balance.cards[this.hand.hand[index]];
    this.renderer.zoneMode = card.kind === 'spell' ? 'all' : 'half';
    this.hint.textContent =
      card.cost > this.world.elixir[0]
        ? `Elixir insuficiente (${card.cost})`
        : card.kind === 'spell'
          ? 'Toque em qualquer lugar — círculo = área de efeito'
          : this.deployPreviewRadius(card)
            ? 'Toque na área iluminada — círculo = alcance'
            : 'Toque na área iluminada';
    this.hint.style.display = 'block';
    this.renderer.deployPreview = null;
  }

  /** Radius shown while aiming — buildings use attack range, spells use splash. */
  private deployPreviewRadius(card: CardDef): number | null {
    if (card.kind === 'building' && card.range > 0) return card.range;
    if (card.kind === 'spell' && card.splashRadius > 0) return card.splashRadius;
    return null;
  }

  private deployPreviewColor(cardId: string, card: CardDef): number {
    if (card.kind === 'spell') {
      const spellColors: Record<string, number> = {
        fireball: 0xffa63d,
        arrows: 0xd4c4a0,
        zap: 0x8ff0ff,
        rage: 0xff6ec7,
        freeze: 0xb3e5fc,
        goblin_barrel: 0xc9a86c,
        mirror: 0xc5e4f0,
      };
      return spellColors[cardId] ?? 0xffffff;
    }
    return cardId === 'tesla' ? 0x8ff0ff : 0xc9d2da;
  }

  /** Range/splash circle at the pointer while a building or spell is selected. */
  private updateDeployPreview(clientX: number, clientY: number) {
    const index = this.ui.selected;
    if (index === null || !this.running || this.world.phase === 'over') {
      this.renderer.deployPreview = null;
      return;
    }
    const cardId = this.hand.hand[index];
    const card = this.balance.cards[cardId];
    const range = this.deployPreviewRadius(card);
    if (!range) {
      this.renderer.deployPreview = null;
      return;
    }
    const rect = this.stage.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!inside) {
      this.renderer.deployPreview = null;
      return;
    }
    const [x, y] = this.renderer.fromScreen(clientX - rect.left, clientY - rect.top);
    this.renderer.deployPreview = {
      x,
      y,
      range,
      color: this.deployPreviewColor(cardId, card),
    };
  }

  /** Tap-tap flow: select a card, then tap the arena. Illegal tap keeps the
   * card selected so the player can just try again. */
  private onStagePointer(ev: PointerEvent) {
    const index = this.ui.selected;
    if (index === null || !this.running || this.world.phase === 'over') return;
    const rect = this.stage.getBoundingClientRect();
    const [x, y] = this.renderer.fromScreen(ev.clientX - rect.left, ev.clientY - rect.top);
    const cardId = this.hand.hand[index];
    if (!this.world.deploy(0, cardId, x, y)) return;
    this.hand.play(index);
    this.ui.clearSelection();
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
  }

  /** Drag-and-drop flow: releasing the card, legal or not, always ends the
   * gesture (matches the real game — a bad drop just returns the card). */
  private onDragRelease(clientX: number, clientY: number) {
    const index = this.ui.selected;
    if (index !== null && this.running && this.world.phase !== 'over') {
      const rect = this.stage.getBoundingClientRect();
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (inside) {
        const [x, y] = this.renderer.fromScreen(clientX - rect.left, clientY - rect.top);
        const cardId = this.hand.hand[index];
        if (this.world.deploy(0, cardId, x, y)) this.hand.play(index);
      }
    }
    this.ui.clearSelection();
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
  }

  // ------------------------------------------------------------------- loop

  private tick(ticker: Ticker) {
    const dt = Math.min(ticker.deltaMS / 1000, 0.25) * this.gameSpeed;

    if (this.running && this.world.phase !== 'over') {
      this.acc += dt;
      let guard = 0;
      const maxSteps = Math.ceil(8 * this.gameSpeed);
      while (this.acc >= this.stepSec && guard++ < maxSteps) {
        this.world.step(this.stepSec);
        if (this.botEnabled) this.bot.update(this.world, this.botHand, this.stepSec);
        this.acc -= this.stepSec;
      }
      this.reactToState();
    }

    this.playEffectSounds(this.world.effects);
    this.renderer.draw(this.world, Math.min(1, this.acc / this.stepSec), dt);
    this.ui.update(this.world, this.hand);

    if (this.running && this.world.phase === 'over' && !this.resultShown) {
      this.resultShown = true;
      this.renderer.zoneMode = 'none';
      this.hint.style.display = 'none';
      const result = this.world.result ?? 'draw';
      this.audio.play(result === 'lose' ? 'lose' : 'win');
      setTimeout(() => this.ui.showResult(result, this.world.crowns), 900);
    }
  }

  /** Sounds driven by the match clock and elixir rather than by an effect. */
  private reactToState() {
    const full = this.world.elixir[0] >= this.balance.global.elixirMax - 0.001;
    if (full && !this.wasElixirFull) this.audio.play('elixirFull');
    this.wasElixirFull = full;

    const secs = Math.ceil(this.world.timeLeft);
    if (secs !== this.lastTimerTick && secs <= 5 && secs > 0 && this.world.phase !== 'over') {
      this.audio.play('countdown');
    }
    this.lastTimerTick = secs;
  }

  /** The renderer drains `effects`, so read them just before it does. */
  private playEffectSounds(effects: Effect[]) {
    for (const fx of effects) {
      switch (fx.type) {
        case 'deploy':
          this.audio.play('deploy');
          break;
        case 'hit':
          this.audio.play('melee');
          break;
        case 'splash':
          this.audio.play('splash');
          break;
        case 'death':
          this.audio.play('death');
          break;
        case 'towerDown':
          this.audio.play('towerDown');
          break;
        case 'spell':
          this.audio.play(
            fx.shape === 'arrows'
              ? 'spellArrows'
              : fx.shape === 'zap'
                ? 'spellZap'
                : 'spellFire',
          );
          break;
      }
    }
  }

  // -------------------------------------------------------------- card art

  /** Renders a unit off-screen so the cards use the exact same art as the arena. */
  private makeArt(cardId: string, size: number, fillBoost = 1): string {
    const card = this.balance.cards[cardId];
    const holder = new Container();
    const bounds = new Graphics();
    bounds.rect(0, 0, size, size).fill({ color: 0x000000, alpha: 0.001 });
    const art = new Graphics();
    const h =
      size *
      (0.52 + 0.3 * Math.min(1, card.visual.scale / 2)) *
      fillBoost *
      (cardId === 'giant'
        ? 1.1
        : cardId === 'mirror'
            ? 1.05
            : cardId === 'inferno'
              ? 1.04
              : cardId === 'mega_knight'
                ? 1.06
                : cardId === 'balloon'
                  ? 1.05
                  : cardId === 'goblin_barrel'
                    ? 1.08
                    : cardId === 'skeleton_army'
                      ? 1.08
                      : cardId === 'goblins'
                        ? 1.12
                        : 1);
    drawUnit(
      art,
      cardArtShape(cardId, card.visual.shape),
      h,
      card.visual.body,
      card.visual.accent,
      0,
      fillBoost > 1 && cardId === 'minions' ? { swarmScale: 1.08 } : undefined,
    );
    art.position.set(size / 2, size * 0.94);
    holder.addChild(bounds, art);
    const canvas = this.renderer.app.renderer.extract.canvas(holder) as HTMLCanvasElement;
    const url = canvas.toDataURL('image/png');
    holder.destroy({ children: true });
    return url;
  }

  /** Extra fill in the deck builder so small swarm troops read clearly on card thumbnails. */
  private deckArtFillBoost(cardId: string): number {
    if (cardId === 'goblins') return 1.14;
    if (cardId === 'minions') return 1.22;
    return 1;
  }

  // ---------------------------------------------------------------- debug

  /**
   * Runs the simulation forward without waiting for real time and forces one
   * render. Handy for balance testing and for driving the game from a script.
   */
  debugAdvance(seconds: number) {
    this.running = true;
    const steps = Math.round(seconds / this.stepSec);
    for (let i = 0; i < steps; i++) {
      if (this.world.phase === 'over') break;
      this.world.step(this.stepSec);
      if (this.botEnabled) this.bot.update(this.world, this.botHand, this.stepSec);
    }
    // age particles by the whole skipped span so fast-forwarding doesn't pile up FX
    this.renderer.draw(this.world, 1, Math.min(seconds, 0.5));
    this.ui.update(this.world, this.hand);
    this.renderer.app.render();
  }

  /** Places a card straight onto the board, bypassing the hand. Debug only. */
  debugPlay(cardId: string, x: number, y: number, team: 0 | 1 = 0) {
    this.deckBuilder.close();
    this.running = true;
    this.world.elixir[team] = this.balance.global.elixirMax;
    return this.world.deploy(team, cardId, x, y);
  }
}
