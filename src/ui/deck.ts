import { shade } from '../render/shapes';
import type { Balance, CardKind } from '../sim/types';

const KIND_LABEL: Record<CardKind, string> = {
  troop: 'Tropa',
  building: 'Construção',
  spell: 'Feitiço',
};

export interface DeckCallbacks {
  onStart: (deck: string[]) => void;
  onTap: () => void;
}

/**
 * Pre-match screen: pick exactly `deckSize` cards out of the full roster.
 * Tapping a collection card adds it, tapping a slot removes it.
 */
export class DeckBuilder {
  private el: HTMLElement;
  private slotsEl!: HTMLElement;
  private poolEl!: HTMLElement;
  private countEl!: HTMLElement;
  private avgEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;

  private selected: string[] = [];
  private poolCards: Array<{ id: string; el: HTMLButtonElement }> = [];

  constructor(
    private balance: Balance,
    private makeArt: (cardId: string, size: number) => string,
    private cb: DeckCallbacks,
  ) {
    this.el = document.getElementById('deck')!;
    this.build();
  }

  private get size() {
    return this.balance.deckSize;
  }

  private build() {
    this.el.innerHTML = `
      <div class="deck-head">
        <strong>Seu deck</strong>
        <span class="deck-count" data-role="count"></span>
        <span class="deck-avg" data-role="avg"></span>
      </div>
      <div class="deck-slots" data-role="slots"></div>
      <div class="deck-sub">Toque para adicionar</div>
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
      this.selected = this.randomDeck();
      this.refresh();
    });
    this.playBtn.addEventListener('click', () => {
      if (this.selected.length !== this.size) return;
      this.cb.onStart([...this.selected]);
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

  private randomDeck(): string[] {
    const ids = Object.keys(this.balance.cards);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, this.size);
  }

  private toggle(id: string) {
    this.cb.onTap();
    const at = this.selected.indexOf(id);
    if (at >= 0) {
      this.selected.splice(at, 1);
    } else if (this.selected.length < this.size) {
      this.selected.push(id);
    } else {
      return;
    }
    this.refresh();
  }

  private refresh() {
    this.slotsEl.innerHTML = '';
    for (let i = 0; i < this.size; i++) {
      const id = this.selected[i];
      const slot = document.createElement('button');
      slot.className = id ? 'deck-slot filled' : 'deck-slot';
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
        slot.addEventListener('click', () => this.toggle(id));
      }
      this.slotsEl.appendChild(slot);
    }

    const full = this.selected.length === this.size;
    this.countEl.textContent = `${this.selected.length}/${this.size}`;
    this.countEl.classList.toggle('ok', full);
    const avg = full
      ? this.selected.reduce((sum, id) => sum + this.balance.cards[id].cost, 0) / this.size
      : 0;
    this.avgEl.textContent = full ? `custo médio ${avg.toFixed(1)}` : '';
    this.playBtn.disabled = !full;

    const chosen = new Set(this.selected);
    for (const { id, el } of this.poolCards) el.classList.toggle('chosen', chosen.has(id));
  }

  setBalance(balance: Balance) {
    this.balance = balance;
    this.selected = this.selected.filter((id) => balance.cards[id]);
    this.buildPool();
    this.refresh();
  }

  /**
   * `initial` is the last deck the player actually confirmed, or an empty
   * array the very first time — in which case the slots stay empty and the
   * player must build one by hand (or tap "Aleatório").
   */
  open(initial: string[]) {
    this.selected = initial.filter((id) => this.balance.cards[id]).slice(0, this.size);
    this.refresh();
    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
  }
}
