import { Container, Graphics, type Ticker } from 'pixi.js';
import { GameAudio } from './audio';
import { loadBalance, loadSavedDeck, saveBalance, saveDeck } from './balance';
import { loadDevSettings, saveDevSettings, type SpeedMultiplier } from './dev/settings';
import { Renderer } from './render/renderer';
import { drawUnit } from './render/shapes';
import { Bot } from './sim/bot';
import type { Balance, Effect } from './sim/types';
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
  private gameSpeed: SpeedMultiplier = loadDevSettings().gameSpeed;
  private elixirSpeed: SpeedMultiplier = loadDevSettings().elixirSpeed;

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
        this.admin.open(this.balance, this.gameSpeed, this.elixirSpeed);
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
    );

    this.deckBuilder = new DeckBuilder(this.balance, (cardId, size) => this.makeArt(cardId, size), {
      onStart: (deck) => this.startMatch(deck),
      onTap: () => this.audio.play('uiTap'),
      onToggleSound: () => this.toggleSound(),
    });
    this.deckBuilder.setSoundOn(this.audio.enabled);

    this.stage.addEventListener('pointerdown', (ev) => this.onStagePointer(ev));

    const relayout = () => this.renderer.layout();
    window.addEventListener('resize', relayout);
    new ResizeObserver(relayout).observe(this.stage);

    // audio can only start from a real gesture
    const wake = () => {
      void this.audio.unlock().then(() => {
        if (this.audio.musicOn) this.audio.startMusic('deck');
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
    this.deckBuilder.open(loadSavedDeck() ?? []);
    void this.audio.unlock().then(() => {
      if (this.audio.musicOn) this.audio.startMusic('deck');
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
      if (this.audio.musicOn) this.audio.startMusic('battle');
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
    const ids = Object.keys(this.balance.cards);
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
      if (on) this.audio.startMusic(this.running ? 'battle' : 'deck');
      else this.audio.stopMusic();
      if (on) this.audio.play('uiTap');
    });
  }

  private setGameSpeed(speed: SpeedMultiplier) {
    this.gameSpeed = speed;
    saveDevSettings({ gameSpeed: speed, elixirSpeed: this.elixirSpeed });
    this.ui.setDevSpeeds(speed, this.elixirSpeed);
  }

  private setElixirSpeed(speed: SpeedMultiplier) {
    this.elixirSpeed = speed;
    if (this.world) this.world.elixirSpeedMul = speed;
    saveDevSettings({ gameSpeed: this.gameSpeed, elixirSpeed: speed });
    this.ui.setDevSpeeds(this.gameSpeed, speed);
  }

  // ------------------------------------------------------------------ input

  private onSelectCard(index: number | null) {
    if (index === null) {
      this.renderer.zoneMode = 'none';
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
          ? 'Toque em qualquer lugar do campo'
          : 'Toque na área iluminada';
    this.hint.style.display = 'block';
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
        this.bot.update(this.world, this.botHand, this.stepSec);
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
  private makeArt(cardId: string, size: number): string {
    const card = this.balance.cards[cardId];
    const holder = new Container();
    const bounds = new Graphics();
    bounds.rect(0, 0, size, size).fill({ color: 0x000000, alpha: 0.001 });
    const art = new Graphics();
    const h = size * (0.52 + 0.3 * Math.min(1, card.visual.scale / 2));
    drawUnit(art, card.visual.shape, h, card.visual.body, card.visual.accent);
    art.position.set(size / 2, size * 0.94);
    holder.addChild(bounds, art);
    const canvas = this.renderer.app.renderer.extract.canvas(holder) as HTMLCanvasElement;
    const url = canvas.toDataURL('image/png');
    holder.destroy({ children: true });
    return url;
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
      this.bot.update(this.world, this.botHand, this.stepSec);
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
