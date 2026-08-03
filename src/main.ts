import './style.css';
import { Game } from './game';

const game = new Game();
// Dev-only handle so the running match can be poked from the console (skipping
// ahead to double elixir, forcing effects). Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
game.start().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#e06b6b;padding:20px;white-space:pre-wrap">${String(err)}</pre>`;
});
