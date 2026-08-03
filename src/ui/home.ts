/**
 * Landing screen: pick local (vs CPU) or online.
 *
 * Follows the same recipe as the other panels — one always-mounted div that
 * this class owns and toggles with a `.show` class.
 */

import { HomeBackground } from '../render/home-background';

export interface HomeCallbacks {
  onPlayLocal: () => void;
  onPlayOnline: () => void;
}

export class HomeScreen {
  private el: HTMLElement;
  private noteEl!: HTMLElement;
  private bg = new HomeBackground();
  private bgReady: Promise<void>;

  constructor(private cb: HomeCallbacks) {
    this.el = document.getElementById('home')!;
    this.el.innerHTML = `
      <div class="home-bg" data-role="bg"></div>
      <div class="home-inner">
        <h1 class="home-title">ClaudeClash</h1>
        <p class="home-sub">Escolha como quer jogar</p>
        <button class="big-btn home-btn" data-role="local">Jogar contra o CPU</button>
        <button class="big-btn home-btn ghost" data-role="online">Jogar Online</button>
        <p class="home-note" data-role="note"></p>
      </div>
    `;
    const q = <T extends HTMLElement>(role: string) =>
      this.el.querySelector<T>(`[data-role="${role}"]`)!;
    this.noteEl = q('note');
    q<HTMLButtonElement>('local').addEventListener('click', () => this.cb.onPlayLocal());
    q<HTMLButtonElement>('online').addEventListener('click', () => this.cb.onPlayOnline());

    this.bgReady = this.bg.init(q('bg'));
  }

  /** Used to explain why the player was bounced back here. */
  setNote(text: string) {
    this.noteEl.textContent = text;
    this.noteEl.classList.toggle('show', text.length > 0);
  }

  open(note = '') {
    this.setNote(note);
    this.el.classList.add('show');
    void this.bgReady.then(() => this.bg.start());
  }

  close() {
    this.el.classList.remove('show');
    this.bg.stop();
  }
}
