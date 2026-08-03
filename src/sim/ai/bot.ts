/**
 * A IA da CPU.
 *
 * A ideia é jogar como gente joga: defender primeiro com a resposta mais barata
 * que resolve, transformar quem sobreviveu em contra-ataque, e só abrir jogo
 * quando o elixir permite. Toda decisão passa por três perguntas — o que está
 * vindo, o que eu tenho na mão, e quanto elixir o outro tem — respondidas por
 * `scanThreats`, `options` e `Scout`.
 *
 * A ordem de prioridade dentro de `decide` é a espinha dorsal: finalizar torre,
 * defender, contra-atacar, atacar, ciclar. Ela não é negociável — o que muda
 * com o tempo de partida é o quanto a IA se permite gastar em cada etapa.
 *
 * A versão anterior está em `src/sim/bot-v1-backup.ts`.
 */

import { ARENA } from '../arena';
import type { CardDef, Entity, Team } from '../types';
import type { Hand, World } from '../world';
import { cardAi, hasRole } from './knowledge';
import { Scout } from './scout';

/** Intervalo entre reavaliações do tabuleiro. */
const TICK = 0.2;
/** Atraso antes de reagir a uma ameaça recém-detectada. */
const REACTION = 0.35;
/** Centro do rio — divide as duas metades. */
const RIVER_MID = (ARENA.riverTop + ARENA.riverBottom) / 2;
/** Uma unidade com esta vida ou menos conta como "tropinha" de enxame. */
const SWARM_HP = 280;
/** A partir daqui a unidade é tratada como tanque. */
const TANK_HP = 1500;

interface Option {
  /** posição na mão */
  index: number;
  /** carta na mão — pode ser 'mirror' */
  cardId: string;
  /** carta que de fato entra em campo */
  playId: string;
  def: CardDef;
  /** custo real, já com o +1 do Espelho */
  cost: number;
}

interface Threat {
  e: Entity;
  /** distância até a nossa linha de torres, em tiles */
  toCrown: number;
  /** quanto elixir essa unidade representa */
  value: number;
}

interface Push {
  list: Threat[];
  lane: 'left' | 'right';
  /** a unidade mais adiantada — a que dita o posicionamento */
  lead: Threat;
  /** soma dos valores em elixir */
  value: number;
  hp: number;
  dps: number;
  anyAir: boolean;
  allAir: boolean;
  swarm: number;
  tank: Entity | null;
  heavy: boolean;
  /** unidade que ataca construções (condição de vitória) */
  winCon: Entity | null;
}

interface Move {
  option: Option;
  x: number;
  y: number;
  /** segundos até a IA poder jogar outra carta */
  hold: number;
}

interface Tempo {
  /** 1x, 2x ou 3x elixir */
  mult: 1 | 2 | 3;
  /** elixir que a IA tenta manter em reserva para defender */
  reserve: number;
}

/**
 * O que o deck sorteado espera da IA. Sem isso ela trataria toda carta de
 * pressão como igual — com isso, o ataque gira em volta de uma carta só, que é
 * o que faz um arquétipo funcionar.
 */
