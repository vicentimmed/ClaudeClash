/**
 * O que a IA "sabe" sobre cada carta.
 *
 * Números de dano, vida e alcance vêm sempre do balanceamento (`Balance`) —
 * este arquivo guarda só o conhecimento tático que não dá para deduzir das
 * estatísticas: papel na partida, o que cada carta responde bem, o que a
 * derruba, e onde ela deve ser posicionada.
 *
 * Os ids são os do jogo (`src/balance/cards.json`), não os do manual.
 */

export type AiRole =
  | 'win_condition'
  | 'tank'
  | 'mini_tank'
  | 'tank_killer'
  | 'splash'
  | 'anti_air'
  | 'swarm'
  | 'cycle'
  | 'ranged_support'
  | 'building'
  | 'spawner'
  | 'distraction'
  | 'spell_small'
  | 'spell_big'
  | 'finisher'
  | 'buff';

/** Como a carta deve ser posicionada quando a IA decide jogá-la. */
export type Placement =
  /** Construção defensiva: centro da própria metade, puxando a tropa inimiga. */
  | 'building_center'
  /** Corpo a corpo: entra na frente da ameaça para bloquear. */
  | 'block'
  /** Enxame: cai em cima do alvo para cercá-lo. */
  | 'surround'
  /** Mega Cavaleiro: cai sobre o aglomerado para aproveitar o dano de queda. */
  | 'drop_splash'
  /** Suporte de alcance: atrás, longe do combate. */
  | 'ranged'
  /** Aéreo sobre tropa terrestre que não alcança ar. */
  | 'air_over'
  /** Condição de vitória rápida: ponte. */
  | 'bridge'
  /** Tanque pesado: atrás da Torre do Rei, para juntar suporte. */
  | 'back'
  /** Cerco: encostado no rio, no limite do próprio campo. */
  | 'siege'
  /** Feitiço: mira calculada à parte. */
  | 'spell';

export interface CardAi {
  roles: AiRole[];
  /** Cartas inimigas que esta carta responde bem. */
  counters: string[];
  /** Cartas inimigas que anulam esta carta — evitar usá-la contra elas. */
  weakTo: string[];
  /** Cartas aliadas que combinam com esta em um ataque. */
  synergies: string[];
  placement: Placement;
  /** Valor defensivo genérico (0..1), usado quando nada específico casa. */
  defense: number;
  /** Valor ofensivo genérico (0..1). */
  offense: number;
}

