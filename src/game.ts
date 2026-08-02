import { Container, Graphics, Sprite, type Ticker } from 'pixi.js';
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
import { NetworkClient, type NetStatus } from './net/client';
import type { ServerMsg } from './net/protocol';
import { Renderer } from './render/renderer';
import { drawUnit } from './render/shapes';
import { getCharacterIdleFrame, isCharacterLoaded } from './render/sprites/character-loader';
import { Bot } from './sim/bot';
import type { Balance, CardDef, Effect } from './sim/types';
import { Hand, World } from './sim/world';
import { AdminPanel } from './ui/admin';
import { DeckBuilder, type PresenceInfo } from './ui/deck';
import { HomeScreen } from './ui/home';
import { Ui, type HandView } from './ui/hud';

type Mode = 'home' | 'local' | 'online';

export class Game {
  private balance: Balance = loadBalance();
  private renderer = new Renderer();
  private audio = new GameAudio();
  private ui!: Ui;
  private admin!: AdminPanel;
  private deckBuilder!: DeckBuilder;

  private home!: HomeScreen;

  private world!: World;
  /** In a local match this is `localHand`; online it mirrors the server. */
  private hand: HandView = { hand: [], next: '' };
  private localHand: Hand | null = null;
  private botHand!: Hand;
  private bot = new Bot();

