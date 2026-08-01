import type { Balance, MatchResult } from '../sim/types';
import type { SpeedMultiplier } from '../dev/settings';
import type { Hand, World } from '../sim/world';
import { shade } from '../render/shapes';

export interface UiCallbacks {
  onSelectCard: (index: number | null) => void;
  /** fired when a drag gesture on a hand card is released, anywhere on screen */
  onDragRelease: (clientX: number, clientY: number) => void;
  onRestart: () => void;
  onOpenAdmin: () => void;
  onToggleSound: () => void;
  onEditDeck: () => void;
}

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_TUNE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2.2" fill="currentColor" stroke="none"/></svg>`;
const ICON_CARDS = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/></svg>`;

const RESULT_TEXT: Record<MatchResult, { title: string; sub: string; color: string }> = {
  win: { title: 'Vitória!', sub: 'Você derrubou mais torres.', color: '#7ad06a' },
  lose: { title: 'Derrota', sub: 'O adversário levou essa.', color: '#e06b6b' },
  draw: { title: 'Empate', sub: 'Ninguém cedeu.', color: '#e8c45a' },
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Ui {
  selected: number | null = null;

  private topbar: HTMLElement;
  private hud: HTMLElement;
  private overlay: HTMLElement;

  private crownsEnemy!: HTMLElement;
  private crownsSelf!: HTMLElement;
  private timerEl!: HTMLElement;
  private timerValue!: HTMLElement;
  private timerLabel!: HTMLElement;
  private speedBadge!: HTMLElement;
  private soundBtn!: HTMLButtonElement;

  private cardsEl!: HTMLElement;
  private nextFace!: HTMLElement;
  private elixirRow!: HTMLElement;
  private elixirCount!: HTMLElement;
  private elixirMode!: HTMLElement;
  private pips: HTMLElement[] = [];

  private cardEls: HTMLButtonElement[] = [];
  private handSignature = '';
  private nextSignature = '';
  private artCache = new Map<string, string>();

  /** true while a card is being dragged, to swallow the trailing synthetic click */
  private suppressClick = false;
  private dragGhost: HTMLElement | null = null;
  private dragState: {
    index: number;
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null = null;

  constructor(
    private balance: Balance,
    private makeArt: (cardId: string, size: number) => string,
    private cb: UiCallbacks,
  ) {
    this.topbar = document.getElementById('topbar')!;
    this.hud = document.getElementById('hud')!;
    this.overlay = document.getElementById('overlay')!;
    this.buildTopbar();
    this.buildHud();
    this.buildOverlay();
  }

  setBalance(balance: Balance) {
    this.balance = balance;
    this.artCache.clear();
    this.handSignature = '';
    this.nextSignature = '';
  }

  // ------------------------------------------------------------------ build

  private buildTopbar() {
    this.topbar.innerHTML = `
      <span class="avatar" style="background:#d64545"></span>
      <div class="crowns" data-role="crowns-enemy"></div>
      <div class="timer" data-role="timer">
        <div class="label" data-role="timer-label">Tempo</div>
        <div class="value" data-role="timer-value">3:00</div>
        <div class="speed-badge" data-role="speed" hidden></div>
      </div>
      <div class="crowns" data-role="crowns-self"></div>
      <span class="avatar" style="background:#3b7dd8"></span>
      <button class="icon-btn square" data-role="sound" aria-label="Som"></button>
      <button class="icon-btn square" data-role="deck" aria-label="Trocar deck">${ICON_CARDS}</button>
      <button class="icon-btn square" data-role="admin" aria-label="Balanceamento">${ICON_TUNE}</button>
    `;
    const q = <T extends HTMLElement>(role: string) =>
      this.topbar.querySelector<T>(`[data-role="${role}"]`)!;
    this.crownsEnemy = q('crowns-enemy');
    this.crownsSelf = q('crowns-self');
    this.timerEl = q('timer');
    this.timerValue = q('timer-value');
    this.timerLabel = q('timer-label');
    this.speedBadge = q('speed');
    this.soundBtn = q<HTMLButtonElement>('sound');
    for (const box of [this.crownsEnemy, this.crownsSelf]) {
      box.innerHTML = '<i class="crown-dot"></i>'.repeat(3);
    }
    this.soundBtn.addEventListener('click', () => this.cb.onToggleSound());
    q<HTMLButtonElement>('deck').addEventListener('click', () => this.cb.onEditDeck());
    q<HTMLButtonElement>('admin').addEventListener('click', () => this.cb.onOpenAdmin());
  }

  setSoundOn(on: boolean) {
    this.soundBtn.innerHTML = on ? ICON_SOUND_ON : ICON_SOUND_OFF;
    this.soundBtn.classList.toggle('off', !on);
  }

  setDevSpeeds(gameSpeed: SpeedMultiplier, elixirSpeed: SpeedMultiplier) {
    const parts: string[] = [];
    if (gameSpeed > 1) parts.push(`${gameSpeed}x`);
    if (elixirSpeed > 1) parts.push(`⚗${elixirSpeed}x`);
    if (parts.length === 0) {
      this.speedBadge.hidden = true;
      return;
    }
    this.speedBadge.hidden = false;
    this.speedBadge.textContent = parts.join(' ');
  }

  private buildHud() {
    this.hud.innerHTML = `
      <div class="hand-row">
        <div class="next-slot">
          <div class="label">Próxima</div>
          <div class="card-face" data-role="next"></div>
        </div>
        <div class="cards" data-role="cards"></div>
      </div>
      <div class="elixir-row" data-role="elixir-row">
        <div class="elixir-count" data-role="elixir-count">5</div>
        <div class="elixir-bar" data-role="elixir-bar"></div>
      </div>
      <div class="elixir-mode" data-role="elixir-mode"></div>
    `;
    const q = <T extends HTMLElement>(role: string) =>
      this.hud.querySelector<T>(`[data-role="${role}"]`)!;
    this.cardsEl = q('cards');
    this.nextFace = q('next');
    this.elixirRow = q('elixir-row');
    this.elixirCount = q('elixir-count');
    this.elixirMode = q('elixir-mode');

    const bar = q('elixir-bar');
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      pip.innerHTML = '<i></i>';
      bar.appendChild(pip);
      this.pips.push(pip.firstElementChild as HTMLElement);
    }

    for (let i = 0; i < 4; i++) {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML = '<div class="card-face"></div><div class="cost"></div>';
      this.wireCardDrag(btn, i);
      btn.addEventListener('click', () => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        this.toggle(i);
      });
      this.cardsEl.appendChild(btn);
      this.cardEls.push(btn);
    }
  }

  /**
   * Dragging is entirely optional: a plain tap still selects the card and a
   * second tap on the arena places it (handled by the `click` listener
   * above). If the pointer moves past a small threshold before release, we
   * switch into drag mode — a ghost follows the finger and releasing it
   * anywhere attempts to deploy right there.
   */
  private wireCardDrag(btn: HTMLButtonElement, index: number) {
    const THRESHOLD = 14;

    btn.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      this.dragState = {
        index,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        dragging: false,
      };
      btn.setPointerCapture(ev.pointerId);
    });

    btn.addEventListener('pointermove', (ev) => {
      const d = this.dragState;
      if (!d || d.index !== index || d.pointerId !== ev.pointerId) return;
      if (!d.dragging) {
        const moved = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);
        if (moved < THRESHOLD) return;
        d.dragging = true;
        this.suppressClick = true;
        this.selected = index;
        this.refreshSelection();
        this.cb.onSelectCard(index);
        this.createGhost(index, ev.clientX, ev.clientY);
      }
      this.moveGhost(ev.clientX, ev.clientY);
    });

    const release = (ev: PointerEvent) => {
      const d = this.dragState;
      if (!d || d.index !== index || d.pointerId !== ev.pointerId) return;
      if (d.dragging) {
        this.destroyGhost();
        this.cb.onDragRelease(ev.clientX, ev.clientY);
        // The browser normally synthesizes a `click` right after this pointerup,
        // which is what actually consumes suppressClick. If it doesn't fire —
        // some platforms skip it after a long drag — self-heal on the next
        // tick so an unrelated tap on another card never gets eaten.
        setTimeout(() => {
          this.suppressClick = false;
        }, 0);
      }
      this.dragState = null;
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  }

  private createGhost(index: number, x: number, y: number) {
    const source = this.cardEls[index].querySelector<HTMLImageElement>('img.card-art');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    if (source) ghost.appendChild(source.cloneNode(true));
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    this.moveGhost(x, y);
  }

  private moveGhost(x: number, y: number) {
    if (!this.dragGhost) return;
    this.dragGhost.style.left = `${x}px`;
    this.dragGhost.style.top = `${y - 74}px`;
  }

  private destroyGhost() {
    this.dragGhost?.remove();
    this.dragGhost = null;
  }

  private buildOverlay() {
    this.overlay.innerHTML = `
      <div>
        <h1 data-role="title"></h1>
        <p data-role="sub"></p>
        <button class="big-btn" data-role="again">Jogar de novo</button>
      </div>
    `;
    this.overlay
      .querySelector<HTMLButtonElement>('[data-role="again"]')!
      .addEventListener('click', () => this.cb.onRestart());
  }

  private toggle(index: number) {
    this.selected = this.selected === index ? null : index;
    this.cb.onSelectCard(this.selected);
    this.refreshSelection();
  }

  clearSelection() {
    this.selected = null;
    this.refreshSelection();
  }

  private refreshSelection() {
    this.cardEls.forEach((el, i) => el.classList.toggle('selected', this.selected === i));
  }

  // ----------------------------------------------------------------- render

  private art(cardId: string, size: number): string {
    const key = `${cardId}:${size}`;
    let url = this.artCache.get(key);
    if (!url) {
      url = this.makeArt(cardId, size);
      this.artCache.set(key, url);
    }
    return url;
  }

  private paintFace(face: HTMLElement, cardId: string, size: number, withName: boolean) {
    const card = this.balance.cards[cardId];
    const bg = shade(card.visual.body, -0.55);
    face.style.background = `#${bg.toString(16).padStart(6, '0')}`;
    face.innerHTML = '';
    const art = document.createElement('img');
    art.className = 'card-art';
    art.src = this.art(cardId, size);
    art.alt = card.name;
    face.appendChild(art);
    if (withName) {
      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = card.name;
      face.appendChild(name);
    }
  }

  syncHand(hand: Hand) {
    const sig = hand.hand.join(',');
    if (sig !== this.handSignature) {
      this.handSignature = sig;
      hand.hand.forEach((cardId, i) => {
        const btn = this.cardEls[i];
        const face = btn.querySelector<HTMLElement>('.card-face')!;
        this.paintFace(face, cardId, 128, true);
        btn.querySelector<HTMLElement>('.cost')!.textContent = String(
          this.balance.cards[cardId].cost,
        );
      });
    }
    if (hand.next !== this.nextSignature) {
      this.nextSignature = hand.next;
      this.nextFace.innerHTML = '';
      this.paintFace(this.nextFace, hand.next, 72, false);
      const cost = document.createElement('div');
      cost.className = 'cost';
      cost.textContent = String(this.balance.cards[hand.next].cost);
      this.nextFace.parentElement!.style.position = 'relative';
      this.nextFace.appendChild(cost);
    }
  }

  update(world: World, hand: Hand) {
    this.syncHand(hand);

    const elixir = world.elixir[0];
    const whole = Math.floor(elixir);
    this.elixirCount.textContent = String(whole);
    for (let i = 0; i < this.pips.length; i++) {
      const fill = Math.max(0, Math.min(1, elixir - i));
      this.pips[i].style.width = `${fill * 100}%`;
    }
    const rate = world.elixirRate();
    const base = world.b.global.elixirRateSec;
    const isTriple = rate <= base / 3 + 1e-6;
    const isDouble = !isTriple && rate < base - 1e-6;
    this.elixirRow.classList.toggle('double', isDouble);
    this.elixirRow.classList.toggle('triple', isTriple);
    this.elixirMode.textContent = isTriple ? 'Elixir 3x' : isDouble ? 'Elixir 2x' : '';
    this.elixirMode.classList.toggle('show', isTriple || isDouble);
    this.elixirMode.classList.toggle('triple', isTriple);

    hand.hand.forEach((cardId, i) => {
      this.cardEls[i].classList.toggle('locked', this.balance.cards[cardId].cost > elixir);
    });

    this.timerValue.textContent = fmtTime(world.timeLeft);
    this.timerLabel.textContent = world.phase === 'overtime' ? 'Prorrogação' : 'Tempo';
    this.timerEl.classList.toggle('hot', world.phase === 'overtime' || world.timeLeft <= 60);

    this.paintCrowns(this.crownsSelf, world.crowns[0]);
    this.paintCrowns(this.crownsEnemy, world.crowns[1]);
  }

  private paintCrowns(box: HTMLElement, count: number) {
    const dots = box.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('on', i < count);
    }
  }

  showResult(result: MatchResult, crowns: [number, number] = [0, 0]) {
    const info = RESULT_TEXT[result];
    const title = this.overlay.querySelector<HTMLElement>('[data-role="title"]')!;
    title.textContent = info.title;
    title.style.color = info.color;
    const threeCrowns = result === 'win' ? crowns[0] === 3 : crowns[1] === 3;
    this.overlay.querySelector<HTMLElement>('[data-role="sub"]')!.textContent = threeCrowns
      ? 'A Torre do Rei caiu.'
      : info.sub;
    this.overlay.classList.add('show');
  }

  hideResult() {
    this.overlay.classList.remove('show');
  }
}