const CARD: Record<string, CardAi> = {
  knight: {
    roles: ['mini_tank'],
    counters: ['archers', 'musketeer', 'wizard', 'witch', 'goblins', 'skeletons', 'hogrider', 'balloon'],
    weakTo: ['pekka', 'minipekka', 'prince', 'skeleton_army', 'mega_knight'],
    synergies: ['archers', 'musketeer', 'wizard', 'witch', 'hogrider'],
    placement: 'block',
    defense: 0.7,
    offense: 0.45,
  },
  archers: {
    roles: ['ranged_support', 'anti_air'],
    counters: ['balloon', 'minions', 'babydragon', 'skeletons', 'goblins', 'witch', 'hogrider'],
    weakTo: ['arrows', 'fireball', 'wizard', 'babydragon', 'valkyrie', 'mega_knight'],
    synergies: ['knight', 'giant', 'pekka', 'tesla', 'cannon'],
    placement: 'ranged',
    defense: 0.6,
    offense: 0.4,
  },
  goblins: {
    roles: ['cycle', 'swarm', 'distraction'],
    counters: ['minipekka', 'prince', 'knight', 'hogrider', 'giant', 'golem', 'pekka', 'musketeer'],
    weakTo: ['zap', 'arrows', 'valkyrie', 'wizard', 'babydragon', 'witch', 'mega_knight'],
    synergies: ['hogrider', 'tesla', 'tombstone', 'skeletons'],
    placement: 'surround',
    defense: 0.6,
    offense: 0.3,
  },
  skeletons: {
    roles: ['cycle', 'swarm', 'distraction'],
    counters: ['prince', 'minipekka', 'pekka', 'hogrider', 'knight', 'mega_knight'],
    weakTo: ['zap', 'arrows', 'wizard', 'valkyrie', 'babydragon', 'witch', 'mega_knight'],
    synergies: ['inferno', 'tesla', 'hogrider', 'xbow'],
    placement: 'surround',
    defense: 0.45,
    offense: 0.15,
  },
  skeleton_army: {
    roles: ['swarm'],
    counters: ['prince', 'minipekka', 'giant', 'golem', 'pekka', 'hogrider', 'knight', 'balloon'],
    weakTo: ['arrows', 'zap', 'fireball', 'valkyrie', 'wizard', 'babydragon', 'witch', 'mega_knight'],
    synergies: ['inferno', 'hogrider', 'balloon', 'mirror'],
    placement: 'surround',
    defense: 0.85,
    offense: 0.2,
  },
  minions: {
    roles: ['swarm', 'anti_air'],
    counters: ['giant', 'golem', 'pekka', 'prince', 'minipekka', 'knight', 'hogrider', 'valkyrie', 'mega_knight'],
    weakTo: ['arrows', 'zap', 'wizard', 'babydragon', 'musketeer', 'archers', 'witch'],
    synergies: ['balloon', 'giant', 'prince', 'golem'],
    placement: 'air_over',
    defense: 0.65,
    offense: 0.4,
  },
  musketeer: {
    roles: ['ranged_support', 'anti_air'],
    counters: ['balloon', 'minions', 'babydragon', 'giant', 'hogrider', 'witch', 'golem'],
    weakTo: ['fireball', 'pekka', 'prince', 'mega_knight', 'valkyrie'],
    synergies: ['giant', 'knight', 'valkyrie', 'inferno', 'tombstone'],
    placement: 'ranged',
    defense: 0.75,
    offense: 0.45,
  },
  minipekka: {
    roles: ['tank_killer'],
    counters: ['giant', 'golem', 'pekka', 'mega_knight', 'knight', 'valkyrie', 'prince', 'hogrider'],
    weakTo: ['skeleton_army', 'goblins', 'minions', 'skeletons', 'tombstone', 'wizard'],
    synergies: ['skeletons', 'inferno', 'rage', 'freeze'],
    placement: 'block',
    defense: 0.8,
    offense: 0.5,
  },
  valkyrie: {
    roles: ['splash', 'mini_tank'],
    counters: ['goblins', 'skeletons', 'skeleton_army', 'archers', 'musketeer', 'wizard', 'witch', 'goblin_barrel'],
    weakTo: ['minions', 'balloon', 'babydragon', 'pekka', 'musketeer'],
    synergies: ['musketeer', 'wizard', 'hogrider', 'witch'],
    placement: 'block',
    defense: 0.8,
    offense: 0.5,
  },
  babydragon: {
    roles: ['splash', 'anti_air'],
    counters: ['skeleton_army', 'goblins', 'skeletons', 'minions', 'archers', 'witch', 'goblin_barrel'],
    weakTo: ['musketeer', 'inferno', 'tesla', 'minions', 'archers'],
    synergies: ['giant', 'golem', 'balloon', 'tombstone'],
    placement: 'ranged',
    defense: 0.7,
    offense: 0.55,
  },
  hogrider: {
    roles: ['win_condition'],
    counters: [],
    weakTo: ['cannon', 'tesla', 'tombstone', 'inferno', 'skeleton_army', 'goblins', 'minipekka', 'valkyrie', 'xbow'],
    synergies: ['skeletons', 'goblins', 'zap', 'rage', 'freeze', 'fireball'],
    placement: 'bridge',
    defense: 0.1,
    offense: 0.95,
  },
  prince: {
    roles: ['tank_killer', 'mini_tank'],
    counters: ['musketeer', 'wizard', 'witch', 'archers', 'knight', 'valkyrie', 'minipekka', 'giant'],
    weakTo: ['skeletons', 'goblins', 'skeleton_army', 'tombstone', 'cannon', 'minions', 'inferno'],
    synergies: ['rage', 'zap', 'valkyrie', 'balloon'],
    placement: 'block',
    defense: 0.7,
    offense: 0.75,
  },
  giant: {
    roles: ['win_condition', 'tank'],
    counters: [],
    weakTo: ['inferno', 'minipekka', 'pekka', 'skeleton_army', 'tesla', 'minions'],
    synergies: ['musketeer', 'wizard', 'witch', 'valkyrie', 'fireball'],
    placement: 'back',
    defense: 0.15,
    offense: 0.85,
  },
  wizard: {
    roles: ['splash', 'ranged_support', 'anti_air'],
    counters: ['skeleton_army', 'goblins', 'skeletons', 'minions', 'archers', 'witch', 'balloon', 'goblin_barrel'],
    weakTo: ['fireball', 'pekka', 'prince', 'mega_knight', 'minipekka'],
    synergies: ['giant', 'valkyrie', 'golem', 'fireball'],
    placement: 'ranged',
    defense: 0.8,
    offense: 0.5,
  },
  witch: {
    roles: ['splash', 'spawner', 'anti_air'],
    counters: ['skeleton_army', 'goblins', 'skeletons', 'minions', 'archers'],
    weakTo: ['fireball', 'wizard', 'babydragon', 'pekka', 'prince'],
    synergies: ['giant', 'golem', 'knight', 'valkyrie'],
    placement: 'ranged',
    defense: 0.7,
    offense: 0.55,
  },
  cannon: {
    roles: ['building'],
    counters: ['hogrider', 'giant', 'golem', 'prince', 'minipekka', 'pekka', 'mega_knight', 'knight'],
    weakTo: ['balloon', 'babydragon', 'minions', 'fireball'],
    synergies: ['archers', 'musketeer', 'skeletons', 'hogrider'],
    placement: 'building_center',
    defense: 0.85,
    offense: 0.05,
  },
  tesla: {
    roles: ['building', 'anti_air'],
    counters: ['hogrider', 'balloon', 'giant', 'golem', 'minions', 'babydragon', 'prince', 'minipekka', 'musketeer'],
    weakTo: ['fireball', 'golem', 'pekka'],
    synergies: ['skeletons', 'archers', 'musketeer', 'hogrider'],
    placement: 'building_center',
    defense: 0.9,
    offense: 0.05,
  },
  tombstone: {
    roles: ['building', 'spawner', 'distraction'],
    counters: ['hogrider', 'giant', 'golem', 'prince', 'minipekka', 'pekka', 'balloon'],
    weakTo: ['fireball', 'arrows', 'wizard', 'babydragon', 'valkyrie'],
    synergies: ['musketeer', 'inferno', 'valkyrie', 'archers'],
    placement: 'building_center',
    defense: 0.7,
    offense: 0.05,
  },
  inferno: {
    roles: ['building', 'tank_killer', 'anti_air'],
    counters: ['golem', 'giant', 'pekka', 'mega_knight', 'balloon', 'prince', 'minipekka'],
    weakTo: ['zap', 'skeleton_army', 'goblins', 'fireball'],
    synergies: ['skeletons', 'musketeer', 'knight', 'zap'],
    placement: 'building_center',
    defense: 0.95,
    offense: 0.05,
  },
  xbow: {
    roles: ['win_condition', 'building'],
    counters: [],
    weakTo: ['giant', 'golem', 'pekka', 'fireball', 'mega_knight'],
    synergies: ['tesla', 'knight', 'skeletons', 'archers', 'fireball'],
    placement: 'siege',
    defense: 0.3,
    offense: 0.8,
  },
  fireball: {
    roles: ['spell_big', 'finisher'],
    counters: ['musketeer', 'wizard', 'witch', 'archers', 'minions', 'goblins', 'skeleton_army', 'xbow'],
    weakTo: [],
    synergies: ['giant', 'hogrider', 'balloon', 'golem', 'xbow'],
    placement: 'spell',
    defense: 0.6,
    offense: 0.6,
  },
  arrows: {
    roles: ['spell_small'],
    counters: ['skeleton_army', 'goblins', 'skeletons', 'minions', 'archers', 'goblin_barrel', 'witch'],
    weakTo: [],
    synergies: ['pekka', 'golem', 'hogrider', 'balloon'],
    placement: 'spell',
    defense: 0.55,
    offense: 0.3,
  },
  zap: {
    roles: ['spell_small', 'cycle'],
    counters: ['skeletons', 'skeleton_army', 'goblins', 'minions', 'inferno'],
    weakTo: [],
    synergies: ['hogrider', 'prince', 'pekka', 'balloon', 'inferno'],
    placement: 'spell',
    defense: 0.45,
    offense: 0.25,
  },
  goblin_barrel: {
    roles: ['win_condition'],
    counters: [],
    weakTo: ['arrows', 'zap', 'valkyrie', 'wizard', 'babydragon', 'witch', 'mega_knight'],
    synergies: ['hogrider', 'prince', 'freeze', 'rage', 'mirror'],
    placement: 'spell',
    defense: 0.05,
    offense: 0.7,
  },
  balloon: {
    roles: ['win_condition'],
    counters: [],
    weakTo: ['tesla', 'musketeer', 'inferno', 'archers', 'minions', 'wizard', 'witch', 'babydragon'],
    synergies: ['freeze', 'rage', 'babydragon', 'knight', 'tombstone'],
    placement: 'bridge',
    defense: 0.05,
    offense: 1,
  },
  pekka: {
    roles: ['tank_killer', 'tank'],
    counters: ['golem', 'giant', 'mega_knight', 'prince', 'knight', 'valkyrie', 'minipekka', 'hogrider'],
    weakTo: ['skeletons', 'skeleton_army', 'goblins', 'tombstone', 'minions', 'witch'],
    synergies: ['archers', 'musketeer', 'babydragon', 'zap', 'freeze'],
    placement: 'block',
    defense: 0.9,
    offense: 0.6,
  },
  golem: {
    roles: ['win_condition', 'tank'],
    counters: [],
    weakTo: ['inferno', 'minipekka', 'pekka', 'skeleton_army'],
    synergies: ['witch', 'babydragon', 'wizard', 'archers', 'fireball'],
    placement: 'back',
    defense: 0.1,
    offense: 0.9,
  },
  mega_knight: {
    roles: ['splash', 'tank', 'mini_tank'],
    counters: ['skeleton_army', 'goblins', 'skeletons', 'archers', 'musketeer', 'wizard', 'witch', 'knight', 'valkyrie', 'hogrider'],
    weakTo: ['minipekka', 'pekka', 'inferno', 'minions'],
    synergies: ['musketeer', 'archers', 'balloon', 'babydragon'],
    placement: 'drop_splash',
    defense: 0.85,
    offense: 0.7,
  },
  rage: {
    roles: ['buff'],
    counters: [],
    weakTo: [],
    synergies: ['golem', 'balloon', 'prince', 'minipekka', 'mega_knight'],
    placement: 'spell',
    defense: 0,
    offense: 0.4,
  },
  freeze: {
    roles: ['finisher'],
    counters: [],
    weakTo: [],
    synergies: ['balloon', 'hogrider', 'minipekka', 'pekka', 'goblin_barrel'],
    placement: 'spell',
    defense: 0.4,
    offense: 0.5,
  },
  mirror: {
    roles: ['cycle'],
    counters: [],
    weakTo: [],
    synergies: [],
    placement: 'spell',
    defense: 0.2,
    offense: 0.3,
  },
};

const FALLBACK: CardAi = {
  roles: [],
  counters: [],
  weakTo: [],
  synergies: [],
  placement: 'block',
  defense: 0.4,
  offense: 0.4,
};

/** Nunca devolve undefined — cartas novas caem num perfil neutro. */
export function cardAi(cardId: string): CardAi {
  return CARD[cardId] ?? FALLBACK;
}

export function hasRole(cardId: string, role: AiRole): boolean {
  return cardAi(cardId).roles.includes(role);
}
