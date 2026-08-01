import { shade } from '../render/shapes';
import type { Balance, CardKind } from '../sim/types';

const KIND_LABEL: Record<CardKind, string> = {
  troop: 'Tropa',
  building: 'Construção',
  spell: 'Feitiço',
};

const DRAG_THRESHOLD = 14;

export interface DeckCallbacks {
  onStart: (deck: string[]) => void;
  onTap: () => void;
}

/**
 * Pre-match screen: pick exactly `deckSize` cards out of the full roster.
 * Tapping a collection card adds it, tapping a slot removes it.
 * Dragging a filled slot reorders (swap or move).
 */
export class DeckBuilder {
  private el: HTMLElement;
  private slotsEl!: HTMLElement;
  private poolEl!: HTMLElement;
  private countEl!: HTMLElement;
  private avgEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;

  private slots: (string | undefined)[] = [];
  private poolCards: Array<{ id: string; el: HTMLButtonElement }> = [];

  private suppressClick = false;
  private dragGhost: HTMLElement | null = null;
  private dragOverIndex: number | null = null;
  private dragState: {
    fromIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null = null;

  constructor(
    private balance: Balance,
    private makeArt: (cardId: string, size: number) => string,
    private cb: DeckCallbacks,
  ) {
    this.el = document.getElementById('deck')!;
    this.slots = this.emptySlots();
    this.build();
  }

  private get size() {
    return this.balance.deckSize;
  }

  private emptySlots(): (string | undefined)[] {
    return Array.from({ length: this.size }, () => undefined);
  }

  private filledCount() {
    return this.slots.filter(Boolean).length;
  }

  private deckOrder(): string[] {
    return this.slots.filter((id): id is string => id !== undefined);
  }

  private build() {
    this.el.innerHTML = `
      <div class="deck-head">
        <strong>Seu deck</strong>
        <span class="deck-count" data-role="count"></span>
        <span class="deck-avg" data-role="avg"></span>
      </div>
      <div class="deck-slots" data-role="slots"></div>
      <div class="deck-sub">Toque para adicionar · arraste no deck para ordenar</div>
      <div class="deck-pool" data-role="pool"></div>
      <div class="deck-foot">
        <button class="ghost-btn" data-role="random">Aleatório</button>
        <button class="big-btn" data-role="play">Jogar</button>
      </div>
    `;
    const q = <T extends HTMLElement>(role: string) =>
      this.el.querySelector<T>(`[data-role="${role}"]`)!;
    this.slotsEl = q('slots');
    this.poolEl = q('pool');
    this.countEl = q('count');
    this.avgEl = q('avg');
    this.playBtn = q<HTMLButtonElement>('play');

    q<HTMLButtonElement>('random').addEventListener('click', () => {
      this.cb.onTap();
      this.slots = this.randomDeck();
      this.refresh();
    });
    this.playBtn.addEventListener('click', () => {
      if (this.filledCount() !== this.size) return;
      this.cb.onStart(this.deckOrder());
    });

    this.buildPool();
  }

  private buildPool() {
    this.poolEl.innerHTML = '';
    this.poolCards = [];
    const ids = Object.keys(this.balance.cards).sort(
      (a, b) => this.balance.cards[a].cost - this.balance.cards[b].cost,
    );
    for (const id of ids) {
      const card = this.balance.cards[id];
      const btn = document.createElement('button');
      btn.className = 'pool-card';
      btn.innerHTML = `
        <div class="card-face">
          <img class="card-art" src="${this.makeArt(id, 128)}" alt="${card.name}" />
          <div class="card-name">${card.name}</div>
        </div>
        <div class="cost">${card.cost}</div>
        <div class="kind-tag">${KIND_LABEL[card.kind]}</div>
      `;
      const face = btn.querySelector<HTMLElement>('.card-face')!;
      face.style.background = `#${shade(card.visual.body, -0.55).toString(16).padStart(6, '0')}`;
      btn.addEventListener('click', () => this.toggle(id));
      this.poolEl.appendChild(btn);
      this.poolCards.push({ id, el: btn });
    }
  }

  private randomDeck(): (string | undefined)[] {
    const ids = Object.keys(this.balance.cards);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const slots = this.emptySlots();
    ids.slice(0, this.size).forEach((id, i) => {
      slots[i] = id;
    });
    return slots;
  }

  private slotIndexOf(id: string): number {
    return this.slots.findIndex((slotId) => slotId === id);
  }

  private firstEmptySlot(): number {
    return this.slots.findIndex((id) => id === undefined);
  }

  private toggle(id: string) {
    this.cb.onTap();
    const at = this.slotIndexOf(id);
    if (at >= 0) {
      this.slots[at] = undefined;
    } else if (this.filledCount() < this.size) {
      const empty = this.firstEmptySlot();
      if (empty >= 0) this.slots[empty] = id;
    } else {
      return;
    }
    this.refresh();
  }

  private removeFromSlot(index: number) {
    const id = this.slots[index];
    if (!id) return;
    this.cb.onTap();
    this.slots[index] = undefined;
    this.refresh();
  }

  private applyDrop(from: number, to: number) {
    if (from === to) return;
    const card = this.slots[from];
    if (!card) return;

    const target = this.slots[to];
    if (target) {
      this.slots[from] = target;
      this.slots[to] = card;
    } else {
      this.slots[to] = card;
      this.slots[from] = undefined;
    }
    this.cb.onTap();
    this.refresh();
  }

  private refresh() {
    this.slotsEl.innerHTML = '';
    for (let i = 0; i < this.size; i++) {
      const id = this.slots[i];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = id ? 'deck-slot filled' : 'deck-slot';
      slot.dataset.slotIndex = String(i);
      if (id) {
        const card = this.balance.cards[id];
        slot.innerHTML = `
          <div class="card-face">
            <img class="card-art" src="${this.makeArt(id, 96)}" alt="${card.name}" />
          </div>
          <div class="cost">${card.cost}</div>
        `;
        slot.querySelector<HTMLElement>('.card-face')!.style.background =
          `#${shade(card.visual.body, -0.55).toString(16).padStart(6, '0')}`;
        slot.addEventListener('click', () => {
          if (this.suppressClick) return;
          this.removeFromSlot(i);
        });
        this.wireSlotDrag(slot, i);
      }
      this.slotsEl.appendChild(slot);
    }

    const filled = this.filledCount();
    const full = filled === this.size;
    this.countEl.textContent = `${filled}/${this.size}`;
    this.countEl.classList.toggle('ok', full);
    const avg = full
      ? this.deckOrder().reduce((sum, cid) => sum + this.balance.cards[cid].cost, 0) / this.size
      : 0;
    this.avgEl.textContent = full ? `custo médio ${avg.toFixed(1)}` : '';
    this.playBtn.disabled = !full;

    this.refreshPool();
  }

  /** Hide cards already in the deck so the pool grid reflows without gaps. */
  private refreshPool() {
    const chosen = new Set(this.slots.filter(Boolean));
    for (const { id, el } of this.poolCards) {
      el.hidden = chosen.has(id);
    }
  }

  // ------------------------------------------------------------------- drag

  private wireSlotDrag(slotEl: HTMLButtonElement, index: number) {
    // Native image drag steals mouse events — disable it on the art.
    for (const img of slotEl.querySelectorAll('img')) {
      img.draggable = false;
    }

    slotEl.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      // Prevent browser image-drag / text selection so pointermove keeps firing.
      ev.preventDefault();

      this.dragState = {
        fromIndex: index,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        dragging: false,
      };

      try {
        slotEl.setPointerCapture(ev.pointerId);
      } catch {
        /* capture can fail on some browsers; window listeners still cover it */
      }

      const onMove = (moveEv: PointerEvent) => {
        const d = this.dragState;
        if (!d || d.fromIndex !== index || d.pointerId !== moveEv.pointerId) return;
        if (!d.dragging) {
          const moved = Math.hypot(moveEv.clientX - d.startX, moveEv.clientY - d.startY);
          if (moved < DRAG_THRESHOLD) return;
          d.dragging = true;
          this.suppressClick = true;
          slotEl.classList.add('dragging');
          this.createGhost(slotEl, moveEv.clientX, moveEv.clientY);
        }
        this.moveGhost(moveEv.clientX, moveEv.clientY);
        this.setDragOver(this.slotAt(moveEv.clientX, moveEv.clientY));
      };

      const release = (upEv: PointerEvent) => {
        const d = this.dragState;
        if (!d || d.fromIndex !== index || d.pointerId !== upEv.pointerId) return;

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);

        if (d.dragging) {
          const to = this.slotAt(upEv.clientX, upEv.clientY);
          this.destroyGhost();
          slotEl.classList.remove('dragging');
          this.setDragOver(null);
          if (to !== null) this.applyDrop(d.fromIndex, to);
          setTimeout(() => {
            this.suppressClick = false;
          }, 0);
        }
        this.dragState = null;
      };

      // Window listeners stay alive past the button — setPointerCapture alone
      // can fail when the browser starts a native image drag.
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    });
  }

  private slotAt(clientX: number, clientY: number): number | null {
    const ghost = this.dragGhost;
    if (ghost) ghost.style.pointerEvents = 'none';
    const hit = document.elementFromPoint(clientX, clientY);
    if (ghost) ghost.style.pointerEvents = '';
    const slot = hit?.closest('.deck-slot');
    if (!slot || !this.slotsEl.contains(slot)) return null;
    const idx = Number((slot as HTMLElement).dataset.slotIndex);
    return Number.isFinite(idx) ? idx : null;
  }

  private setDragOver(index: number | null) {
    if (this.dragOverIndex === index) return;
    if (this.dragOverIndex !== null) {
      this.slotsEl
        .querySelector(`[data-slot-index="${this.dragOverIndex}"]`)
        ?.classList.remove('drag-over');
    }
    this.dragOverIndex = index;
    if (index !== null) {
      this.slotsEl.querySelector(`[data-slot-index="${index}"]`)?.classList.add('drag-over');
    }
  }

  private createGhost(source: HTMLElement, x: number, y: number) {
    const art = source.querySelector<HTMLImageElement>('img.card-art');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost deck';
    if (art) ghost.appendChild(art.cloneNode(true));
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    this.moveGhost(x, y);
  }

  private moveGhost(x: number, y: number) {
    if (!this.dragGhost) return;
    this.dragGhost.style.left = `${x}px`;
    this.dragGhost.style.top = `${y}px`;
  }

  private destroyGhost() {
    this.dragGhost?.remove();
    this.dragGhost = null;
  }

  // ----------------------------------------------------------------- public

  setBalance(balance: Balance) {
    this.balance = balance;
    this.slots = this.slots.map((id) => (id && balance.cards[id] ? id : undefined));
    if (this.slots.length !== this.size) {
      const next = this.emptySlots();
      this.slots.forEach((id, i) => {
        if (i < this.size && id) next[i] = id;
      });
      this.slots = next;
    }
    this.buildPool();
    this.refresh();
  }

  /**
   * `initial` is the last deck the player actually confirmed, or an empty
   * array the very first time — in which case the slots stay empty and the
   * player must build one by hand (or tap "Aleatório").
   */
  open(initial: string[]) {
    this.slots = this.emptySlots();
    initial
      .filter((id) => this.balance.cards[id])
      .slice(0, this.size)
      .forEach((id, i) => {
        this.slots[i] = id;
      });
    this.refresh();
    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
    this.destroyGhost();
    this.setDragOver(null);
    this.dragState = null;
  }
}
