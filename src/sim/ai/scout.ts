/**
 * Leitura do adversário — o que uma pessoa boa faz de cabeça enquanto joga:
 * contar o elixir do outro, anotar quais cartas ele já mostrou e lembrar
 * quantas cartas passaram desde a última vez que cada uma apareceu.
 *
 * Nada aqui espia `world.elixir[inimigo]`. A estimativa é construída só a
 * partir do que é visível em campo: unidades que entraram e feitiços em voo.
 */

import type { Team } from '../types';
import type { World } from '../world';

interface Sighting {
  /** quantas vezes a carta já foi jogada */
  plays: number;
  /** índice global de jogadas do inimigo na última vez que ela apareceu */
  lastPlayIndex: number;
}

/** Invocações que já foram cobradas junto com a carta que as gerou. */
interface ExpectedSpawn {
  cardId: string;
  left: number;
  until: number;
}

/** Cartas na mão; depois de 4 jogadas a carta usada volta a ficar disponível. */
const CYCLE_LENGTH = 4;

export class Scout {
  /** Estimativa de elixir do adversário (0..10). */
  elixir: number;

  private seenUnits = new Set<number>();
  private seenSpells = new Set<number>();
  private sightings = new Map<string, Sighting>();
  private expected: ExpectedSpawn[] = [];
  private playIndex = 0;
  private max: number;

  constructor(start: number, max: number) {
    this.elixir = start;
    this.max = max;
  }

  observe(world: World, foe: Team, dt: number) {
    this.elixir = Math.min(this.max, this.elixir + (dt * world.elixirSpeedMul) / world.elixirRate());
    this.expected = this.expected.filter((x) => x.until > world.time && x.left > 0);

    // Feitiços aparecem em voo, antes de qualquer efeito no tabuleiro.
    for (const s of world.pendingSpells) {
      if (s.team !== foe || this.seenSpells.has(s.id)) continue;
      this.seenSpells.add(s.id);
      const card = world.b.cards[s.cardId];
      if (!card) continue;
      this.register(s.cardId, card.cost);
      if (card.spellSpawnCardId) {
        this.expected.push({
          cardId: card.spellSpawnCardId,
          left: card.spellSpawnCount ?? 1,
          until: world.time + 4,
        });
      }
    }

    // Tropas: agrupa por carta para não cobrar 3 vezes um trio de Goblins.
    const fresh = new Map<string, number>();
    for (const e of world.entities) {
      if (e.team !== foe || e.kind === 'tower' || this.seenUnits.has(e.id)) continue;
      this.seenUnits.add(e.id);
      fresh.set(e.cardId, (fresh.get(e.cardId) ?? 0) + 1);
    }

    for (const [cardId, seen] of fresh) {
      const card = world.b.cards[cardId];
      if (!card || card.spawnOnly) continue;

      let units = seen;
      const pending = this.expected.find((x) => x.cardId === cardId);
      if (pending) {
        const used = Math.min(pending.left, units);
        pending.left -= used;
        units -= used;
      }
      if (units <= 0) continue;
      // Esqueletos saindo de uma Lápide ou Bruxa não custaram elixir.
      if (this.spawnerAlive(world, foe, cardId)) continue;

      const plays = Math.max(1, Math.round(units / Math.max(1, card.count)));
      this.register(cardId, card.cost * plays, plays);
    }
  }

  /** Alguma construção/tropa inimiga viva produz essa carta sozinha? */
  private spawnerAlive(world: World, foe: Team, cardId: string): boolean {
    return world.entities.some((e) => {
      if (e.team !== foe || e.hp <= 0) return false;
      const def = world.b.cards[e.cardId];
      return def?.spawnCardId === cardId || def?.deathSpawnCardId === cardId;
    });
  }

  private register(cardId: string, cost: number, plays = 1) {
    this.elixir = Math.max(0, this.elixir - cost);
    this.playIndex += plays;
    const prev = this.sightings.get(cardId);
    this.sightings.set(cardId, {
      plays: (prev?.plays ?? 0) + plays,
      lastPlayIndex: this.playIndex,
    });
  }

  /** Cartas que o adversário já revelou. */
  known(): string[] {
    return [...this.sightings.keys()];
  }

  seen(cardId: string): boolean {
    return this.sightings.has(cardId);
  }

  /**
   * A carta provavelmente já voltou à mão dele? Carta nunca vista é tratada
   * como disponível — o pessimismo é o que mantém a IA honesta.
   */
  available(cardId: string): boolean {
    const s = this.sightings.get(cardId);
    if (!s) return true;
    return this.playIndex - s.lastPlayIndex >= CYCLE_LENGTH;
  }

  /**
   * A condição de vitória do adversário: a primeira carta revelada que ataca
   * construções, ou a mais cara que ele mostrou até agora.
   */
  winCondition(world: World): string | undefined {
    let fallback: string | undefined;
    let fallbackCost = 4;
    for (const id of this.sightings.keys()) {
      const card = world.b.cards[id];
      if (!card) continue;
      if (card.targets === 'buildings' || id === 'xbow' || id === 'goblin_barrel') return id;
      if (card.cost > fallbackCost) {
        fallbackCost = card.cost;
        fallback = id;
      }
    }
    return fallback;
  }
}
