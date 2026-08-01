import { ARENA } from './arena';
import type { CardDef, Entity } from './types';
import type { Hand, World } from './world';

interface Option {
  cardId: string;
  index: number;
  def: CardDef;
}

/**
 * Deliberately simple opponent: it answers whatever is walking at it, throws a
 * spell when your troops bunch up, and otherwise pushes a lane. Enough to make
 * the prototype feel like a real match.
 */
export class Bot {
  private cd = 3;

  update(world: World, hand: Hand, dt: number) {
    if (world.phase === 'over') return;
    this.cd -= dt;
    if (this.cd > 0) return;

    const elixir = world.elixir[1];
    const playable: Option[] = hand.hand
      .map((cardId, index) => ({ cardId, index, def: world.b.cards[cardId] }))
      .filter((c) => c.def && c.def.cost <= elixir);
    if (playable.length === 0) return;

    const threats = world.entities.filter(
      (e) => e.team === 0 && e.kind !== 'tower' && e.hp > 0 && e.y < ARENA.riverBottom + 2,
    );

    const move = this.pickSpell(playable, threats) ?? this.pickTroop(playable, threats);
    if (!move) {
      this.cd = 0.5;
      return;
    }

    const x = Math.min(Math.max(move.x, 1.2), ARENA.width - 1.2);
    if (world.deploy(1, move.option.cardId, x, move.y)) {
      hand.play(move.option.index);
      this.cd = 1.6 + Math.random() * 3.4;
    } else {
      this.cd = 0.4;
    }
  }

  /** Throw a spell only when it would hit a worthwhile clump. */
  private pickSpell(playable: Option[], threats: Entity[]) {
    const spells = playable.filter((c) => c.def.kind === 'spell');
    if (spells.length === 0 || threats.length === 0) return null;
    const option = spells[Math.floor(Math.random() * spells.length)];

    let best: { x: number; y: number; worth: number } | null = null;
    for (const centre of threats) {
      let worth = 0;
      for (const other of threats) {
        const d = Math.hypot(centre.x - other.x, centre.y - other.y);
        if (d <= option.def.splashRadius) worth += other.maxHp <= option.def.damage ? 2 : 1;
      }
      if (!best || worth > best.worth) best = { x: centre.x, y: centre.y, worth };
    }
    if (!best || best.worth < 2) return null;
    return { option, x: best.x, y: best.y };
  }

  private pickTroop(playable: Option[], threats: Entity[]) {
    const troops = playable.filter((c) => c.def.kind !== 'spell');
    if (troops.length === 0) return null;

    if (threats.length > 0) {
      // defend: answer the deepest threat with the beefiest affordable card
      const threat = threats.reduce((a, b) => (a.y < b.y ? a : b));
      const option = troops.reduce((a, b) =>
        b.def.hp * b.def.count > a.def.hp * a.def.count ? b : a,
      );
      return {
        option,
        x: threat.x + (Math.random() - 0.5),
        y: Math.max(threat.y - 2.5, 7.5),
      };
    }

    // attack: drop behind the bridge on a random lane
    const option = troops[Math.floor(Math.random() * troops.length)];
    const lane = Math.random() < 0.5 ? ARENA.bridgeLeftX : ARENA.bridgeRightX;
    return {
      option,
      x: lane + (Math.random() - 0.5) * 1.6,
      y: ARENA.riverTop - 1.2 - Math.random() * 3,
    };
  }
}
