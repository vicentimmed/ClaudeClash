import type { Graphics } from 'pixi.js';
import { hexToNum, shade } from './shapes';

/**
 * Backup da arte v1 do Goblin (`drawSingleGoblinAt` de shapes.ts), extraída
 * antes da simplificação que alinhou o goblin ao traço limpo do esqueleto.
 * Não é importada em runtime — só referência para restaurar se precisar.
 *
 * Como voltar ao visual antigo:
 *   shapes.ts → substituir o corpo de `drawSingleGoblinAt` pelo desta função
 *   (a assinatura é idêntica, então `case 'goblin'` e `case 'goblins'`
 *   continuam funcionando sem nenhuma outra mudança).
 */

const STEEL = 0xc9d2da;
const DARK_EYE = 0x241c14;

/** Goblin v1: versão detalhada, com orelhas contornadas, botas, tiras e dentes. */
export function drawSingleGoblinV1At(
  g: Graphics,
  h: number,
  bodyHex: string,
  accentHex: string,
  cx: number,
  cy: number,
  swing = 0,
) {
  const body = hexToNum(bodyHex);
  const bodyLight = shade(bodyHex, 0.14);
  const bodyDark = shade(bodyHex, -0.32);
  const pants = hexToNum(accentHex);
  const pantsDark = shade(accentHex, -0.22);
  const boot = 0x8a5a38;
  const bootLight = 0xa07048;
  const strap = 0xc43828;
  const eyeYellow = 0xffee44;
  const tooth = 0xf5f0e8;
  const gold = 0xd4a832;
  const slash = Math.max(0, swing) ** 2;

  const drawEar = (side: number) => {
    const ex = cx + side * h * 0.13;
    const ey = cy - h * 0.66;
    g.poly([
      ex, ey,
      ex + side * h * 0.2, ey - h * 0.035,
      ex + side * h * 0.05, ey + h * 0.055,
    ]).fill(bodyLight);
    g.poly([
      ex, ey,
      ex + side * h * 0.2, ey - h * 0.035,
      ex + side * h * 0.05, ey + h * 0.055,
    ]).stroke({ width: h * 0.012, color: bodyDark });
  };
  drawEar(-1);
  drawEar(1);

  const drawShoe = (side: number) => {
    const sx = cx + side * h * 0.11;
    g.roundRect(sx - h * 0.075, cy - h * 0.085, h * 0.15, h * 0.085, h * 0.025).fill(boot);
    g.ellipse(sx + side * h * 0.085, cy - h * 0.045, h * 0.05, h * 0.038).fill(bootLight);
    g.ellipse(sx + side * h * 0.1, cy - h * 0.05, h * 0.028, h * 0.02).fill(boot);
  };
  drawShoe(-1);
  drawShoe(1);

  g.roundRect(cx - h * 0.155, cy - h * 0.3, h * 0.31, h * 0.24, h * 0.035).fill(pants);
  g.rect(cx - h * 0.155, cy - h * 0.3, h * 0.31, h * 0.045).fill(pantsDark);

  g.roundRect(cx - h * 0.13, cy - h * 0.56, h * 0.055, h * 0.18, h * 0.02).fill(body);
  g.circle(cx - h * 0.1, cy - h * 0.52, h * 0.038).fill(bodyLight);

  g.ellipse(cx + h * 0.015, cy - h * 0.44, h * 0.17, h * 0.15).fill(body);
  g.ellipse(cx + h * 0.02, cy - h * 0.4, h * 0.12, h * 0.09).fill(bodyLight);
  g.circle(cx + h * 0.01, cy - h * 0.34, h * 0.016).fill(bodyDark);

  const strapW = h * 0.028;
  g.moveTo(cx - h * 0.1, cy - h * 0.28)
    .lineTo(cx - h * 0.055, cy - h * 0.54)
    .stroke({ width: strapW, color: strap, cap: 'round' });
  g.moveTo(cx + h * 0.1, cy - h * 0.28)
    .lineTo(cx + h * 0.04, cy - h * 0.54)
    .stroke({ width: strapW, color: strap, cap: 'round' });

  const handX = cx + h * 0.15 + slash * h * 0.12;
  const handY = cy - h * 0.48 + slash * h * 0.07;
  g.roundRect(handX - h * 0.028, handY, h * 0.055, h * 0.13, h * 0.02).fill(body);
  g.circle(handX, handY - h * 0.015, h * 0.038).fill(bodyLight);

  const stabAngle = -1.35 + slash * 1.25;
  const cosA = Math.cos(stabAngle);
  const sinA = Math.sin(stabAngle);
  const perpX = Math.cos(stabAngle + Math.PI / 2);
  const perpY = Math.sin(stabAngle + Math.PI / 2);
  const handleLen = h * 0.09;
  const bladeLen = h * 0.26;
  const handleEndX = handX + cosA * handleLen;
  const handleEndY = handY + sinA * handleLen;
  const tipX = handleEndX + cosA * bladeLen;
  const tipY = handleEndY + sinA * bladeLen;
  const bladeW = h * 0.065;

  g.circle(handX, handY, h * 0.028).fill(gold);
  g.moveTo(handX, handY)
    .lineTo(handleEndX, handleEndY)
    .stroke({ width: h * 0.038, color: boot, cap: 'round' });
  g.poly([
    handleEndX + perpX * bladeW * 0.55, handleEndY + perpY * bladeW * 0.55,
    handleEndX - perpX * bladeW * 0.55, handleEndY - perpY * bladeW * 0.55,
    tipX, tipY,
  ]).fill(STEEL);
  g.poly([
    handleEndX + perpX * bladeW * 0.55, handleEndY + perpY * bladeW * 0.55,
    handleEndX - perpX * bladeW * 0.55, handleEndY - perpY * bladeW * 0.55,
    tipX, tipY,
  ]).stroke({ width: h * 0.01, color: shade(STEEL, -0.25) });

  const headY = cy - h * 0.64;
  g.roundRect(cx - h * 0.145, headY - h * 0.17, h * 0.29, h * 0.21, h * 0.07).fill(body);

  const drawBrow = (side: number) => {
    g.moveTo(cx + side * h * 0.04, headY - h * 0.1)
      .lineTo(cx + side * h * 0.12, headY - h * 0.115)
      .stroke({ width: h * 0.024, color: bodyDark, cap: 'round' });
  };
  drawBrow(-1);
  drawBrow(1);

  const drawEye = (side: number) => {
    const ex = cx + side * h * 0.07;
    const ey = headY - h * 0.04;
    g.circle(ex, ey, h * 0.048).fill(eyeYellow);
    g.circle(ex + side * h * 0.008, ey + h * 0.006, h * 0.022).fill(DARK_EYE);
    g.circle(ex - side * h * 0.012, ey - h * 0.012, h * 0.012).fill({ color: 0xffffff, alpha: 0.55 });
  };
  drawEye(-1);
  drawEye(1);

  g.circle(cx + h * 0.01, headY + h * 0.015, h * 0.04).fill(bodyLight);
  g.circle(cx, headY + h * 0.012, h * 0.012).fill({ color: 0xffffff, alpha: 0.25 });

  const mouthY = headY + h * 0.065;
  g.ellipse(cx + h * 0.015, mouthY, h * 0.085, h * 0.042).fill(0x3a1818);
  g.rect(cx - h * 0.045, mouthY - h * 0.018, h * 0.03, h * 0.018).fill(tooth);
  g.rect(cx - h * 0.008, mouthY - h * 0.018, h * 0.028, h * 0.018).fill(tooth);
  g.rect(cx + h * 0.028, mouthY - h * 0.018, h * 0.022, h * 0.018).fill(tooth);

  if (slash > 0.2) {
    g.circle(tipX, tipY, h * 0.035).fill({ color: 0xffffff, alpha: slash * 0.35 });
  }
}