export interface BotPlan {
  winCondition: string | null;
  /** O deck inteiro — define quanto elixir precisa ficar guardado. */
  cards?: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Bot {
  private readonly me: Team;
  private readonly foe: Team;
  private scout: Scout | null = null;

  private tick = 0;
  /** trava depois de jogar uma carta, para não despejar a mão inteira */
  private hold = 1.4;
  /** há quanto tempo existe uma ameaça no nosso campo */
  private threatSince = 0;

  /** Elixir guardado para defender — calculado do próprio deck no 1º tick. */
  private reserve = 3;

  constructor(
    team: Team = 1,
    private plan: BotPlan = { winCondition: null },
  ) {
    this.me = team;
    this.foe = team === 0 ? 1 : 0;
  }

  /**
   * "Não atacar sem elixir para responder a um contra-ataque" só faz sentido
   * medido no próprio deck: um deck de ciclo responde com 2 elixir, um beatdown
   * precisa de 3. Reserva fixa sufoca o primeiro e afrouxa o segundo.
   */
  private baseReserve(world: World): number {
    const deck = this.plan.cards;
    if (!deck || deck.length === 0) return 3;
    const costs = deck
      .filter((id) => world.b.cards[id] && cardAi(id).defense >= 0.6)
      .map((id) => world.b.cards[id].cost);
    if (costs.length === 0) return 3;
    return clamp(Math.min(...costs), 1, 3);
  }

  update(world: World, hand: Hand, dt: number) {
    if (world.phase === 'over') return;
    if (!this.scout) {
      this.scout = new Scout(world.b.global.elixirStart, world.b.global.elixirMax);
      this.reserve = this.baseReserve(world);
    }
    this.scout.observe(world, this.foe, dt);

    const threats = this.scanThreats(world);
    this.threatSince = threats.length ? this.threatSince + dt : 0;

    this.hold -= dt;
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = TICK;
    if (this.hold > 0) return;

    const move = this.decide(world, hand, threats);
    if (!move) return;

    const spell = move.option.def.kind === 'spell';
    const x = clamp(move.x, 1, ARENA.width - 1);
    const y = this.clampY(move.y, spell);
    if (!world.canDeploy(this.me, x, y, move.option.playId)) {
      this.hold = 0.3;
      return;
    }
    if (!world.deploy(this.me, move.option.cardId, x, y)) {
      this.hold = 0.3;
      return;
    }
    hand.play(move.option.index);
    this.hold = move.hold;
  }

  // ------------------------------------------------------------------ escolha

  private decide(world: World, hand: Hand, threats: Threat[]): Move | null {
    const elixir = world.elixir[this.me];
    const options = this.options(world, hand, elixir);
    if (options.length === 0) return null;

    const tempo = this.tempo(world);
    const push = this.mainPush(threats);

    // Torre na mira de um feitiço é oportunidade que não se repete.
    const finish = this.planFinish(world, options);
    if (finish) return finish;

    if (push) {
      if (this.threatSince < REACTION) return null;
      const guard = this.planDefense(world, options, push, elixir, tempo);
      if (guard) return guard;
    }

    const support = this.planPush(world, options, elixir, tempo, push);
    if (support) return support;

    const attack = this.planAttack(world, options, elixir, tempo, push);
    if (attack) return attack;

    return this.planCycle(world, options, elixir, tempo, push);
  }

  private options(world: World, hand: Hand, elixir: number): Option[] {
    const out: Option[] = [];
    hand.hand.forEach((cardId, index) => {
      const card = world.b.cards[cardId];
      if (!card) return;

      if (card.mirror) {
        const last = world.lastPlayed[this.me];
        if (!last || last === 'mirror') return;
        const def = world.b.cards[last];
        if (!def) return;
        const cost = def.cost + 1;
        if (cost > elixir) return;
        out.push({ index, cardId, playId: last, def, cost });
        return;
      }

      if (card.cost > elixir) return;
      out.push({ index, cardId, playId: cardId, def: card, cost: card.cost });
    });
    return out;
  }

  private tempo(world: World): Tempo {
    const base = world.b.global.elixirRateSec;
    const rate = world.elixirRate();
    const mult: 1 | 2 | 3 = rate <= base / 3 + 1e-6 ? 3 : rate < base - 1e-6 ? 2 : 1;
    // Elixir mais rápido repõe a reserva mais rápido — dá para andar com menos.
    return { mult, reserve: Math.max(1, this.reserve - (mult - 1)) };
  }

  // ----------------------------------------------------------------- ameaças

  private scanThreats(world: World): Threat[] {
    const out: Threat[] = [];
    for (const e of world.entities) {
      if (e.team !== this.foe || e.kind === 'tower' || e.hp <= 0) continue;
      // Só conta quem já está atravessando ou passou do rio.
      if (this.dir * (e.y - RIVER_MID) > 1.5) continue;
      const card = world.b.cards[e.cardId];
      const perUnit = card && card.count > 0 ? card.cost / card.count : 0;
      out.push({
        e,
        toCrown: Math.max(0, this.dir * (e.y - this.crownY)),
        value: Math.max(perUnit, e.maxHp / 700) * (e.hp / Math.max(1, e.maxHp)),
      });
    }
    return out.sort((a, b) => a.toCrown - b.toCrown);
  }

  private mainPush(threats: Threat[]): Push | null {
    if (threats.length === 0) return null;
    const half = ARENA.width / 2;
    const left = threats.filter((t) => t.e.x < half);
    const right = threats.filter((t) => t.e.x >= half);
    const pick = this.danger(left) >= this.danger(right) ? left : right;
    if (pick.length === 0) return null;

    const units = pick.map((t) => t.e);
    const tank = units.reduce<Entity | null>(
      (best, u) => (!best || u.maxHp > best.maxHp ? u : best),
      null,
    );
    return {
      list: pick,
      lane: pick[0].e.x < half ? 'left' : 'right',
      lead: pick[0],
      value: pick.reduce((s, t) => s + t.value, 0),
      hp: units.reduce((s, u) => s + u.hp, 0),
      dps: units.reduce((s, u) => s + u.damage / Math.max(0.1, u.attackSpeed), 0),
      anyAir: units.some((u) => u.flying),
      allAir: units.every((u) => u.flying),
      swarm: units.filter((u) => u.maxHp <= SWARM_HP).length,
      tank,
      heavy: !!tank && tank.maxHp >= TANK_HP,
      winCon: units.find((u) => u.targets === 'buildings') ?? null,
    };
  }

  private danger(list: Threat[]): number {
    return list.reduce((s, t) => s + t.value * (1 + Math.max(0, 9 - t.toCrown) / 6), 0);
  }

  // ------------------------------------------------------------------ defesa

  private planDefense(
    world: World,
    options: Option[],
    push: Push,
    elixir: number,
    tempo: Tempo,
  ): Move | null {
    // Ameaça de brincadeira com elixir sobrando: as torres resolvem, e a IA
    // aproveita para punir na rota oposta.
    if (push.value <= 1.2 && push.lead.toCrown > 4 && elixir - this.enemyElixir() >= 3) return null;

    let best: { move: Move; score: number } | null = null;

    for (const o of options) {
      const scored =
        o.def.kind === 'spell'
          ? this.scoreDefenseSpell(world, o, push)
          : this.scoreDefenseUnit(world, o, push, options, elixir, tempo);
      if (!scored || scored.score <= 0) continue;
      if (!best || scored.score > best.score) best = { move: scored.move, score: scored.score };
    }

    return best?.move ?? null;
  }

  private scoreDefenseUnit(
    world: World,
    o: Option,
    push: Push,
    options: Option[],
    elixir: number,
    tempo: Tempo,
  ): { move: Move; score: number } | null {
    const d = o.def;
    const ai = cardAi(o.playId);
    // Condição de vitória não defende, e tropa terrestre não alcança ar.
    if (d.targets === 'buildings') return null;
    const hitsAir = d.targets === 'air+ground';
    if (push.allAir && !hitsAir) return null;

    let s = 2;

    for (const t of push.list) {
      const w = t.value / Math.max(1, push.value);
      if (ai.counters.includes(t.e.cardId)) s += 7 * w;
      if (ai.weakTo.includes(t.e.cardId)) s -= 5 * w;
    }

    if (push.swarm >= 3) {
      if (d.splashRadius > 0) s += 4 + Math.min(3, push.swarm * 0.35);
      else if (d.count === 1) s -= 2.5;
    }
    if (push.heavy) {
      if (hasRole(o.playId, 'tank_killer')) s += 6;
      if (hasRole(o.playId, 'swarm')) s += 3;
    }
    // Construção no centro puxa quem só ataca construção — a resposta clássica.
    if (push.winCon && d.kind === 'building') s += 6;
    if (push.anyAir && hitsAir) s += 3;

    // Consegue mesmo derrubar o que está vindo, e sobrevive ao fazê-lo?
    const dps = (d.damage / Math.max(0.1, d.attackSpeed)) * d.count * (d.splashRadius > 0 ? 1.4 : 1);
    s += 5 * clamp((dps * 4) / Math.max(1, push.hp), 0, 1);
    s += 2 * clamp((d.hp * d.count) / Math.max(1, push.dps * 3), 0, 1.5);

    s -= o.cost * 1.1;
    if (elixir - o.cost < tempo.reserve && this.enemyElixir() >= 4) s -= 2.5;
    if (this.isOnlyAnswerTo(world, options, o, push)) s -= 4;

    const spot = this.placeDefense(world, o, push);
    return { move: { option: o, x: spot.x, y: spot.y, hold: 0.7 + Math.random() * 0.5 }, score: s };
  }

  /**
   * Regra de ouro: a única carta que responde à condição de vitória do
   * adversário não é gasta em outra coisa.
   */
  private isOnlyAnswerTo(world: World, options: Option[], o: Option, push: Push): boolean {
    const win = this.scout?.winCondition(world);
    if (!win || push.winCon) return false;
    if (!cardAi(o.playId).counters.includes(win)) return false;
    return !options.some((other) => other !== o && cardAi(other.playId).counters.includes(win));
  }

  /**
   * Feitiço na defesa só sai com troca positiva: o elixir eliminado tem de
   * pagar o feitiço. Morte vale cheio, dano parcial vale um terço.
   */
  private scoreDefenseSpell(
    world: World,
    o: Option,
    push: Push,
  ): { move: Move; score: number } | null {
    const d = o.def;
    if (o.playId === 'goblin_barrel') return null;

    if (o.playId === 'freeze') {
      // Congelar só para salvar a torre de um ataque que já conectou.
      if (push.lead.toCrown > 2.5 || push.value < 4) return null;
      const aim = this.lead(push.lead.e, d.deployTime + 0.3);
      return {
        move: { option: o, x: aim.x, y: aim.y, hold: 1.2 },
        score: 4,
      };
    }
    if (o.playId === 'rage') return null;

    const aim = this.bestSpellSpot(world, o, push.list.map((t) => t.e));
    if (!aim) return null;
    const score = (aim.worth - o.cost) * 3;
    if (score <= 0) return null;
    return { move: { option: o, x: aim.x, y: aim.y, hold: 0.9 }, score };
  }

  /** Melhor centro para um feitiço, medido em elixir inimigo removido. */
  private bestSpellSpot(
    world: World,
    o: Option,
    targets: Entity[],
  ): { x: number; y: number; worth: number } | null {
    const d = o.def;
    if (d.splashRadius <= 0 || d.damage <= 0 || targets.length === 0) return null;
    const travel = Math.max(0.2, d.deployTime || 0.8);

    let best: { x: number; y: number; worth: number } | null = null;
    for (const centre of targets) {
      const aim = this.lead(centre, travel);
      let worth = 0;
      for (const u of targets) {
        const at = this.lead(u, travel);
        if (dist(aim.x, aim.y, at.x, at.y) - u.radius > d.splashRadius) continue;
        const card = world.b.cards[u.cardId];
        const unitCost = card && card.count > 0 ? card.cost / card.count : 0.5;
        worth += d.damage >= u.hp ? unitCost : unitCost / 3;
      }
      if (!best || worth > best.worth) best = { ...aim, worth };
    }
    return best;
  }

  /** Onde a unidade estará daqui a `sec` segundos, se continuar andando. */
  private lead(e: Entity, sec: number): { x: number; y: number } {
    const step = e.state === 'moving' ? e.speed * sec : 0;
    return { x: e.x, y: e.y - this.dir * step };
  }

  private placeDefense(world: World, o: Option, push: Push): { x: number; y: number } {
    const ai = cardAi(o.playId);
    const lead = push.lead.e;
    const aim = this.lead(lead, o.def.deployTime + 0.35);
    const laneSign = push.lane === 'left' ? -1 : 1;

    switch (ai.placement) {
      case 'building_center': {
        // Centro, à frente das torres: as duas princesas cobrem quem for puxado.
        const depth = push.lead.toCrown < 3.5 ? 2.6 : 3.8;
        return { x: ARENA.width / 2 + laneSign * 1.1, y: this.ahead(this.crownY, depth) };
      }
      case 'surround':
        return { x: aim.x, y: aim.y };
      case 'drop_splash':
        return this.cluster(push);
      case 'air_over':
        // Sobre o tanque que não alcança ar; se alcançar, vale mais atrás.
        if (push.tank && push.tank.targets === 'ground') {
          const over = this.lead(push.tank, o.def.deployTime + 0.35);
          return { x: over.x, y: over.y };
        }
        return this.behind(world, aim, 2.5);
      case 'ranged':
        return this.behind(world, aim, o.def.range * 0.55 + 1);
      default: {
        // Bloqueio: entra entre a ameaça e a torre, puxada um pouco para o centro.
        const x = aim.x + (ARENA.width / 2 - aim.x) * 0.18;
        return { x, y: this.ahead(aim.y, -1.4) };
      }
    }
  }

  /** Posição recuada para tropas de alcance, longe de feitiço em área. */
  private behind(
    world: World,
    aim: { x: number; y: number },
    back: number,
  ): { x: number; y: number } {
    let x = aim.x + (ARENA.width / 2 - aim.x) * 0.25;
    let y = this.ahead(aim.y, -back);
    // Nem colada na própria torre, nem empilhada com outro suporte caro.
    for (const e of world.entities) {
      if (e.team !== this.me || e.hp <= 0) continue;
      const valuable = e.kind === 'tower' || (world.b.cards[e.cardId]?.cost ?? 0) >= 4;
      if (!valuable) continue;
      const d = dist(x, y, e.x, e.y);
      if (d >= 2.4 || d < 1e-3) continue;
      const push = (2.4 - d) / d;
      x += (x - e.x) * push;
      y += (y - e.y) * push;
    }
    return { x, y };
  }

  /** Centro do aglomerado terrestre — onde o Mega Cavaleiro cai. */
  private cluster(push: Push): { x: number; y: number } {
    const ground = push.list.filter((t) => !t.e.flying);
    const list = ground.length ? ground : push.list;
    const x = list.reduce((s, t) => s + t.e.x, 0) / list.length;
    const y = list.reduce((s, t) => s + t.e.y, 0) / list.length;
    return { x, y };
  }

  // ------------------------------------------------------- ataque e pressão

  /**
   * Contra-ataque: quem sobreviveu à defesa vira ponta de lança, e a IA anexa
   * um suporte atrás. Também serve para reforçar um ataque já em andamento.
   */
  private planPush(
    world: World,
    options: Option[],
    elixir: number,
    tempo: Tempo,
    push: Push | null,
  ): Move | null {
    if (push) return null;

    const mine = world.entities.filter(
      (e) =>
        e.team === this.me &&
        e.kind === 'troop' &&
        e.hp > 0 &&
        this.dir * (e.y - this.crownY) > 4 &&
        e.hp / Math.max(1, e.maxHp) > 0.35,
    );
    if (mine.length === 0) return null;

    const leader = mine.reduce((a, b) => (b.maxHp > a.maxHp ? b : a));
    const worth = mine.reduce((s, e) => s + (world.b.cards[e.cardId]?.cost ?? 0), 0);
    if (worth < 3) return null;
    if (elixir - this.enemyElixir() < 0 && tempo.mult === 1) return null;

    const pick = this.bestOffensive(options, elixir, tempo, leader.cardId, false);
    if (!pick) return null;

    const spot = this.behind(world, { x: leader.x, y: leader.y }, 2.2);
    return { option: pick, x: spot.x, y: spot.y, hold: 0.9 + Math.random() * 0.5 };
  }

  private planAttack(
    world: World,
    options: Option[],
    elixir: number,
    tempo: Tempo,
    push: Push | null,
  ): Move | null {
    // Com ameaça em campo só se ataca quando ela é pequena e há folga.
    if (push && !(push.value <= 1.2 && elixir - this.enemyElixir() >= 3)) return null;

    const adv = elixir - this.enemyElixir();
    const green =
      adv >= 2 ||
      this.enemyElixir() <= 3 ||
      elixir >= 9 ||
      (tempo.mult >= 2 && elixir >= 8) ||
      this.winConditionWindow(options);
    if (!green) return null;

    const lane = this.pickLane(world);
    const pick = this.bestOffensive(options, elixir, tempo, null, true);
    if (!pick) return null;

    const ai = cardAi(pick.playId);
    const bridgeX = lane === 'left' ? ARENA.bridgeLeftX : ARENA.bridgeRightX;

    switch (ai.placement) {
      case 'bridge':
        return { option: pick, x: bridgeX, y: this.frontY, hold: 1.1 + Math.random() * 0.5 };
      case 'back': {
        // Tanque atrás da Torre do Rei leva uns 15 s até o rio, e o elixir volta
        // nesse tempo — por isso a margem aqui é mínima. O que o manual proíbe é
        // abrir com ele no elixir 1x sem vantagem clara.
        if (tempo.mult === 1 && adv < 3) return null;
        if (elixir - pick.cost < 1) return null;
        const x = ARENA.width / 2 + (lane === 'left' ? -3.8 : 3.8);
        return { option: pick, x, y: this.backY, hold: 1.4 };
      }
      case 'siege': {
        // Cerco só sai com margem real para defender a resposta.
        if (elixir - pick.cost < Math.max(3, tempo.reserve)) return null;
        const x = bridgeX + (lane === 'left' ? 1.6 : -1.6);
        return { option: pick, x, y: this.frontY, hold: 1.4 };
      }
      case 'spell': {
        const spell = this.planOffensiveSpell(world, pick, lane);
        if (!spell) return null;
        return spell;
      }
      default: {
        // Tropa comum: só entra como abertura barata na ponte, e com folga.
        if (adv < 3 && tempo.mult === 1) return null;
        // Suporte de alcance nunca vai sozinho para a ponte — começa atrás e
        // sobe junto do que vier depois.
        if (ai.placement === 'ranged') {
          const x = ARENA.width / 2 + (lane === 'left' ? -3.8 : 3.8);
          return { option: pick, x, y: this.backY, hold: 1.2 };
        }
        return {
          option: pick,
          x: bridgeX + (Math.random() - 0.5),
          y: this.ahead(this.frontY, -1.5),
          hold: 1.1,
        };
      }
    }
  }

  /**
   * A janela clássica de deck de ciclo: a condição de vitória está na mão e a
   * resposta natural do adversário ainda não voltou ao ciclo dele. Vale mais do
   * que vantagem de elixir — é a hora certa mesmo empatado.
   */
  private winConditionWindow(options: Option[]): boolean {
    const wc = this.plan.winCondition;
    if (!wc || !this.scout) return false;
    if (!options.some((o) => o.playId === wc)) return false;
    const answers = cardAi(wc).weakTo.filter((id) => this.scout!.seen(id));
    // Sem nenhuma resposta revelada ainda não dá para afirmar que há janela.
    if (answers.length === 0) return false;
    return answers.every((id) => !this.scout!.available(id));
  }

  /** Barril de Goblins, Fúria e Congelamento usados de forma ofensiva. */
  private planOffensiveSpell(world: World, o: Option, lane: 'left' | 'right'): Move | null {
    if (o.playId === 'goblin_barrel') {
      const tower = this.enemyTower(world, lane);
      if (!tower) return null;
      // Varia o ponto de queda para não virar previsível.
      return {
        option: o,
        x: tower.x + (Math.random() - 0.5) * 1.6,
        y: tower.y + (Math.random() - 0.5) * 1.2,
        hold: 1.2,
      };
    }

    const attackers = world.entities.filter(
      (e) => e.team === this.me && e.kind === 'troop' && e.hp > 0 && this.dir * (e.y - RIVER_MID) > 0,
    );
    if (attackers.length < 2) return null;
    const x = attackers.reduce((s, e) => s + e.x, 0) / attackers.length;
    const y = attackers.reduce((s, e) => s + e.y, 0) / attackers.length;

    if (o.playId === 'rage') {
      const covered = attackers.filter((e) => dist(x, y, e.x, e.y) <= o.def.splashRadius).length;
      if (covered < 2) return null;
      return { option: o, x, y, hold: 1 };
    }
    if (o.playId === 'freeze') {
      // Congela junto com a torre, e só quando o ataque está prestes a conectar.
      const connecting = attackers.some((e) =>
        world.entities.some(
          (t) => t.kind === 'tower' && t.team === this.foe && t.hp > 0 && dist(e.x, e.y, t.x, t.y) < 4,
        ),
      );
      if (!connecting) return null;
      return { option: o, x, y, hold: 1.2 };
    }
    return null;
  }

  /**
   * Melhor carta para pressionar. `partner` é a carta que já está em campo —
   * sinergia com ela conta pontos.
   */
  private bestOffensive(
    options: Option[],
    elixir: number,
    tempo: Tempo,
    partner: string | null,
    wantWinCondition: boolean,
  ): Option | null {
    let best: { o: Option; score: number } | null = null;

    for (const o of options) {
      const ai = cardAi(o.playId);
      // Tanque no fundo é a exceção: ele mesmo é a reserva enquanto anda.
      if (elixir - o.cost < (ai.placement === 'back' ? 1 : tempo.reserve)) continue;
      if (o.def.kind === 'spell' && ai.placement !== 'spell') continue;

      let s = ai.offense * 5;
      if (wantWinCondition) {
        // A condição de vitória do deck vem antes de qualquer outra pressão.
        if (o.playId === this.plan.winCondition) s += 6;
        else if (hasRole(o.playId, 'win_condition')) s += 3;
      }
      if (partner && ai.synergies.includes(partner)) s += 3;
      if (partner && cardAi(partner).synergies.includes(o.playId)) s += 2;

      // Se a resposta natural do adversário está na mão dele, espera.
      for (const counter of ai.weakTo) {
        if (this.scout?.seen(counter) && this.scout.available(counter)) s -= 2.5;
      }
      s -= o.cost * 0.5;
      if (!best || s > best.score) best = { o, score: s };
    }

    return best && best.score > 0 ? best.o : null;
  }

  /** Rota mais barata de atacar: torre mais fraca, ou a que ficou sem defensor. */
  private pickLane(world: World): 'left' | 'right' {
    const towers = world.entities.filter(
      (e) => e.kind === 'tower' && e.team === this.foe && e.towerKind === 'princess' && e.hp > 0,
    );
    if (towers.length === 1) return towers[0].side === 'left' ? 'left' : 'right';
    if (towers.length === 0) return Math.random() < 0.5 ? 'left' : 'right';

    const score = (side: 'left' | 'right') => {
      const tower = towers.find((t) => t.side === side);
      const hp = tower ? tower.hp / tower.maxHp : 0;
      const defenders = world.entities.filter(
        (e) =>
          e.team === this.foe &&
          e.kind !== 'tower' &&
          e.hp > 0 &&
          (e.x < ARENA.width / 2) === (side === 'left'),
      ).length;
      return hp + defenders * 0.25;
    };
    return score('left') <= score('right') ? 'left' : 'right';
  }

  private enemyTower(world: World, lane: 'left' | 'right'): Entity | undefined {
    return world.entities.find(
      (e) =>
        e.kind === 'tower' &&
        e.team === this.foe &&
        e.hp > 0 &&
        e.towerKind === 'princess' &&
        e.side === lane,
    );
  }

  // ------------------------------------------------------------- finalização

  /** Feitiço que derruba uma torre agora. Vale mais do que qualquer outro plano. */
  private planFinish(world: World, options: Option[]): Move | null {
    for (const o of options) {
      if (o.def.kind !== 'spell' || o.def.damage <= 0 || o.def.towerDamageFactor <= 0) continue;
      const dmg = o.def.damage * o.def.towerDamageFactor;
      for (const t of world.entities) {
        if (t.kind !== 'tower' || t.team !== this.foe || t.hp <= 0) continue;
        if (t.hp > dmg) continue;
        return { option: o, x: t.x, y: t.y, hold: 1 };
      }
    }
    return null;
  }

  // -------------------------------------------------------------- ciclagem

  /** Elixir cheio é elixir jogado fora — cicla a carta mais barata em segurança. */
  private planCycle(
    world: World,
    options: Option[],
    elixir: number,
    tempo: Tempo,
    push: Push | null,
  ): Move | null {
    const cap = tempo.mult >= 3 ? 8.6 : 9.2;
    if (elixir < cap || push) return null;

    // A condição de vitória nunca é queimada só para não estourar o elixir.
    const safe = options
      .filter(
        (o) =>
          o.def.kind !== 'spell' &&
          !hasRole(o.playId, 'win_condition') &&
          o.playId !== this.plan.winCondition,
      )
      .sort((a, b) => a.cost - b.cost);
    const pick = safe[0];
    if (!pick) return null;

    if (pick.def.kind === 'building') {
      return {
        option: pick,
        x: ARENA.width / 2,
        y: this.ahead(this.crownY, 3.4),
        hold: 1.2,
      };
    }
    const lane = this.pickLane(world);
    return {
      option: pick,
      x: ARENA.width / 2 + (lane === 'left' ? -3.8 : 3.8),
      y: this.backY,
      hold: 1,
    };
  }

  // -------------------------------------------------------------- geometria

  /** +1 quando o inimigo está em y maior — o sentido do nosso avanço. */
  private get dir(): number {
    return this.me === 1 ? 1 : -1;
  }

  /** Linha das nossas torres princesa. */
  private get crownY(): number {
    return this.me === 1 ? 6.8 : 25.2;
  }

  /** Limite do nosso campo, junto ao rio. */
  private get frontY(): number {
    return this.me === 1 ? ARENA.riverTop - 0.5 : ARENA.riverBottom + 0.5;
  }

  /** Atrás da Torre do Rei — onde tanque pesado começa. */
  private get backY(): number {
    return this.me === 1 ? 3.4 : ARENA.height - 3.4;
  }

  /** Desloca `n` tiles no sentido do inimigo (negativo recua para o nosso lado). */
  private ahead(y: number, n: number): number {
    return y + this.dir * n;
  }

  private clampY(y: number, spell: boolean): number {
    if (spell) return clamp(y, 0.8, ARENA.height - 0.8);
    return this.me === 1
      ? clamp(y, 1, ARENA.riverTop - 0.5)
      : clamp(y, ARENA.riverBottom + 0.5, ARENA.height - 1);
  }

  private enemyElixir(): number {
    return this.scout?.elixir ?? 5;
  }
}