  private mode: Mode = 'home';
  private net: NetworkClient | null = null;
  private netStatus: NetStatus = 'idle';
  private online = {
    count: 0 as 0 | 1 | 2,
    selfReady: false,
    opponentReady: false,
    opponentConnected: false,
    inMatch: false,
    /** ms timestamp of the last snapshot, for render interpolation */
    lastSnapshotAt: 0,
  };

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
      // Online results route themselves; this button is hidden there.
      onRestart: () => {
        if (this.mode === 'online') return;
        this.openDeckBuilder();
      },
      // Both of these are hidden during an online match (they would yank the
      // player out of a game the server is still running); guarded anyway.
      onOpenAdmin: () => {
        if (this.mode === 'online') return;
        this.audio.play('uiTap');
        this.admin.open(this.balance, this.gameSpeed, this.elixirSpeed, this.botEnabled);
      },
      onToggleSound: () => this.toggleSound(),
      onEditDeck: () => {
        this.audio.play('uiTap');
        if (this.mode === 'online') {
          this.goHome();
          return;
        }
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
      onReadyChange: (deck, ready) => this.onReadyChange(deck, ready),
      onLeaveRoom: () => this.leaveOnline('Você saiu da sala.'),
    });
    this.deckBuilder.setSoundOn(this.audio.enabled);

    this.home = new HomeScreen({
      onPlayLocal: () => {
        this.audio.play('uiTap');
        this.startLocalMode();
      },
      onPlayOnline: () => {
        this.audio.play('uiTap');
        this.startOnlineMode();
      },
    });

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

    // A world exists from the start so the renderer always has something to
    // draw behind the home screen.
    this.newMatch(this.balance.deck);
    this.home.open();
    this.renderer.app.ticker.add((ticker) => this.tick(ticker));

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__game = this;
    }
  }

  // ------------------------------------------------------------ mode switch

  private startLocalMode() {
    this.mode = 'local';
    this.home.close();
    this.ui.setOnlineMode(false);
    this.deckBuilder.setPresence(null);
    this.openDeckBuilder();
  }

  /** Back to the two-button screen, dropping any online session. */
  private goHome(note = '') {
    this.mode = 'home';
    this.running = false;
    this.online.inMatch = false;
    this.net?.leave();
    this.net = null;
    this.deckBuilder.setPresence(null);
    this.deckBuilder.close();
    this.ui.hideResult();
    this.ui.clearSelection();
    this.ui.setOnlineMode(false);
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
    this.home.open(note);
    void this.audio.unlock().then(() => {
      if (this.audio.musicOn) this.audio.startMusic('deck');
    });
  }

  private leaveOnline(note: string) {
    this.audio.play('uiTap');
    this.goHome(note);
  }

  // ----------------------------------------------------------------- online

  private startOnlineMode() {
    this.mode = 'online';
    this.home.close();
    this.ui.setOnlineMode(true);
    this.online = {
      count: 0,
      selfReady: false,
      opponentReady: false,
      opponentConnected: false,
      inMatch: false,
      lastSnapshotAt: 0,
    };
    this.running = false;
    this.openOnlineLobby();

    this.net = new NetworkClient({
      onMessage: (msg) => this.onServerMessage(msg),
      onStatus: (status) => {
        this.netStatus = status;
        this.refreshPresence();
      },
    });
    this.net.connect();
  }

  private openOnlineLobby() {
    this.running = false;
    this.online.inMatch = false;
    this.ui.hideResult();
    this.ui.clearSelection();
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
    this.deckBuilder.open(sanitizeDeck(this.balance, loadSavedDeck() ?? []));
    this.refreshPresence();
    void this.audio.unlock().then(() => {
      if (this.audio.musicOn) this.audio.startMusic('deck');
    });
  }

  private refreshPresence() {
    if (this.mode !== 'online') return;
    const note =
      this.netStatus === 'reconnecting'
        ? 'Reconectando…'
        : this.netStatus === 'connecting'
          ? 'Conectando…'
          : '';
    const info: PresenceInfo = {
      count: this.online.count,
      selfReady: this.online.selfReady,
      opponentReady: this.online.opponentReady,
      opponentConnected: this.online.opponentConnected,
      netNote: note,
    };
    this.deckBuilder.setPresence(info);
  }

  private onReadyChange(deck: string[], ready: boolean) {
    if (this.mode !== 'online' || !this.net) return;
    this.audio.play('uiTap');
    this.online.selfReady = ready;
    if (ready) {
      this.balance.deck = deck;
      saveDeck(deck);
    }
    this.net.send(ready ? { t: 'setReady', ready: true, deck } : { t: 'setReady', ready: false });
  }

  private onServerMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'helloAck':
        // The server's card data wins — never the locally edited balance.
        this.applyServerBalance(msg.balance);
        // Reconnecting into a match already in progress: drop straight into it
        // instead of waiting for a `matchStart` that will never come again.
        if (msg.resuming) this.beginOnlineMatch();
        break;

      case 'roomFull':
        this.goHome('A sala já está cheia (2/2). Tente de novo mais tarde.');
        break;

      case 'kicked':
        this.goHome(msg.reason);
        break;

      case 'roomState':
        this.online.count = msg.count;
        this.online.selfReady = msg.you.ready;
        this.online.opponentReady = msg.opponent?.ready ?? false;
        this.online.opponentConnected = msg.opponent?.connected ?? false;
        if (msg.phase === 'lobby' && this.online.inMatch) {
          // Server ended the match without us noticing — resync.
          this.openOnlineLobby();
        }
        this.refreshPresence();
        break;

      case 'hand':
        this.hand = { hand: [...msg.hand], next: msg.next };
        break;

      case 'matchStart':
        this.beginOnlineMatch();
        break;

      case 'snapshot':
        this.applySnapshot(msg);
        break;

      case 'matchOver':
        this.finishOnlineMatch(msg);
        break;

      case 'error':
        console.warn('[claudeclash] server:', msg.message);
        break;

      case 'ping':
        break;
    }
  }

  /** Online matches run on the server's numbers, not the local admin edits. */
  private applyServerBalance(balance: Balance) {
    this.balance = balance;
    this.ui.setBalance(balance);
    this.deckBuilder.setBalance(balance);
  }

  private beginOnlineMatch() {
    this.deckBuilder.close();
    this.online.inMatch = true;
    this.online.selfReady = false;
    this.resultShown = false;
    this.wasElixirFull = false;
    this.lastTimerTick = -1;
    // A throwaway world the snapshots write into; the renderer draws from it.
    this.world = new World(this.balance);
    this.world.entities = [];
    this.online.lastSnapshotAt = performance.now();
    this.renderer.clear();
    this.renderer.zoneMode = 'none';
    this.ui.hideResult();
    this.ui.clearSelection();
    this.running = true;
    void this.audio.unlock().then(() => {
      if (this.audio.musicOn) this.audio.startMusic('battle', { force: true });
    });
  }

  private applySnapshot(msg: Extract<ServerMsg, { t: 'snapshot' }>) {
    if (!this.online.inMatch) return;
    const w = this.world;
    const s = msg.world;
    w.entities = s.entities;
    w.projectiles = s.projectiles;
    w.pendingSpells = s.pendingSpells;
    w.rageZones = s.rageZones;
    w.elixir = s.elixir;
    w.time = s.time;
    w.timeLeft = s.timeLeft;
    w.phase = s.phase;
    w.result = s.result;
    w.crowns = s.crowns;
    w.lastPlayed = s.lastPlayed;
    // Effects are consumed by the renderer/sound pass on the next frame.
    w.effects.push(...msg.effects);
    this.online.lastSnapshotAt = performance.now();
  }

  private finishOnlineMatch(msg: Extract<ServerMsg, { t: 'matchOver' }>) {
    this.running = false;
    this.online.inMatch = false;
    this.online.selfReady = false;
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
    this.audio.play(msg.result === 'lose' ? 'lose' : 'win');

    const goingHome = msg.routeTo === 'home';
    this.ui.showResult(msg.result, msg.crowns, {
      autoText: goingHome ? 'Voltando ao início…' : 'Voltando à escolha de deck…',
    });

    setTimeout(() => {
      if (this.mode !== 'online') return;
      if (goingHome) this.goHome('A partida terminou porque alguém se desconectou.');
      else this.openOnlineLobby();
    }, 2600);
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
    this.localHand = new Hand(deck);
    this.hand = this.localHand;
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
    if (!this.commitDeploy(index, x, y)) return;
    this.ui.clearSelection();
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
  }

  /**
   * The one place a card actually gets played. Locally it goes straight into
   * the simulation; online it becomes an intent for the server, which owns the
   * real world and will echo the result back in the next snapshot.
   */
  private commitDeploy(index: number, x: number, y: number): boolean {
    const cardId = this.hand.hand[index];
    if (!cardId) return false;

    if (this.mode === 'online') {
      if (!this.net || !this.online.inMatch) return false;
      // Mirror the server's own placement check so an illegal tap keeps the
      // card selected instead of silently burning it.
      if (!this.world.canDeploy(0, x, y, cardId)) return false;
      if (this.balance.cards[cardId].cost > this.world.elixir[0]) return false;
      this.net.send({ t: 'deploy', cardId, x, y });
      return true;
    }

    if (!this.world.deploy(0, cardId, x, y)) return false;
    this.localHand?.play(index);
    return true;
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
        this.commitDeploy(index, x, y);
      }
    }
    this.ui.clearSelection();
    this.renderer.zoneMode = 'none';
    this.renderer.deployPreview = null;
    this.hint.style.display = 'none';
  }

  // ------------------------------------------------------------------- loop

  private tick(ticker: Ticker) {
    const rawDt = Math.min(ticker.deltaMS / 1000, 0.25);
    // Speed multipliers are a local dev aid; an online match runs on the
    // server's clock, so they must not touch it.
    const dt = this.mode === 'online' ? rawDt : rawDt * this.gameSpeed;

    if (this.mode === 'local' && this.running && this.world.phase !== 'over') {
      this.acc += dt;
      let guard = 0;
      const maxSteps = Math.ceil(8 * this.gameSpeed);
      while (this.acc >= this.stepSec && guard++ < maxSteps) {
        this.world.step(this.stepSec);
        if (this.botEnabled) this.bot.update(this.world, this.botHand, this.stepSec);
        this.acc -= this.stepSec;
      }
      this.reactToState();
    } else if (this.mode === 'online' && this.online.inMatch) {
      this.reactToState();
    }

    this.playEffectSounds(this.world.effects);
    this.renderer.draw(this.world, this.renderAlpha(), dt);
    this.ui.update(this.world, this.hand);

    // Online results are announced by the server, not detected locally.
    if (this.mode === 'local' && this.running && this.world.phase === 'over' && !this.resultShown) {
      this.resultShown = true;
      this.renderer.zoneMode = 'none';
      this.hint.style.display = 'none';
      const result = this.world.result ?? 'draw';
      this.audio.play(result === 'lose' ? 'lose' : 'win');
      setTimeout(() => this.ui.showResult(result, this.world.crowns), 900);
    }
  }

  /**
   * How far to blend each entity from its previous tick toward the current one.
   * Locally that's the fixed-step accumulator; online it's the time since the
   * last snapshot, which arrives at the server's tick rate.
   */
  private renderAlpha(): number {
    if (this.mode !== 'online') return Math.min(1, this.acc / this.stepSec);
    const stepMs = this.stepSec * 1000;
    return Math.min(1, (performance.now() - this.online.lastSnapshotAt) / stepMs);
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
    const spriteCharId = card.visual.spriteCharacter;
    if (spriteCharId && isCharacterLoaded(spriteCharId)) {
      const frame = getCharacterIdleFrame(spriteCharId);
      if (frame) {
        const holder = new Container();
        const bounds = new Graphics();
        bounds.rect(0, 0, size, size).fill({ color: 0x000000, alpha: 0.001 });
        const sprite = new Sprite(frame);
        sprite.anchor.set(0.5, 0.94);
        const h =
          size *
          (0.52 + 0.3 * Math.min(1, card.visual.scale / 2)) *
          fillBoost;
        sprite.scale.set(h / frame.height);
        sprite.position.set(size / 2, size * 0.94);
        holder.addChild(bounds, sprite);
        const canvas = this.renderer.app.renderer.extract.canvas(holder) as HTMLCanvasElement;
        const url = canvas.toDataURL('image/png');
        holder.destroy({ children: true });
        return url;
      }
    }

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
    if (this.mode === 'online') {
      console.warn('[claudeclash] debugAdvance is local-only — the server owns the online clock.');
      return;
    }
    this.mode = 'local';
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
    if (this.mode === 'online') {
      console.warn('[claudeclash] debugPlay is local-only — online deploys go through the server.');
      return false;
    }
    this.mode = 'local';
    this.home.close();
    this.deckBuilder.close();
    this.running = true;
    this.world.elixir[team] = this.balance.global.elixirMax;
    return this.world.deploy(team, cardId, x, y);
  }

  /** Dev only: drop the socket without a close frame, like a real network loss. */
  debugKillSocket() {
    this.net?.debugKill();
  }
}
