/**
 * The 3-2-1 countdown shown over the arena right after the kings appear and
 * before a match actually starts. Purely presentational — the caller decides
 * what "start" means (flip `running` locally, or wait for the server's own
 * delayed tick online) and gets a callback per number for sound effects.
 */

const SEQUENCE = [3, 2, 1] as const;
const STEP_MS = 1000;

export class CountdownOverlay {
  private el: HTMLElement;
  private numEl: HTMLElement;
  private timers: number[] = [];

  constructor(stage: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'countdown-overlay';
    this.numEl = document.createElement('div');
    this.numEl.className = 'countdown-number';
    this.el.appendChild(this.numEl);
    stage.appendChild(this.el);
  }

  /** Runs 3, 2, 1 — one per second — then calls `onDone`. */
  start(onTick: (n: number) => void, onDone: () => void) {
    this.cancel();
    this.el.classList.add('show');
    SEQUENCE.forEach((n, i) => {
      this.timers.push(window.setTimeout(() => this.showNumber(n, onTick), i * STEP_MS));
    });
    this.timers.push(
      window.setTimeout(() => {
        this.el.classList.remove('show');
        onDone();
      }, SEQUENCE.length * STEP_MS),
    );
  }

  private showNumber(n: number, onTick: (n: number) => void) {
    this.numEl.textContent = String(n);
    // restart the CSS animation even if it's the same digit as before
    this.numEl.classList.remove('pop');
    void this.numEl.offsetWidth;
    this.numEl.classList.add('pop');
    onTick(n);
  }

  /** Drops any pending timers and hides immediately — used when a match is
   * abandoned (disconnect, leaving the screen) before the count finishes. */
  cancel() {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.el.classList.remove('show');
  }
}
