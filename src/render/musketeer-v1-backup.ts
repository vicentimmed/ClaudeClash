import type { Graphics } from 'pixi.js';
import { hexToNum, shade } from './shapes';

/**
 * Backup da arte v1 da Mosqueteira (bloco `case 'musketeer'` de shapes.ts),
 * extraída antes da recriação detalhada baseada no Clash Royale.
 * Não é importada em runtime — só referência para restaurar se precisar.
 *
 * Como voltar ao visual antigo:
 *   1. shapes.ts → substituir todo o corpo de `case 'musketeer'` pela chamada
 *      `drawMusketeerV1(g, h, bodyHex, accentHex); break;`
 *      (ou colar de volta as linhas abaixo, que são o original literal).
 *   2. renderer.ts → remover o branch `e.cardId === 'musketeer'` do redesenho
 *      por frame (a v1 é estática, era desenhada uma única vez em `buildView`)
 *      e remover o branch de recuo `musketeer` da cadeia de bob/rotação,
 *      tirando também `'musketeer'` da lista de exclusão do lunge genérico.
 *   3. shapes.ts → `DrawUnitOpts.animT` volta a ser usado só por prince/valkyrie
 *      (nada a fazer, o campo já existia).
 */

const SKIN = 0xf1c9a0;
const STEEL = 0xc9d2da;
const DARK_EYE = 0x241c14;

/** Mosqueteira v1: silhueta simples, sem animação de tiro. */
export function drawMusketeerV1(g: Graphics, h: number, bodyHex: string, accentHex: string) {
  const body = hexToNum(bodyHex);
  const accent = hexToNum(accentHex);
  const w = h * 0.46;
  g.poly([-w * 0.52, 0, w * 0.52, 0, w * 0.32, -h * 0.48, -w * 0.32, -h * 0.48]).fill(body);
  g.roundRect(-w * 0.3, -h * 0.7, w * 0.6, h * 0.25, h * 0.05).fill(shade(body, 0.14));
  g.rect(-w * 0.32, -h * 0.56, w * 0.64, h * 0.05).fill(accent);
  g.circle(0, -h * 0.79, h * 0.13).fill(SKIN);
  g.ellipse(h * 0.1, -h * 0.72, h * 0.09, h * 0.14).fill(0xb8622f);
  g.ellipse(0, -h * 0.88, h * 0.19, h * 0.06).fill(accent);
  g.ellipse(-h * 0.02, -h * 0.92, h * 0.11, h * 0.07).fill(accent);
  g.circle(-h * 0.05, -h * 0.79, h * 0.02).fill(DARK_EYE);
  g.circle(h * 0.04, -h * 0.79, h * 0.02).fill(DARK_EYE);
  g.rect(-w * 0.15, -h * 0.72, h * 0.72, h * 0.05).fill(0x4a3626);
  g.rect(h * 0.4, -h * 0.735, h * 0.2, h * 0.05).fill(STEEL);
}
