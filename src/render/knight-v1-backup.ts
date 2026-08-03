import type { Graphics } from 'pixi.js';
import { TEAM_COLOR, hexToNum, shade } from './shapes';

/**
 * Backup da arte v1 do Cavaleiro (bloco `case 'knight'` de shapes.ts), extraída
 * antes da simplificação que alinhou o cavaleiro ao traço limpo do esqueleto e
 * do goblin. Não é importada em runtime — só referência para restaurar.
 *
 * Como voltar ao visual antigo:
 *   shapes.ts → substituir todo o corpo de `case 'knight'` por
 *   `drawKnightV1(g, h, bodyHex, accentHex, team, opts?.swing ?? 0); break;`
 *   (ou colar de volta as linhas abaixo, que são o original literal).
 *
 * Diferenças da v1 para a v2, caso queira reaproveitar pedaços:
 *   - v1 usa `body` (#d4af37) como armadura dourada e `accent` como aço;
 *     a v2 inverte, deixando a armadura prateada como no Clash Royale.
 *   - v1 tem escudo redondo no braço de trás; a v2 não tem.
 */

const SKIN = 0xf1c9a0;

/** Cavaleiro v1: armadura dourada detalhada, escudo redondo e rastro de espada. */
export function drawKnightV1(
  g: Graphics,
  h: number,
  bodyHex: string,
  accentHex: string,
  team: number | undefined,
  swing = 0,
) {
  const body = hexToNum(bodyHex);
  const slash = Math.max(0, swing) ** 2;
  const teamColor = team !== undefined ? TEAM_COLOR[team] : 0x3b7dd8;
  const w = h * 0.52;
  const gold = body;
  const goldDark = shade(body, -0.28);
  const goldLight = shade(body, 0.2);
  const steel = hexToNum(accentHex);
  const steelDark = shade(accentHex, -0.35);
  const steelLight = shade(accentHex, 0.18);
  const leather = 0x5c3d24;
  const boot = 0x3a2818;

  g.roundRect(-w * 0.28, -h * 0.24, w * 0.22, h * 0.24, h * 0.03).fill(steelDark);
  g.roundRect(w * 0.06, -h * 0.24, w * 0.22, h * 0.24, h * 0.03).fill(steelDark);
  g.roundRect(-w * 0.3, -h * 0.07, w * 0.26, h * 0.07, h * 0.015).fill(boot);
  g.roundRect(w * 0.04, -h * 0.07, w * 0.26, h * 0.07, h * 0.015).fill(boot);

  g.poly([-w * 0.46, -h * 0.18, w * 0.46, -h * 0.18, w * 0.3, -h * 0.52, -w * 0.3, -h * 0.52]).fill(
    teamColor,
  );
  g.poly([-w * 0.34, -h * 0.2, w * 0.34, -h * 0.2, w * 0.22, -h * 0.48, -w * 0.22, -h * 0.48]).fill(
    shade(teamColor, 0.12),
  );
  g.rect(-w * 0.32, -h * 0.2, w * 0.64, h * 0.035).fill(gold);
  g.rect(-w * 0.18, -h * 0.22, w * 0.36, h * 0.06).fill(steel);

  g.roundRect(-w * 0.36, -h * 0.74, w * 0.72, h * 0.28, h * 0.07).fill(gold);
  g.roundRect(-w * 0.3, -h * 0.72, w * 0.6, h * 0.22, h * 0.05).fill(goldLight);
  g.roundRect(-w * 0.14, -h * 0.72, w * 0.28, h * 0.2, h * 0.04).fill(steelLight);
  g.rect(-w * 0.04, -h * 0.72, w * 0.08, h * 0.18).fill(goldDark);

  g.rect(-w * 0.36, -h * 0.48, w * 0.72, h * 0.05).fill(leather);
  g.rect(-w * 0.06, -h * 0.49, w * 0.12, h * 0.07).fill(gold);
  g.circle(0, -h * 0.455, h * 0.022).fill(goldDark);

  g.circle(-w * 0.42, -h * 0.68, h * 0.1).fill(steel);
  g.circle(-w * 0.42, -h * 0.68, h * 0.065).fill(steelLight);
  g.circle(w * 0.42, -h * 0.68, h * 0.1).fill(steel);
  g.circle(w * 0.42, -h * 0.68, h * 0.065).fill(steelLight);
  g.circle(-w * 0.42, -h * 0.68, h * 0.11).stroke({ width: h * 0.014, color: gold });
  g.circle(w * 0.42, -h * 0.68, h * 0.11).stroke({ width: h * 0.014, color: gold });

  g.roundRect(-w * 0.56, -h * 0.66, w * 0.14, h * 0.08, h * 0.02).fill(steel);
  g.roundRect(-w * 0.62, -h * 0.82, w * 0.28, h * 0.34, h * 0.05).fill(teamColor);
  g.roundRect(-w * 0.62, -h * 0.82, w * 0.28, h * 0.34, h * 0.05).stroke({
    width: h * 0.018,
    color: gold,
  });
  g.circle(-w * 0.48, -h * 0.65, h * 0.045).fill(gold);
  g.poly([
    -w * 0.48, -h * 0.78,
    -w * 0.54, -h * 0.72,
    -w * 0.48, -h * 0.66,
    -w * 0.42, -h * 0.72,
  ]).fill(goldLight);

  const armLean = slash * h * 0.06;
  g.roundRect(w * 0.38 + armLean, -h * 0.68, w * 0.16, h * 0.08, h * 0.02).fill(steel);
  g.circle(w * 0.5 + armLean, -h * 0.64, h * 0.042).fill(SKIN);

  const handX = w * 0.5 + armLean;
  const handY = -h * 0.64;
  const swordAngle = -2.35 + slash * 2.05;
  const swordLen = h * 0.58;
  const tipX = handX + Math.cos(swordAngle) * swordLen;
  const tipY = handY + Math.sin(swordAngle) * swordLen;
  const perpX = Math.cos(swordAngle + Math.PI / 2) * h * 0.018;
  const perpY = Math.sin(swordAngle + Math.PI / 2) * h * 0.018;

  if (slash > 0.08) {
    const trailAlpha = slash * 0.55;
    g.moveTo(handX, handY)
      .lineTo(tipX, tipY)
      .stroke({ width: h * 0.05, color: 0xffffff, alpha: trailAlpha * 0.35 });
    g.arc(handX, handY, h * 0.38, swordAngle - 0.55, swordAngle + 0.35).stroke({
      width: h * 0.028,
      color: 0xe8f4ff,
      alpha: trailAlpha,
    });
  }

  g.poly([
    handX + perpX, handY + perpY,
    handX - perpX, handY - perpY,
    tipX - perpX * 0.35, tipY - perpY * 0.35,
    tipX, tipY,
    tipX + perpX * 0.35, tipY + perpY * 0.35,
  ]).fill(steelLight);
  g.poly([
    tipX, tipY,
    tipX - Math.cos(swordAngle) * h * 0.1 - perpX, tipY - Math.sin(swordAngle) * h * 0.1 - perpY,
    tipX - Math.cos(swordAngle) * h * 0.1 + perpX, tipY - Math.sin(swordAngle) * h * 0.1 + perpY,
  ]).fill(0xffffff);
  g.poly([
    handX + Math.cos(swordAngle + Math.PI / 2) * h * 0.07,
    handY + Math.sin(swordAngle + Math.PI / 2) * h * 0.07,
    handX + Math.cos(swordAngle - Math.PI / 2) * h * 0.07,
    handY + Math.sin(swordAngle - Math.PI / 2) * h * 0.07,
    handX + Math.cos(swordAngle) * h * 0.04 - Math.cos(swordAngle + Math.PI / 2) * h * 0.05,
    handY + Math.sin(swordAngle) * h * 0.04 - Math.sin(swordAngle + Math.PI / 2) * h * 0.05,
    handX + Math.cos(swordAngle) * h * 0.04 + Math.cos(swordAngle + Math.PI / 2) * h * 0.05,
    handY + Math.sin(swordAngle) * h * 0.04 + Math.sin(swordAngle + Math.PI / 2) * h * 0.05,
  ]).fill(gold);
  g.poly([
    handX + Math.cos(swordAngle) * h * 0.05 + perpX * 1.4,
    handY + Math.sin(swordAngle) * h * 0.05 + perpY * 1.4,
    handX + Math.cos(swordAngle) * h * 0.05 - perpX * 1.4,
    handY + Math.sin(swordAngle) * h * 0.05 - perpY * 1.4,
    handX - Math.cos(swordAngle) * h * 0.05 - perpX * 1.4,
    handY - Math.sin(swordAngle) * h * 0.05 - perpY * 1.4,
    handX - Math.cos(swordAngle) * h * 0.05 + perpX * 1.4,
    handY - Math.sin(swordAngle) * h * 0.05 + perpY * 1.4,
  ]).fill(leather);

  g.roundRect(-w * 0.16, -h * 0.96, w * 0.32, h * 0.22, h * 0.06).fill(steel);
  g.roundRect(-w * 0.12, -h * 0.94, w * 0.24, h * 0.16, h * 0.04).fill(steelLight);
  g.roundRect(-w * 0.1, -h * 0.9, w * 0.2, h * 0.05, h * 0.015).fill(0x2a2218);
  g.circle(-h * 0.035, -h * 0.875, h * 0.012).fill(0x4a6080);
  g.circle(h * 0.035, -h * 0.875, h * 0.012).fill(0x4a6080);
  g.rect(-w * 0.16, -h * 0.96, w * 0.32, h * 0.035).fill(gold);
  g.roundRect(-w * 0.14, -h * 0.82, w * 0.1, h * 0.06, h * 0.02).fill(steelDark);
  g.roundRect(w * 0.04, -h * 0.82, w * 0.1, h * 0.06, h * 0.02).fill(steelDark);
  g.poly([
    0, -h * 0.98,
    h * 0.05, -h * 1.12,
    h * 0.01, -h * 1.06,
    -h * 0.03, -h * 1.16,
    -h * 0.02, -h * 1.02,
  ]).fill(teamColor);
  g.poly([0, -h * 0.98, h * 0.03, -h * 1.08, -h * 0.01, -h * 1.04]).fill(shade(teamColor, 0.25));
}
