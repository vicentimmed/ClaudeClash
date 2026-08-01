import './style.css';
import { Game } from './game';

const game = new Game();
game.start().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#e06b6b;padding:20px;white-space:pre-wrap">${String(err)}</pre>`;
});
