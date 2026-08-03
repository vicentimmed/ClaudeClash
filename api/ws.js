// server/ws.ts
import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

// src/net/protocol.ts
function encode(msg) {
  return JSON.stringify(msg);
}
function decode(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.t !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

// src/balance/cards.json
var cards_default = {
  version: 2,
  global: {
    matchDurationSec: 180,
    overtimeSec: 120,
    elixirStart: 5,
    elixirMax: 10,
    elixirRateSec: 2.8,
    doubleElixirLastSec: 60,
    tripleElixirLastSec: 60,
    tickRate: 20
  },
  towers: {
    princess: {
      hp: 2534,
      damage: 109,
      attackSpeed: 0.8,
      range: 7.5,
      projectileSpeed: 13,
      radius: 1.1
    },
    king: {
      hp: 4008,
      damage: 109,
      attackSpeed: 1,
      range: 7,
      projectileSpeed: 13,
      radius: 1.4
    }
  },
  deckSize: 8,
  deck: ["giant", "valkyrie", "wizard", "goblins", "skeletons", "musketeer", "fireball", "knight"],
  cards: {
    knight: {
      name: "Cavaleiro",
      kind: "troop",
      cost: 3,
      count: 1,
      hp: 1766,
      damage: 202,
      attackSpeed: 1.2,
      range: 1.2,
      speed: 1,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.38,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "knight", body: "#d4af37", accent: "#9aa8bc", scale: 1.3 }
    },
    archers: {
      name: "Arqueiras",
      kind: "troop",
      cost: 3,
      count: 2,
      hp: 304,
      damage: 118,
      attackSpeed: 1.2,
      range: 5,
      speed: 1,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "air+ground",
      flying: false,
      deployTime: 1,
      radius: 0.28,
      projectileSpeed: 11,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "archer", body: "#4e9d6b", accent: "#c9a227", scale: 1.05 }
    },
    goblins: {
      name: "Goblins",
      kind: "troop",
      cost: 2,
      count: 3,
      hp: 202,
      damage: 120,
      attackSpeed: 1.1,
      range: 0.5,
      speed: 1.67,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.3,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.4,
      visual: { shape: "goblins", body: "#78d048", accent: "#6b4226", scale: 1 }
    },
    skeletons: {
      name: "Esqueletos",
      kind: "troop",
      cost: 1,
      count: 3,
      hp: 81,
      damage: 81,
      attackSpeed: 1.1,
      range: 0.5,
      speed: 1.33,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.26,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      visual: { shape: "skeleton", body: "#efe7d2", accent: "#8e836b", scale: 0.9 }
    },
    skeleton_army: {
      name: "Ex\xE9rcito de Esqueletos",
      kind: "troop",
      cost: 3,
      count: 15,
      hp: 81,
      damage: 81,
      attackSpeed: 1.1,
      range: 0.5,
      speed: 1.33,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.26,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      visual: { shape: "skeleton_army", body: "#efe7d2", accent: "#8e836b", scale: 0.9 }
    },
    minions: {
      name: "Servos",
      kind: "troop",
      cost: 3,
      count: 3,
      hp: 190,
      damage: 84,
      attackSpeed: 1,
      range: 1.6,
      speed: 1.33,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "air+ground",
      flying: true,
      deployTime: 1,
      radius: 0.28,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "minions", body: "#5a7fd6", accent: "#2b3f7a", scale: 0.9 }
    },
    musketeer: {
      name: "Mosqueteira",
      kind: "troop",
      cost: 4,
      count: 1,
      hp: 720,
      damage: 218,
      attackSpeed: 1.1,
      range: 6,
      speed: 1,
      sightRange: 6.5,
      splashRadius: 0,
      targets: "air+ground",
      flying: false,
      deployTime: 1,
      radius: 0.34,
      projectileSpeed: 13,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "musketeer", body: "#3f6fc4", accent: "#d8b24a", scale: 1.2 }
    },
    minipekka: {
      name: "Mini P.E.K.K.A",
      kind: "troop",
      cost: 4,
      count: 1,
      hp: 1361,
      damage: 720,
      attackSpeed: 1.8,
      range: 1.2,
      speed: 1.33,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.4,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "minipekka", body: "#3b3f52", accent: "#57e0d8", scale: 1.15 }
    },
    valkyrie: {
      name: "Valqu\xEDria",
      kind: "troop",
      cost: 4,
      count: 1,
      hp: 1908,
      damage: 243,
      attackSpeed: 1.5,
      range: 1.2,
      speed: 1,
      sightRange: 5.5,
      splashRadius: 2,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.42,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.1,
      visual: { shape: "valkyrie", body: "#c8543c", accent: "#e8913a", scale: 1.3 }
    },
    babydragon: {
      name: "Drag\xE3o Beb\xEA",
      kind: "troop",
      cost: 4,
      count: 1,
      hp: 1152,
      damage: 133,
      attackSpeed: 1.6,
      range: 3.5,
      speed: 1,
      sightRange: 5.5,
      splashRadius: 1.4,
      targets: "air+ground",
      flying: true,
      deployTime: 1,
      radius: 0.48,
      projectileSpeed: 9,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "babydragon", body: "#57b86b", accent: "#ff7a2f", scale: 1.45 }
    },
    hogrider: {
      name: "Corredor",
      kind: "troop",
      cost: 4,
      count: 1,
      hp: 1697,
      damage: 317,
      attackSpeed: 1.6,
      range: 0.8,
      speed: 1.67,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "buildings",
      flying: false,
      deployTime: 1,
      radius: 0.42,
      projectileSpeed: 0,
      jumpsRiver: true,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.6,
      visual: { shape: "hogrider", body: "#c98a4b", accent: "#8a5a2b", scale: 1.35 }
    },
    prince: {
      name: "Pr\xEDncipe",
      kind: "troop",
      cost: 5,
      count: 1,
      hp: 1920,
      damage: 392,
      attackSpeed: 1.4,
      range: 1.6,
      speed: 1,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.44,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      chargeDistTiles: 2.5,
      chargeSpeed: 2,
      chargeDamageMul: 2,
      chargeJumpsRiver: true,
      visual: { shape: "prince", body: "#d4af37", accent: "#7a4a28", scale: 1.55 }
    },
    giant: {
      name: "Gigante",
      kind: "troop",
      cost: 5,
      count: 1,
      hp: 3275,
      damage: 211,
      attackSpeed: 1.5,
      range: 1.2,
      speed: 0.67,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "buildings",
      flying: false,
      deployTime: 1,
      radius: 0.78,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "giant", body: "#d6a86a", accent: "#7b4a24", scale: 2.5 }
    },
    wizard: {
      name: "Mago",
      kind: "troop",
      cost: 5,
      count: 1,
      hp: 720,
      damage: 281,
      attackSpeed: 1.4,
      range: 5.5,
      speed: 1,
      sightRange: 6.5,
      splashRadius: 1.5,
      targets: "air+ground",
      flying: false,
      deployTime: 1,
      radius: 0.36,
      projectileSpeed: 9,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "wizard", body: "#3f6fc4", accent: "#ff7a2f", scale: 1.2 }
    },
    witch: {
      name: "Bruxa",
      kind: "troop",
      cost: 5,
      count: 1,
      hp: 838,
      damage: 134,
      attackSpeed: 1.1,
      range: 5.5,
      speed: 1,
      sightRange: 6,
      splashRadius: 1.5,
      targets: "air+ground",
      flying: false,
      deployTime: 1,
      radius: 0.36,
      projectileSpeed: 10,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.7,
      spawnCardId: "skeletons",
      spawnCount: 4,
      spawnIntervalSec: 7,
      visual: { shape: "witch", body: "#5c2d8a", accent: "#d4af37", scale: 1.25 }
    },
    cannon: {
      name: "Canh\xE3o",
      kind: "building",
      cost: 3,
      count: 1,
      hp: 742,
      damage: 127,
      attackSpeed: 0.9,
      range: 5.5,
      speed: 0,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.5,
      projectileSpeed: 12,
      jumpsRiver: false,
      lifetimeSec: 30,
      stunSec: 0,
      towerDamageFactor: 1,
      visual: { shape: "cannon", body: "#7e8794", accent: "#8a5f3d", scale: 1.15 }
    },
    tesla: {
      name: "Tesla",
      kind: "building",
      cost: 4,
      count: 1,
      hp: 1152,
      damage: 230,
      attackSpeed: 1.1,
      range: 5,
      speed: 0,
      sightRange: 5,
      splashRadius: 0,
      targets: "air+ground",
      flying: false,
      deployTime: 1,
      radius: 0.5,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 30,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      hidesUnderground: true,
      visual: { shape: "tesla", body: "#8a949e", accent: "#6b5340", scale: 1.05 }
    },
    tombstone: {
      name: "L\xE1pide",
      kind: "building",
      cost: 3,
      count: 1,
      hp: 530,
      damage: 0,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.45,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 30,
      stunSec: 0,
      towerDamageFactor: 1,
      spawnCardId: "skeletons",
      spawnCount: 2,
      spawnIntervalSec: 4,
      spawnStaggerSec: 0.5,
      deathSpawnCardId: "skeletons",
      deathSpawnCount: 4,
      visual: { shape: "tombstone", body: "#6b6b72", accent: "#3a3a40", scale: 1.1 }
    },
    fireball: {
      name: "Bola de Fogo",
      kind: "spell",
      cost: 4,
      count: 1,
      hp: 0,
      damage: 572,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 2.5,
      targets: "air+ground",
      flying: false,
      deployTime: 0.9,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 0.35,
      visual: { shape: "fireball", body: "#e2622a", accent: "#ffd45e", scale: 1.2 }
    },
    arrows: {
      name: "Flechas",
      kind: "spell",
      cost: 3,
      count: 1,
      hp: 0,
      damage: 243,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 4,
      targets: "air+ground",
      flying: false,
      deployTime: 0.7,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 0.35,
      visual: { shape: "arrows", body: "#9a7448", accent: "#e8e2d0", scale: 1.2 }
    },
    zap: {
      name: "Zap",
      kind: "spell",
      cost: 2,
      count: 1,
      hp: 0,
      damage: 159,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 2.5,
      targets: "air+ground",
      flying: false,
      deployTime: 0.5,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0.5,
      towerDamageFactor: 0.35,
      visual: { shape: "zap", body: "#7b4fd6", accent: "#8ff0ff", scale: 1.2 }
    },
    goblin_barrel: {
      name: "Barril de Goblins",
      kind: "spell",
      cost: 3,
      count: 1,
      hp: 0,
      damage: 0,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 1.5,
      targets: "ground",
      flying: false,
      deployTime: 0.6,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 0,
      spellFromKing: true,
      spellSpawnCardId: "goblins",
      spellSpawnCount: 3,
      visual: { shape: "goblin_barrel", body: "#a06838", accent: "#78d048", scale: 1.18 }
    },
    balloon: {
      name: "Bal\xE3o",
      kind: "troop",
      cost: 5,
      count: 1,
      hp: 1679,
      damage: 960,
      attackSpeed: 3,
      range: 0.8,
      speed: 1,
      sightRange: 8,
      splashRadius: 2,
      targets: "buildings",
      flying: true,
      deployTime: 1,
      radius: 0.62,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      deathSplashDamage: 192,
      deathSplashRadius: 2,
      visual: { shape: "balloon", body: "#c94b4b", accent: "#5a3a28", scale: 2.15 }
    },
    rage: {
      name: "F\xFAria",
      kind: "spell",
      cost: 2,
      count: 1,
      hp: 0,
      damage: 192,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 3,
      targets: "air+ground",
      flying: false,
      deployTime: 0.5,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 0.3,
      buffDurationSec: 5.5,
      buffSpeedMul: 1.35,
      buffAttackMul: 1.35,
      visual: { shape: "rage", body: "#e91e8c", accent: "#ff6ec7", scale: 1.2 }
    },
    xbow: {
      name: "X-Besta",
      kind: "building",
      cost: 6,
      count: 1,
      hp: 1955,
      damage: 13,
      attackSpeed: 0.0833,
      range: 11.5,
      speed: 0,
      sightRange: 11.5,
      splashRadius: 0,
      targets: "air+ground",
      flying: false,
      deployTime: 3.5,
      radius: 0.55,
      projectileSpeed: 18,
      jumpsRiver: false,
      lifetimeSec: 40,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.3,
      visual: { shape: "xbow", body: "#7e8794", accent: "#8a5f3d", scale: 1.15 }
    },
    freeze: {
      name: "Congelamento",
      kind: "spell",
      cost: 4,
      count: 1,
      hp: 0,
      damage: 192,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 3,
      targets: "air+ground",
      flying: false,
      deployTime: 0.5,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 0.3,
      freezeSec: 4,
      visual: { shape: "freeze", body: "#7dd3fc", accent: "#e0f2fe", scale: 1.2 }
    },
    pekka: {
      name: "P.E.K.K.A",
      kind: "troop",
      cost: 7,
      count: 1,
      hp: 3760,
      damage: 816,
      attackSpeed: 1.8,
      range: 1.2,
      speed: 0.67,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.52,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      visual: { shape: "pekka", body: "#3b3f52", accent: "#57e0d8", scale: 1.75 }
    },
    mirror: {
      name: "Espelho",
      kind: "spell",
      cost: 0,
      count: 1,
      hp: 0,
      damage: 0,
      attackSpeed: 0,
      range: 0,
      speed: 0,
      sightRange: 0,
      splashRadius: 0,
      targets: "air+ground",
      flying: false,
      deployTime: 0.3,
      radius: 0,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      mirror: true,
      visual: { shape: "mirror", body: "#c5e4f0", accent: "#5c2d8a", scale: 1.3 }
    },
    golem: {
      name: "Golem",
      kind: "troop",
      cost: 8,
      count: 1,
      hp: 5120,
      damage: 312,
      attackSpeed: 2.5,
      range: 1.2,
      speed: 0.67,
      sightRange: 6,
      splashRadius: 0,
      targets: "buildings",
      flying: false,
      deployTime: 1,
      radius: 0.52,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      deathSplashDamage: 224,
      deathSplashRadius: 2,
      deathSplitCardId: "golemite",
      deathSplitCount: 2,
      visual: { shape: "golem", body: "#7a7872", accent: "#4dd4ff", scale: 1.5 }
    },
    golemite: {
      name: "Golemita",
      kind: "troop",
      cost: 0,
      count: 1,
      hp: 1280,
      damage: 156,
      attackSpeed: 1.25,
      range: 1.2,
      speed: 0.67,
      sightRange: 6,
      splashRadius: 0,
      targets: "buildings",
      flying: false,
      deployTime: 0.5,
      radius: 0.48,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.3,
      deathSplashDamage: 112,
      deathSplashRadius: 2,
      deathSplitCardId: "golemite_small",
      deathSplitCount: 2,
      spawnOnly: true,
      visual: { shape: "golemite", body: "#9a8268", accent: "#5c4a38", scale: 1.35 }
    },
    golemite_small: {
      name: "Golemita Pequeno",
      kind: "troop",
      cost: 0,
      count: 1,
      hp: 320,
      damage: 78,
      attackSpeed: 0.625,
      range: 1,
      speed: 0.67,
      sightRange: 5.5,
      splashRadius: 0,
      targets: "buildings",
      flying: false,
      deployTime: 0.3,
      radius: 0.32,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.2,
      deathSplashDamage: 56,
      deathSplashRadius: 2,
      spawnOnly: true,
      visual: { shape: "golemite", body: "#a89478", accent: "#5c4a38", scale: 0.85 }
    },
    mega_knight: {
      name: "Mega Cavaleiro",
      kind: "troop",
      cost: 7,
      count: 1,
      hp: 3993,
      damage: 268,
      attackSpeed: 1.7,
      range: 1.2,
      speed: 1,
      sightRange: 5.5,
      splashRadius: 1.5,
      targets: "ground",
      flying: false,
      deployTime: 1,
      radius: 0.5,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 0,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.5,
      deploySplashDamage: 537,
      deploySplashRadius: 2.5,
      jumpMinDist: 3.5,
      jumpMaxDist: 5,
      jumpDamage: 537,
      jumpRadius: 2.5,
      jumpDurationSec: 1.05,
      visual: { shape: "mega_knight", body: "#3b444b", accent: "#2d8fd4", scale: 1.85 }
    },
    inferno: {
      name: "Torre Inferno",
      kind: "building",
      cost: 5,
      count: 1,
      hp: 1218,
      damage: 40,
      attackSpeed: 0.4,
      range: 6,
      speed: 0,
      sightRange: 6,
      splashRadius: 0,
      targets: "air+ground",
      flying: false,
      deployTime: 1,
      radius: 0.5,
      projectileSpeed: 0,
      jumpsRiver: false,
      lifetimeSec: 30,
      stunSec: 0,
      towerDamageFactor: 1,
      firstAttackDelay: 0.4,
      infernoStages: [40, 80, 452],
      infernoStageSec: 1.2,
      visual: { shape: "inferno", body: "#3a3a42", accent: "#ff3311", scale: 1.55 }
    }
  }
};

// src/balance/index.ts
var DEFAULT_BALANCE = cards_default;
function sanitizeDeck(balance, deck) {
  return deck.filter((id) => balance.cards[id] && !balance.cards[id].spawnOnly);
}

// src/sim/arena.ts
var ARENA = {
  width: 18,
  height: 32,
  riverTop: 15.4,
  riverBottom: 16.6,
  bridgeLeftX: 3.5,
  bridgeRightX: 14.5,
  bridgeHalfWidth: 1.5,
  /**
   * No-deploy box around a live enemy king tower: 9 tiles wide by 5 tall,
   * centred on the tower. Once a princess falls the whole lane opens up, and
   * without this you could drop troops on top of — or behind — the king faster
   * than it can get a shot away. Spells and global cards ignore it.
   */
  kingDeployBlockHalfW: 4.5,
  kingDeployBlockHalfH: 2.5
};
var ARENA_SQUASH = 0.72;
var TOWER_SPOTS = [
  { team: 1, towerKind: "king", side: "center", x: 9, y: 5.2 },
  { team: 1, towerKind: "princess", side: "left", x: 3.5, y: 6.8 },
  { team: 1, towerKind: "princess", side: "right", x: 14.5, y: 6.8 },
  { team: 0, towerKind: "princess", side: "left", x: 3.5, y: 25.2 },
  { team: 0, towerKind: "princess", side: "right", x: 14.5, y: 25.2 },
  { team: 0, towerKind: "king", side: "center", x: 9, y: 26.8 }
];
function nearestBridgeX(x) {
  return x < ARENA.width / 2 ? ARENA.bridgeLeftX : ARENA.bridgeRightX;
}
function towerProjectileOrigin(kind, squash, active, opts) {
  const bodyH = (kind === "king" ? 1.6 : 1.4) * squash + 0.45;
  const merlon = 0.34;
  const crewH = kind === "king" ? 1.3 : 1.1;
  const baseY = -(bodyH + merlon);
  if (kind === "princess") {
    const flip = opts?.bowFlip ?? 1;
    return {
      ox: flip * crewH * 0.41,
      oy: (baseY - crewH * 0.6) / squash
    };
  }
  if (!active) {
    return { ox: 0, oy: (baseY - crewH * 0.5) / squash };
  }
  const pivotY = (baseY - crewH * 0.12) / squash;
  const barrelLen = crewH * 0.52;
  const angle = opts?.aimRad ?? -Math.PI / 2;
  return {
    ox: Math.cos(angle) * barrelLen,
    oy: pivotY + Math.sin(angle) * barrelLen
  };
}

// src/net/perspective.ts
var flipX = (x) => ARENA.width - x;
var flipY = (y) => ARENA.height - y;
function flipPoint(x, y) {
  return { x: flipX(x), y: flipY(y) };
}
var otherTeam = (team) => team === 0 ? 1 : 0;
var otherSide = (side) => side === "left" ? "right" : side === "right" ? "left" : side;
var swap = (pair) => [pair[1], pair[0]];
function flipEntity(e) {
  const out = {
    ...e,
    team: otherTeam(e.team),
    side: otherSide(e.side),
    x: flipX(e.x),
    y: flipY(e.y),
    px: flipX(e.px),
    py: flipY(e.py),
    // facing is an x-axis sign, so mirroring x mirrors it too
    facing: -e.facing
  };
  if (e.jumpFromX !== void 0) out.jumpFromX = flipX(e.jumpFromX);
  if (e.jumpFromY !== void 0) out.jumpFromY = flipY(e.jumpFromY);
  if (e.jumpTargetX !== void 0) out.jumpTargetX = flipX(e.jumpTargetX);
  if (e.jumpTargetY !== void 0) out.jumpTargetY = flipY(e.jumpTargetY);
  return out;
}
function flipProjectile(p) {
  return {
    ...p,
    team: otherTeam(p.team),
    x: flipX(p.x),
    y: flipY(p.y),
    px: flipX(p.px),
    py: flipY(p.py)
  };
}
function flipPendingSpell(s) {
  return {
    ...s,
    team: otherTeam(s.team),
    x0: flipX(s.x0),
    y0: flipY(s.y0),
    x: flipX(s.x),
    y: flipY(s.y),
    px: flipX(s.px),
    py: flipY(s.py),
    tx: flipX(s.tx),
    ty: flipY(s.ty)
  };
}
function flipRageZone(z) {
  return { ...z, team: otherTeam(z.team), x: flipX(z.x), y: flipY(z.y) };
}
function flipEffect(fx) {
  switch (fx.type) {
    case "teslaZap":
    case "infernoBeam":
      return { ...fx, x0: flipX(fx.x0), y0: flipY(fx.y0), x1: flipX(fx.x1), y1: flipY(fx.y1) };
    // sem trocar o time, quem é team 1 de verdade veria o confete na cor errada
    case "towerDown":
      return { ...fx, x: flipX(fx.x), y: flipY(fx.y), team: otherTeam(fx.team) };
    default:
      return { ...fx, x: flipX(fx.x), y: flipY(fx.y) };
  }
}
function flipResult(result) {
  if (result === "win") return "lose";
  if (result === "lose") return "win";
  return result;
}
function viewSnapshotAs(snap, flip) {
  if (!flip) return snap;
  return {
    entities: snap.entities.map(flipEntity),
    projectiles: snap.projectiles.map(flipProjectile),
    pendingSpells: snap.pendingSpells.map(flipPendingSpell),
    rageZones: snap.rageZones.map(flipRageZone),
    elixir: swap(snap.elixir),
    time: snap.time,
    timeLeft: snap.timeLeft,
    phase: snap.phase,
    result: flipResult(snap.result),
    crowns: swap(snap.crowns),
    lastPlayed: swap(snap.lastPlayed)
  };
}
function viewEffectsAs(effects, flip) {
  return flip ? effects.map(flipEffect) : effects;
}

// src/sim/world.ts
var dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
var SPAWN_PLUS = [
  [0, -0.55],
  [-0.55, 0],
  [0.55, 0],
  [0, 0.55]
];
var FORMATIONS = {
  1: [[0, 0]],
  2: [
    [-0.5, 0],
    [0.5, 0]
  ],
  3: [
    [0, -0.55],
    [-0.6, 0.35],
    [0.6, 0.35]
  ],
  4: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5]
  ],
  15: [
    [-1, -0.6],
    [-0.5, -0.6],
    [0, -0.6],
    [0.5, -0.6],
    [1, -0.6],
    [-1, 0],
    [-0.5, 0],
    [0, 0],
    [0.5, 0],
    [1, 0],
    [-1, 0.6],
    [-0.5, 0.6],
    [0, 0.6],
    [0.5, 0.6],
    [1, 0.6]
  ]
};
var World = class {
  b;
  entities = [];
  projectiles = [];
  /** spells travelling toward their target; damage lands only on arrival */
  pendingSpells = [];
  /** delayed spawner summons (Tombstone stagger between skeletons) */
  pendingSpawns = [];
  /** transient visual events, drained by the renderer every frame */
  effects = [];
  /** Rage spell pools — liquid stain on the ground while the buff is active */
  rageZones = [];
  elixir;
  time = 0;
  timeLeft;
  phase = "normal";
  result = null;
  /** towers destroyed, indexed by the team that destroyed them */
  crowns = [0, 0];
  /** Dev-only multiplier for elixir regen (does not affect units or match clock). */
  elixirSpeedMul = 1;
  /** Last card played per team — used by Mirror. */
  lastPlayed = [null, null];
  nextId = 1;
  constructor(balance) {
    this.b = balance;
    this.elixir = [balance.global.elixirStart, balance.global.elixirStart];
    this.timeLeft = balance.global.matchDurationSec;
    for (const spot of TOWER_SPOTS) {
      const def = balance.towers[spot.towerKind];
      this.entities.push({
        id: this.nextId++,
        team: spot.team,
        kind: "tower",
        cardId: spot.towerKind,
        x: spot.x,
        y: spot.y,
        px: spot.x,
        py: spot.y,
        hp: def.hp,
        maxHp: def.hp,
        radius: def.radius,
        damage: def.damage,
        range: def.range,
        attackSpeed: def.attackSpeed,
        speed: 0,
        sightRange: def.range,
        splashRadius: 0,
        projectileSpeed: def.projectileSpeed,
        targets: "air+ground",
        flying: false,
        jumpsRiver: false,
        lifetimeLeft: 0,
        decayPerSec: 0,
        attackCd: 0,
        deployLeft: 0,
        stunLeft: 0,
        targetId: null,
        state: "moving",
        facing: spot.team === 0 ? -1 : 1,
        animT: 0,
        hitFlash: 0,
        swing: 0,
        towerKind: spot.towerKind,
        side: spot.side,
        active: spot.towerKind === "princess",
        rubble: false
      });
    }
  }
  // ---------------------------------------------------------------- queries
  byId(id) {
    return this.entities.find((e) => e.id === id && e.hp > 0);
  }
  towers(team) {
    return this.entities.filter((e) => e.kind === "tower" && e.team === team && e.hp > 0);
  }
  /**
   * Elixir regen rate right now. Matches Clash Royale: last minute of
   * regulation is double, and overtime starts double then tightens to
   * triple for its closing stretch.
   */
  elixirRate() {
    const g = this.b.global;
    if (this.phase === "overtime") {
      return this.timeLeft <= g.tripleElixirLastSec ? g.elixirRateSec / 3 : g.elixirRateSec / 2;
    }
    if (this.timeLeft <= g.doubleElixirLastSec) {
      return g.elixirRateSec / 2;
    }
    return g.elixirRateSec;
  }
  /** Is this side of the enemy's half open for deployment? */
  sideUnlocked(team, side) {
    const enemy = team === 0 ? 1 : 0;
    return !this.entities.some(
      (e) => e.kind === "tower" && e.team === enemy && e.side === side && e.hp > 0
    );
  }
  /**
   * Centre of the enemy king tower, while it still stands. Drives the no-deploy
   * bubble that keeps an opened lane from becoming a free drop on the king.
   */
  enemyKingGuard(team) {
    const enemy = team === 0 ? 1 : 0;
    const king = this.entities.find(
      (e) => e.kind === "tower" && e.towerKind === "king" && e.team === enemy && e.hp > 0
    );
    return king ? { x: king.x, y: king.y } : void 0;
  }
  clearOfEnemyKing(team, x, y) {
    const king = this.enemyKingGuard(team);
    if (!king) return true;
    return Math.abs(x - king.x) >= ARENA.kingDeployBlockHalfW || Math.abs(y - king.y) >= ARENA.kingDeployBlockHalfH;
  }
  canDeploy(team, x, y, cardId) {
    if (x < 0.6 || x > ARENA.width - 0.6 || y < 0.6 || y > ARENA.height - 0.6) return false;
    if (cardId && this.b.cards[cardId]?.kind === "spell") return true;
    const side = x < ARENA.width / 2 ? "left" : "right";
    if (team === 0) {
      if (y > ARENA.riverBottom + 0.3) return true;
      return this.sideUnlocked(0, side) && y > 3.5 && this.clearOfEnemyKing(0, x, y);
    }
    if (y < ARENA.riverTop - 0.3) return true;
    return this.sideUnlocked(1, side) && y < ARENA.height - 3.5 && this.clearOfEnemyKing(1, x, y);
  }
  // ---------------------------------------------------------------- actions
  /** Returns true if the card was actually played. */
  deploy(team, cardId, x, y) {
    if (this.phase === "over") return false;
    let effectiveId = cardId;
    const mirrorCard = this.b.cards[cardId];
    if (!mirrorCard) return false;
    if (mirrorCard.mirror) {
      const last = this.lastPlayed[team];
      if (!last || last === "mirror") return false;
      effectiveId = last;
    }
    const card = this.b.cards[effectiveId];
    if (!card) return false;
    const cost = mirrorCard.mirror ? card.cost + 1 : mirrorCard.cost;
    if (this.elixir[team] < cost) return false;
    if (!this.canDeploy(team, x, y, effectiveId)) return false;
    this.elixir[team] -= cost;
    if (card.kind === "spell") {
      this.castSpell(team, effectiveId, card, x, y);
    } else {
      const shape = FORMATIONS[card.count] ?? FORMATIONS[1];
      for (let i = 0; i < card.count; i++) {
        const [ox, oy] = shape[i % shape.length];
        this.spawnTroop(team, effectiveId, card, x + ox, y + oy);
      }
      this.effects.push({ type: "deploy", x, y });
    }
    this.lastPlayed[team] = cardId;
    return true;
  }
  /**
   * Throwing a spell doesn't hit instantly: it launches from behind the
   * caster's own edge of the arena and flies to the target, exactly like a
   * real Fireball — damage only lands when `stepPendingSpells` sees it arrive.
   */
  castSpell(team, cardId, card, x, y) {
    let originX = x;
    let originY = team === 0 ? ARENA.height + 1.6 : -1.6;
    let duration = Math.max(0.2, card.deployTime || 0.8);
    if (card.spellFromKing) {
      const king = TOWER_SPOTS.find((s) => s.team === team && s.towerKind === "king");
      if (king) {
        originX = king.x;
        originY = king.y;
      }
      const travel = dist(originX, originY, x, y);
      duration = Math.max(0.7, travel / 7.5);
    }
    this.pendingSpells.push({
      id: this.nextId++,
      team,
      cardId,
      x0: originX,
      y0: originY,
      x: originX,
      y: originY,
      px: originX,
      py: originY,
      tx: x,
      ty: y,
      t: 0,
      duration,
      damage: card.damage,
      splashRadius: card.splashRadius,
      towerDamageFactor: card.towerDamageFactor,
      stunSec: card.stunSec,
      shape: card.visual.shape,
      body: card.visual.body,
      accent: card.visual.accent
    });
  }
  resolveSpellImpact(s) {
    const card = this.b.cards[s.cardId];
    if (!card) return;
    if (s.cardId === "goblin_barrel") {
      this.effects.push({
        type: "spell",
        x: s.tx,
        y: s.ty,
        radius: s.splashRadius,
        shape: s.shape
      });
      const summon = card.spellSpawnCardId ? this.b.cards[card.spellSpawnCardId] : void 0;
      if (summon) {
        const shape = FORMATIONS[card.spellSpawnCount ?? 3] ?? FORMATIONS[3];
        for (let i = 0; i < (card.spellSpawnCount ?? 3); i++) {
          const [ox, oy] = shape[i % shape.length];
          this.pendingSpawns.push({
            team: s.team,
            cardId: card.spellSpawnCardId,
            x: s.tx + ox,
            y: s.ty + oy,
            t: 1.1
          });
        }
      }
      return;
    }
    if (s.cardId === "rage") {
      if (s.damage > 0) {
        this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor, void 0, s.cardId);
      }
      const duration = card.buffDurationSec ?? 5.5;
      this.rageZones.push({
        id: this.nextId++,
        team: s.team,
        x: s.tx,
        y: s.ty,
        radius: s.splashRadius,
        timeLeft: duration,
        duration,
        body: s.body,
        accent: s.accent
      });
      this.applyRageZoneBuff(s.tx, s.ty, s.splashRadius, s.team, duration, card);
      this.effects.push({ type: "spell", x: s.tx, y: s.ty, radius: s.splashRadius, shape: s.shape });
      return;
    }
    if (s.cardId === "freeze") {
      if (s.damage > 0) {
        this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor, void 0, s.cardId);
      }
      const enemy = s.team === 0 ? 1 : 0;
      const freezeSec = card.freezeSec ?? 4;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0) continue;
        if (dist(s.tx, s.ty, o.x, o.y) - o.radius > s.splashRadius) continue;
        o.stunLeft = Math.max(o.stunLeft, freezeSec);
        o.attackCd = Math.max(o.attackCd, freezeSec);
        if (o.infernoStage !== void 0) {
          o.infernoStage = 0;
          o.infernoStageT = 0;
          o.infernoTargetId = null;
        }
      }
      this.effects.push({ type: "spell", x: s.tx, y: s.ty, radius: s.splashRadius, shape: s.shape });
      return;
    }
    this.splashDamage(s.team, s.tx, s.ty, s.splashRadius, s.damage, s.towerDamageFactor, void 0, s.cardId);
    if (s.stunSec > 0) {
      const enemy = s.team === 0 ? 1 : 0;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0 || o.kind === "tower") continue;
        if (dist(s.tx, s.ty, o.x, o.y) - o.radius > s.splashRadius) continue;
        o.stunLeft = Math.max(o.stunLeft, s.stunSec);
        o.attackCd = Math.max(o.attackCd, s.stunSec);
      }
    }
    this.effects.push({ type: "spell", x: s.tx, y: s.ty, radius: s.splashRadius, shape: s.shape });
  }
  stepPendingSpells(dt) {
    for (const s of this.pendingSpells) {
      s.t += dt;
      const k = Math.min(1, s.t / s.duration);
      s.x = s.x0 + (s.tx - s.x0) * k;
      s.y = s.y0 + (s.ty - s.y0) * k;
      if (k >= 1) {
        this.resolveSpellImpact(s);
      }
    }
    this.pendingSpells = this.pendingSpells.filter((s) => s.t < s.duration);
  }
  applyRageZoneBuff(x, y, radius, team, duration, card) {
    const speedMul = card.buffSpeedMul ?? 1.35;
    const attackMul = card.buffAttackMul ?? 1.35;
    for (const o of this.entities) {
      if (o.team !== team || o.hp <= 0 || o.kind === "tower") continue;
      if (dist(x, y, o.x, o.y) - o.radius > radius) continue;
      o.rageLeft = Math.max(o.rageLeft ?? 0, duration);
      o.rageSpeedMul = speedMul;
      o.rageAttackMul = attackMul;
    }
  }
  stepRageZones(dt) {
    const card = this.b.cards.rage;
    if (!card) return;
    for (let i = this.rageZones.length - 1; i >= 0; i--) {
      const z = this.rageZones[i];
      z.timeLeft -= dt;
      if (z.timeLeft <= 0) {
        this.rageZones.splice(i, 1);
        continue;
      }
      this.applyRageZoneBuff(z.x, z.y, z.radius, z.team, z.timeLeft, card);
    }
  }
  spawnTroop(team, cardId, card, x, y, instant = false) {
    const cx = Math.min(Math.max(x, 0.4), ARENA.width - 0.4);
    const cy = Math.min(Math.max(y, 0.4), ARENA.height - 0.4);
    this.entities.push({
      id: this.nextId++,
      team,
      kind: card.kind === "building" ? "building" : "troop",
      cardId,
      x: cx,
      y: cy,
      px: cx,
      py: cy,
      hp: card.hp,
      maxHp: card.hp,
      radius: card.radius,
      damage: card.damage,
      range: card.range,
      attackSpeed: card.attackSpeed,
      speed: card.speed,
      sightRange: card.sightRange,
      splashRadius: card.splashRadius,
      projectileSpeed: card.projectileSpeed,
      targets: card.targets,
      flying: card.flying,
      jumpsRiver: card.jumpsRiver,
      lifetimeLeft: card.lifetimeSec,
      decayPerSec: card.lifetimeSec > 0 ? card.hp / card.lifetimeSec : 0,
      attackCd: card.firstAttackDelay ?? 0,
      deployLeft: instant ? 0 : card.deployTime,
      stunLeft: 0,
      targetId: null,
      state: instant ? "moving" : "deploying",
      facing: team === 0 ? -1 : 1,
      animT: Math.random() * 2,
      hitFlash: 0,
      swing: 0,
      spawnCd: card.spawnIntervalSec ? 0 : void 0,
      chargeAccum: card.chargeDistTiles ? 0 : void 0,
      charging: false,
      chargeTargetId: null,
      hidden: card.hidesUnderground ? false : void 0,
      towerFocusLocked: false,
      infernoStage: card.infernoStages ? 0 : void 0,
      infernoStageT: card.infernoStages ? 0 : void 0,
      infernoTargetId: card.infernoStages ? null : void 0,
      rageLeft: 0,
      rageSpeedMul: 1,
      rageAttackMul: 1,
      deploySplashPending: card.deploySplashDamage ? true : void 0,
      active: true,
      rubble: false
    });
  }
  /** Periodic summons (Witch skeletons, Tombstone) — stops when the spawner dies. */
  stepSpawner(e, dt) {
    if (e.deployLeft > 0 || e.spawnCd === void 0) return;
    const card = this.b.cards[e.cardId];
    if (!card?.spawnIntervalSec || !card.spawnCardId || !card.spawnCount) return;
    const summon = this.b.cards[card.spawnCardId];
    if (!summon) return;
    e.spawnCd -= dt;
    if (e.spawnCd > 0) return;
    for (let i = 0; i < card.spawnCount; i++) {
      const [ox, oy] = SPAWN_PLUS[i % SPAWN_PLUS.length];
      const delay = i * (card.spawnStaggerSec ?? 0);
      const sx = e.x + ox;
      const sy = e.y + oy;
      if (delay <= 0) {
        this.spawnTroop(e.team, card.spawnCardId, summon, sx, sy, true);
      } else {
        this.pendingSpawns.push({ team: e.team, cardId: card.spawnCardId, x: sx, y: sy, t: delay });
      }
    }
    this.effects.push({ type: "deploy", x: e.x, y: e.y });
    e.spawnCd = card.spawnIntervalSec;
  }
  stepPendingSpawns(dt) {
    const remaining = [];
    for (const p of this.pendingSpawns) {
      p.t -= dt;
      if (p.t <= 0) {
        const summon = this.b.cards[p.cardId];
        if (summon) this.spawnTroop(p.team, p.cardId, summon, p.x, p.y, true);
      } else {
        remaining.push(p);
      }
    }
    this.pendingSpawns = remaining;
  }
  /** Summon troops when a spawner building is destroyed or expires. */
  deathSpawn(e) {
    const card = this.b.cards[e.cardId];
    if (!card) return;
    if (card.deathSplashDamage && card.deathSplashRadius) {
      this.splashDamage(e.team, e.x, e.y, card.deathSplashRadius, card.deathSplashDamage, 1, e);
      this.effects.push({ type: "splash", x: e.x, y: e.y, radius: card.deathSplashRadius });
    }
    const splitId = card.deathSplitCardId;
    const splitCount = card.deathSplitCount;
    if (splitId && splitCount) {
      const summon2 = this.b.cards[splitId];
      if (summon2) {
        for (let i = 0; i < splitCount; i++) {
          const [ox, oy] = SPAWN_PLUS[i % SPAWN_PLUS.length];
          this.spawnTroop(e.team, splitId, summon2, e.x + ox, e.y + oy, true);
        }
        this.effects.push({ type: "deploy", x: e.x, y: e.y });
      }
      return;
    }
    if (!card.deathSpawnCardId || !card.deathSpawnCount) return;
    const summon = this.b.cards[card.deathSpawnCardId];
    if (!summon) return;
    for (let i = 0; i < card.deathSpawnCount; i++) {
      const [ox, oy] = SPAWN_PLUS[i % SPAWN_PLUS.length];
      this.spawnTroop(e.team, card.deathSpawnCardId, summon, e.x + ox, e.y + oy, true);
    }
    this.effects.push({ type: "deploy", x: e.x, y: e.y });
  }
  /** Tesla: retract underground when idle, rise when an enemy enters range. */
  stepHiddenBuilding(e) {
    if (e.deployLeft > 0 || !this.b.cards[e.cardId]?.hidesUnderground) return;
    const inRange = this.nearestEnemyInRange(e, e.range);
    const wasHidden = e.hidden;
    if (inRange) {
      e.hidden = false;
      if (wasHidden) {
        e.attackCd = this.b.cards[e.cardId].firstAttackDelay ?? 0.5;
      }
    } else {
      e.hidden = true;
      e.targetId = null;
      e.state = "moving";
    }
  }
  nearestEnemyInRange(e, range) {
    const enemy = e.team === 0 ? 1 : 0;
    let best;
    let bestD = Infinity;
    for (const o of this.entities) {
      if (o.team !== enemy || o.hp <= 0 || o.kind === "tower") continue;
      if (o.flying && e.targets === "ground") continue;
      const d = dist(e.x, e.y, o.x, o.y) - o.radius;
      if (d <= range && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
  // ------------------------------------------------------------------ tick
  step(dt) {
    if (this.phase === "over") return;
    this.time += dt;
    for (const e of this.entities) {
      e.px = e.x;
      e.py = e.y;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
    }
    for (const s of this.pendingSpells) {
      s.px = s.x;
      s.py = s.y;
    }
    this.stepClock(dt);
    this.stepElixir(dt);
    for (const e of this.entities) {
      if (e.hp <= 0) continue;
      e.animT += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.swing > 0) e.swing -= dt * 4;
      if (e.decayPerSec > 0) {
        e.lifetimeLeft -= dt;
        e.hp -= e.decayPerSec * dt;
      }
      if (e.deployLeft > 0) {
        e.deployLeft -= dt;
        if (e.deployLeft <= 0) {
          e.state = "moving";
          if (e.deploySplashPending) {
            this.deploySplash(e);
            e.deploySplashPending = false;
          }
        }
        continue;
      }
      if (e.rageLeft && e.rageLeft > 0) {
        e.rageLeft -= dt;
        if (e.rageLeft <= 0) {
          e.rageSpeedMul = 1;
          e.rageAttackMul = 1;
        }
      }
      if (e.stunLeft > 0) {
        if (this.b.cards[e.cardId]?.chargeDistTiles) this.resetCharge(e);
        if (e.jumping) {
          e.jumping = false;
          e.jumpT = void 0;
          e.jumpLandLeft = 0;
        }
        e.stunLeft -= dt;
        this.stepSpawner(e, dt);
        this.stepHiddenBuilding(e);
        continue;
      }
      if (e.attackCd > 0) e.attackCd -= dt;
      if (e.jumpLandLeft && e.jumpLandLeft > 0) {
        e.jumpLandLeft -= dt;
        if (e.jumpLandLeft < 0) e.jumpLandLeft = 0;
      }
      this.stepSpawner(e, dt);
      this.stepHiddenBuilding(e);
      this.stepEntity(e, dt);
    }
    this.stepProjectiles(dt);
    this.stepPendingSpells(dt);
    this.stepPendingSpawns(dt);
    this.stepRageZones(dt);
    this.separate();
    this.cleanup();
    this.checkEnd();
  }
  stepClock(dt) {
    this.timeLeft -= dt;
    if (this.timeLeft > 0) return;
    if (this.phase === "normal") {
      if (this.crowns[0] !== this.crowns[1]) {
        this.finish(this.crowns[0] > this.crowns[1] ? "win" : "lose");
      } else {
        this.phase = "overtime";
        this.timeLeft = this.b.global.overtimeSec;
      }
    } else if (this.phase === "overtime") {
      if (this.crowns[0] !== this.crowns[1]) {
        this.finish(this.crowns[0] > this.crowns[1] ? "win" : "lose");
      } else {
        this.resolveTiebreaker();
      }
    }
  }
  /**
   * Clash Royale's real tiebreaker when overtime runs out still tied: every
   * troop vanishes and whichever crown tower is weakest by HP% falls. That
   * feeds into the same sudden-death branch `cleanup()` already uses for a
   * tower killed during overtime, so it decides the match immediately.
   */
  resolveTiebreaker() {
    this.entities = this.entities.filter((e) => e.kind === "tower");
    this.projectiles = [];
    this.pendingSpells = [];
    let weakest;
    let weakestRatio = Infinity;
    for (const t of this.entities) {
      if (t.hp <= 0) continue;
      const ratio = t.hp / t.maxHp;
      if (ratio < weakestRatio - 1e-9) {
        weakestRatio = ratio;
        weakest = t;
      }
    }
    if (!weakest) {
      this.finish("draw");
      return;
    }
    const tied = this.entities.some(
      (t) => t !== weakest && t.hp > 0 && Math.abs(t.hp / t.maxHp - weakestRatio) < 1e-9
    );
    if (tied) {
      this.finish("draw");
      return;
    }
    weakest.hp = 0;
  }
  stepElixir(dt) {
    const rate = this.elixirRate();
    const max = this.b.global.elixirMax;
    const elixirDt = dt * this.elixirSpeedMul;
    this.elixir[0] = Math.min(max, this.elixir[0] + elixirDt / rate);
    this.elixir[1] = Math.min(max, this.elixir[1] + elixirDt / rate);
  }
  stepEntity(e, dt) {
    if (e.hidden && e.cardId === "tesla") return;
    const card = this.b.cards[e.cardId];
    if (e.jumping && card?.jumpMinDist) {
      this.stepMegaKnightJump(e, dt, card);
      return;
    }
    const target = this.acquireTarget(e);
    const prevTargetId = e.targetId;
    e.targetId = target ? target.id : null;
    if (card?.chargeDistTiles) {
      if (e.chargeTargetId != null && e.targetId !== e.chargeTargetId) this.resetCharge(e);
      if (e.targetId == null) this.resetCharge(e);
      else if (prevTargetId !== e.targetId) e.chargeTargetId = e.targetId;
      else if (e.chargeTargetId == null) e.chargeTargetId = e.targetId;
    }
    if (!target) {
      e.state = "moving";
      return;
    }
    const d = dist(e.x, e.y, target.x, target.y);
    const reach = this.meleeReach(e, target);
    if (d <= reach) {
      e.state = "attacking";
      if (target.kind === "tower" && e.kind === "troop" && e.targets !== "buildings") {
        e.towerFocusLocked = true;
      }
      if (target.x !== e.x) e.facing = target.x < e.x ? -1 : 1;
      if (e.attackCd <= 0 && e.active) {
        e.attackCd = e.attackSpeed / (e.rageAttackMul ?? 1);
        e.swing = 1;
        const dmg = e.charging && card?.chargeDamageMul ? e.damage * card.chargeDamageMul : e.damage;
        if (e.charging) this.resetCharge(e);
        this.fire(e, target, dmg);
      }
      return;
    }
    if (e.kind === "tower" || e.speed <= 0) {
      e.state = "moving";
      return;
    }
    if (card?.jumpMinDist && card.jumpMaxDist && card.jumpDamage && !e.jumping) {
      const edgeD = d - target.radius;
      if (edgeD >= card.jumpMinDist && edgeD <= card.jumpMaxDist && e.attackCd <= 0) {
        const jx = target.x + (e.x - target.x) * 0.25;
        const jy = target.y + (e.y - target.y) * 0.25;
        e.jumping = true;
        e.jumpFromX = e.x;
        e.jumpFromY = e.y;
        e.jumpTargetX = jx;
        e.jumpTargetY = jy;
        e.jumpT = 0;
        e.jumpLandLeft = 0;
        e.state = "moving";
        if (target.x !== e.x) e.facing = target.x < e.x ? -1 : 1;
        return;
      }
    }
    e.state = "moving";
    const [bwx, bwy] = this.waypoint(e, target.x, target.y);
    const [wx, wy] = this.avoidTowers(e, bwx, bwy);
    const dx = wx - e.x;
    const dy = wy - e.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const moveSpeed = e.speed * (e.rageSpeedMul ?? 1);
    const stepLen = Math.min(moveSpeed * dt, len);
    e.x += dx / len * stepLen;
    e.y += dy / len * stepLen;
    if (Math.abs(dx) > 0.05) e.facing = dx < 0 ? -1 : 1;
    if (card?.chargeDistTiles && !e.charging) {
      e.chargeAccum = (e.chargeAccum ?? 0) + stepLen;
      if (e.chargeAccum >= card.chargeDistTiles) {
        e.charging = true;
        e.speed = card.chargeSpeed ?? card.speed * 2;
        if (card.chargeJumpsRiver) e.jumpsRiver = true;
      }
    }
  }
  /** Mega Knight: heavy leap — position lerps slowly; splash fires when he lands. */
  stepMegaKnightJump(e, dt, card) {
    const duration = card.jumpDurationSec ?? 1.05;
    e.jumpT = (e.jumpT ?? 0) + dt;
    const k = Math.min(1, e.jumpT / duration);
    const ease = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    e.x = e.jumpFromX + (e.jumpTargetX - e.jumpFromX) * ease;
    e.y = e.jumpFromY + (e.jumpTargetY - e.jumpFromY) * ease;
    e.state = "moving";
    if (k < 1) return;
    e.jumping = false;
    e.x = e.jumpTargetX;
    e.y = e.jumpTargetY;
    e.jumpT = void 0;
    this.splashDamage(e.team, e.x, e.y, card.jumpRadius ?? 2.5, card.jumpDamage, 1, e);
    this.effects.push({ type: "splash", x: e.x, y: e.y, radius: card.jumpRadius ?? 2.5 });
    e.attackCd = 0.65;
    e.swing = 1;
    e.jumpLandLeft = 0.42;
  }
  /** Prince: end charge and restore normal movement. */
  resetCharge(e) {
    const card = this.b.cards[e.cardId];
    if (!card?.chargeDistTiles) return;
    e.charging = false;
    e.chargeAccum = 0;
    e.chargeTargetId = null;
    e.speed = card.speed;
    e.jumpsRiver = card.jumpsRiver;
  }
  /** Mega Knight landing shockwave when deploy finishes. */
  deploySplash(e) {
    const card = this.b.cards[e.cardId];
    if (!card?.deploySplashDamage) return;
    this.splashDamage(
      e.team,
      e.x,
      e.y,
      card.deploySplashRadius ?? 2.5,
      card.deploySplashDamage,
      1,
      e
    );
    this.effects.push({
      type: "splash",
      x: e.x,
      y: e.y,
      radius: card.deploySplashRadius ?? 2.5
    });
  }
  /**
   * Ground units can only cross the river on a bridge, so we steer them to the
   * nearest bridge mouth first and only then toward the real target.
   */
  waypoint(e, tx, ty) {
    if (e.flying || e.jumpsRiver) return [tx, ty];
    const { riverTop, riverBottom } = ARENA;
    const onTop = e.y < riverTop;
    const onBottom = e.y > riverBottom;
    const inRiver = !onTop && !onBottom;
    const targetTop = ty < riverTop;
    const targetBottom = ty > riverBottom;
    const mustCross = onTop && targetBottom || onBottom && targetTop;
    if (!mustCross && !inRiver) return [tx, ty];
    const bx = nearestBridgeX(e.x);
    if (inRiver) {
      return [bx, targetTop || onBottom ? riverTop - 0.7 : riverBottom + 0.7];
    }
    if (Math.abs(e.x - bx) > 0.35) {
      return [bx, onBottom ? riverBottom + 0.7 : riverTop - 0.7];
    }
    return [bx, onBottom ? riverTop - 0.7 : riverBottom + 0.7];
  }
  /**
   * Towers are solid now, and steering alone stalls when one sits exactly on
   * the line to the waypoint — the separation push comes back along the same
   * axis the unit is pushing into. That is the common case, since each princess
   * tower shares its lane's x with the bridge. So when a tower blocks the path
   * we aim at its edge instead and let the unit resume once it is clear.
   */
  avoidTowers(e, wx, wy) {
    if (e.flying) return [wx, wy];
    const dx = wx - e.x;
    const dy = wy - e.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return [wx, wy];
    const ux = dx / len;
    const uy = dy / len;
    for (const t of this.entities) {
      if (t.kind !== "tower" || t.hp <= 0) continue;
      if (e.targetId === t.id) continue;
      const clear = t.radius + e.radius + 0.15;
      const relX = t.x - e.x;
      const relY = t.y - e.y;
      const along = relX * ux + relY * uy;
      if (along <= 0 || along > len + t.radius) continue;
      const side = relX * -uy + relY * ux;
      if (Math.abs(side) >= clear) continue;
      let dir;
      if (Math.abs(side) < 0.05) {
        dir = (ARENA.width / 2 - t.x) * -uy >= 0 ? 1 : -1;
      } else {
        dir = side >= 0 ? -1 : 1;
      }
      const ahead = t.radius + 0.5;
      return [
        t.x + -uy * dir * clear + ux * ahead,
        t.y + ux * dir * clear + uy * ahead
      ];
    }
    return [wx, wy];
  }
  acquireTarget(e) {
    const enemy = e.team === 0 ? 1 : 0;
    if (this.b.cards[e.cardId]?.hidesUnderground) {
      return this.nearestEnemyInRange(e, e.range);
    }
    if (e.towerFocusLocked) {
      const locked = e.targetId != null ? this.byId(e.targetId) : void 0;
      if (locked && locked.kind === "tower" && locked.team === enemy) {
        return locked;
      }
      e.towerFocusLocked = false;
    }
    const canScanTroops = !e.towerFocusLocked && e.targets !== "buildings";
    if (canScanTroops) {
      let best;
      let bestD = e.kind === "tower" ? e.range + e.radius : e.sightRange;
      for (const o of this.entities) {
        if (o.team !== enemy || o.hp <= 0 || o.kind === "tower") continue;
        if (o.flying && e.targets === "ground") continue;
        if (o.hidden && o.cardId === "tesla") continue;
        const d = dist(e.x, e.y, o.x, o.y) - o.radius;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      if (best) return best;
    }
    if (e.kind === "tower") return void 0;
    return this.nearestStructure(e, enemy);
  }
  /** Nearest enemy tower or building — what Giants and Hog Riders walk toward. */
  nearestStructure(e, team) {
    let best;
    let bestD = Infinity;
    for (const o of this.entities) {
      if (o.kind === "troop" || o.team !== team || o.hp <= 0) continue;
      const d = dist(e.x, e.y, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
  /**
   * How close a melee unit must be before it stops and swings.
   * Self-centred splash (Valkyrie) uses the spin radius; others use weapon reach.
   */
  meleeReach(e, target) {
    if (e.splashRadius > 0 && e.projectileSpeed <= 0 && !e.flying) {
      return e.splashRadius + target.radius;
    }
    return e.range + e.radius + target.radius;
  }
  fire(e, target, damageOverride) {
    const card = this.b.cards[e.cardId];
    let dmg = damageOverride ?? e.damage;
    if (card?.infernoStages) {
      if (e.infernoTargetId !== target.id) {
        e.infernoStage = 0;
        e.infernoStageT = 0;
        e.infernoTargetId = target.id;
      } else {
        e.infernoStageT = (e.infernoStageT ?? 0) + e.attackSpeed;
        const maxStage = card.infernoStages.length - 1;
        if (e.infernoStageT >= (card.infernoStageSec ?? 1.2) && (e.infernoStage ?? 0) < maxStage) {
          e.infernoStage = (e.infernoStage ?? 0) + 1;
          e.infernoStageT = 0;
        }
      }
      dmg = card.infernoStages[e.infernoStage ?? 0];
    }
    if (e.projectileSpeed > 0) {
      let sx = e.x;
      let sy = e.y - 0.4;
      if (e.kind === "tower" && e.towerKind) {
        const bowFlip = e.side === "right" ? -1 : 1;
        const aimRad = Math.atan2(target.y - e.y, target.x - e.x);
        const origin = towerProjectileOrigin(e.towerKind, ARENA_SQUASH, e.active, {
          bowFlip,
          aimRad
        });
        sx = e.x + origin.ox;
        sy = e.y + origin.oy;
      }
      this.projectiles.push({
        id: this.nextId++,
        team: e.team,
        x: sx,
        y: sy,
        px: sx,
        py: sy,
        targetId: target.id,
        speed: e.projectileSpeed,
        damage: dmg,
        splashRadius: e.splashRadius,
        color: e.kind === "tower" ? "#e8e2d0" : e.cardId === "witch" ? "#ff4da6" : this.b.cards[e.cardId].visual.accent,
        size: e.splashRadius > 0 ? 0.3 : 0.18
      });
      return;
    }
    if (e.projectileSpeed <= 0 && e.range > 1.2 && e.kind === "building") {
      this.damage(target, dmg, { attacker: e });
      if (e.cardId === "tesla") {
        this.effects.push({
          type: "teslaZap",
          x0: e.x,
          y0: e.y - 0.55,
          x1: target.x,
          y1: target.y - 0.3
        });
        this.effects.push({ type: "hit", x: target.x, y: target.y - 0.3, color: "#8ff0ff" });
      } else if (e.cardId === "inferno") {
        this.effects.push({
          type: "infernoBeam",
          x0: e.x,
          y0: e.y - 0.45,
          x1: target.x,
          y1: target.y - 0.3,
          stage: e.infernoStage ?? 0
        });
        this.effects.push({ type: "hit", x: target.x, y: target.y - 0.3, color: "#ff4422" });
      } else {
        this.effects.push({ type: "hit", x: target.x, y: target.y - 0.3, color: "#fff2c4" });
      }
      return;
    }
    if (e.splashRadius > 0 && e.projectileSpeed <= 0 && !e.flying) {
      this.splashDamage(e.team, e.x, e.y, e.splashRadius, dmg, 1, e);
      if (dist(e.x, e.y, target.x, target.y) - target.radius > e.splashRadius) {
        this.damage(target, dmg, { attacker: e });
        this.effects.push({ type: "hit", x: target.x, y: target.y - 0.3, color: "#fff2c4" });
      }
      this.effects.push({ type: "splash", x: e.x, y: e.y, radius: e.splashRadius });
    } else if (e.splashRadius > 0) {
      this.splashDamage(e.team, e.x, e.y, e.splashRadius, dmg, 1, e);
      this.effects.push({ type: "splash", x: e.x, y: e.y, radius: e.splashRadius });
    } else {
      this.damage(target, dmg, { attacker: e });
      this.effects.push({ type: "hit", x: target.x, y: target.y - 0.3, color: "#fff2c4" });
    }
  }
  stepProjectiles(dt) {
    for (const p of this.projectiles) {
      const target = this.byId(p.targetId);
      if (!target) {
        p.speed = -1;
        continue;
      }
      const dx = target.x - p.x;
      const dy = target.y - 0.3 - p.y;
      const len = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      if (len <= stepLen + target.radius) {
        if (p.splashRadius > 0) {
          this.splashDamage(p.team, target.x, target.y, p.splashRadius, p.damage);
          this.effects.push({
            type: "splash",
            x: target.x,
            y: target.y,
            radius: p.splashRadius
          });
        } else {
          this.damage(target, p.damage, { attackerTeam: p.team });
          this.effects.push({ type: "hit", x: target.x, y: target.y - 0.3, color: p.color });
        }
        p.speed = -1;
        continue;
      }
      p.x += dx / len * stepLen;
      p.y += dy / len * stepLen;
    }
    this.projectiles = this.projectiles.filter((p) => p.speed > 0);
  }
  splashDamage(team, x, y, radius, amount, towerFactor = 1, attacker, spellCardId) {
    const enemy = team === 0 ? 1 : 0;
    for (const o of this.entities) {
      if (o.team !== enemy || o.hp <= 0) continue;
      if (dist(x, y, o.x, o.y) - o.radius > radius) continue;
      this.damage(o, o.kind === "tower" ? amount * towerFactor : amount, {
        spell: !attacker,
        attacker,
        spellCardId
      });
    }
  }
  damage(target, amount, opts) {
    if (target.hp <= 0) return;
    if (this.isDamageBlocked(target, opts)) return;
    target.hp -= amount;
    target.hitFlash = 0.16;
    if (target.towerKind === "king") target.active = true;
    this.resetTowerFocusIfHit(target, opts);
  }
  /** Tesla zap and Zap spell reset tower focus on troops that can attack units. */
  resetTowerFocusIfHit(target, opts) {
    const hitByTesla = opts?.attacker?.cardId === "tesla";
    const hitByZap = opts?.spellCardId === "zap";
    if ((hitByTesla || hitByZap) && target.targets !== "buildings") {
      target.towerFocusLocked = false;
    }
  }
  /** Hidden Tesla ignores most damage while underground. */
  isDamageBlocked(target, opts) {
    if (!target.hidden || target.cardId !== "tesla" || target.deployLeft > 0) return false;
    if (opts?.spell) return true;
    if (opts?.attacker?.targets === "buildings") return false;
    return true;
  }
  /** Push overlapping ground units apart so they don't pile into one pixel. */
  separate() {
    const movers = this.entities.filter(
      (e) => (e.kind === "troop" || e.kind === "building" || e.kind === "tower") && e.hp > 0
    );
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      for (let j = i + 1; j < movers.length; j++) {
        const b = movers[j];
        if (a.flying !== b.flying) continue;
        const aFixed = a.kind !== "troop";
        const bFixed = b.kind !== "troop";
        if (aFixed && bFixed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min || d < 1e-5) continue;
        const push = (min - d) / 2;
        const nx = dx / d * push;
        const ny = dy / d * push;
        const aw = aFixed ? 0 : bFixed ? 2 : b.radius / min * 2;
        const bw = bFixed ? 0 : aFixed ? 2 : a.radius / min * 2;
        a.x -= nx * aw;
        a.y -= ny * aw;
        b.x += nx * bw;
        b.y += ny * bw;
      }
    }
    const troops = movers.filter((e) => e.kind === "troop");
    for (const e of troops) {
      e.x = Math.min(Math.max(e.x, e.radius), ARENA.width - e.radius);
      e.y = Math.min(Math.max(e.y, e.radius), ARENA.height - e.radius);
      if (!e.flying && !e.jumpsRiver && e.y > ARENA.riverTop - 0.2 && e.y < ARENA.riverBottom + 0.2) {
        const bx = nearestBridgeX(e.x);
        const half = ARENA.bridgeHalfWidth - e.radius * 0.5;
        e.x = Math.min(Math.max(e.x, bx - half), bx + half);
      }
    }
  }
  cleanup() {
    const dead = this.entities.filter((e) => e.hp <= 0 && !e.rubble);
    if (dead.length === 0) return;
    for (const e of dead) {
      if (e.kind === "tower") {
        e.rubble = true;
        this.crowns[e.team === 0 ? 1 : 0] += 1;
        this.effects.push({ type: "towerDown", x: e.x, y: e.y, team: e.team });
        for (const t of this.entities) {
          if (t.team === e.team && t.towerKind === "king" && t.hp > 0) t.active = true;
        }
        if (this.phase === "overtime") {
          this.finish(e.team === 0 ? "lose" : "win");
        }
      } else {
        this.deathSpawn(e);
        const v = this.b.cards[e.cardId]?.visual;
        this.effects.push({
          type: "death",
          x: e.x,
          y: e.y,
          color: v?.body ?? "#cccccc",
          scale: v?.scale ?? 1
        });
      }
    }
    this.entities = this.entities.filter((e) => e.hp > 0 || e.kind === "tower");
    for (const e of this.entities) {
      if (e.hp <= 0) {
        e.hp = 0;
        e.active = false;
        e.targetId = null;
      }
    }
  }
  checkEnd() {
    if (this.phase === "over") return;
    for (const e of this.entities) {
      if (e.towerKind === "king" && e.hp <= 0) {
        this.finish(e.team === 0 ? "lose" : "win");
        return;
      }
    }
  }
  finish(result) {
    this.phase = "over";
    this.result = result;
    this.timeLeft = 0;
  }
};
var Hand = class {
  hand;
  queue;
  constructor(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.hand = shuffled.slice(0, 4);
    this.queue = shuffled.slice(4);
  }
  get next() {
    return this.queue[0];
  }
  play(index) {
    const card = this.hand[index];
    if (!card) return null;
    const incoming = this.queue.shift();
    if (incoming === void 0) return null;
    this.hand[index] = incoming;
    this.queue.push(card);
    return card;
  }
};

// server/hub.ts
var LEASE_TTL_MS = 5e3;
var LEASE_RENEW_MS = 2e3;
var WATCHDOG_MS = 1e3;
var BALANCE = DEFAULT_BALANCE;
var STEP_SEC = 1 / BALANCE.global.tickRate;
var COUNTDOWN_MS = 3e3;
var Hub = class {
  constructor(store, instanceId2) {
    this.store = store;
    this.instanceId = instanceId2;
  }
  sockets = /* @__PURE__ */ new Map();
  playerOf = /* @__PURE__ */ new Map();
  match = null;
  holdsLease = false;
  leaseTimer = null;
  started = false;
  async start() {
    if (this.started) return;
    this.started = true;
    await this.store.subscribe((msg) => void this.onRelay(msg));
    setInterval(() => void this.tickWatchdog(), WATCHDOG_MS);
    console.log(`[claudeclash] hub ${this.instanceId} up (store: ${this.store.label})`);
  }
  // -------------------------------------------------------------- messaging
  sendTo(slot, msg) {
    const local = this.sockets.get(slot);
    if (local?.alive) {
      local.send(encode(msg));
      return;
    }
    void this.store.publish({
      from: this.instanceId,
      kind: "hand",
      slot,
      payload: msg
    });
  }
  sendBoth(build) {
    this.sendTo(0, build(0));
    this.sendTo(1, build(1));
  }
  async onRelay(msg) {
    if (msg.from === this.instanceId) return;
    switch (msg.kind) {
      case "input": {
        if (!this.holdsLease || !this.match) return;
        const { slot, cardId, x, y } = msg.payload;
        this.applyDeploy(slot, cardId, x, y);
        break;
      }
      case "roomChanged":
        await this.broadcastRoomState();
        break;
      default: {
        const slot = msg.slot;
        if (slot === void 0) return;
        const local = this.sockets.get(slot);
        if (local?.alive && msg.payload) local.send(encode(msg.payload));
      }
    }
  }
  // ------------------------------------------------------------- connection
  async onMessage(conn, msg) {
    switch (msg.t) {
      case "hello":
        await this.onHello(conn, msg.playerId);
        break;
      case "setReady":
        await this.onSetReady(conn, msg.ready, msg.deck);
        break;
      case "deploy":
        await this.onDeploy(conn, msg.cardId, msg.x, msg.y);
        break;
      case "leave":
        await this.onLeave(conn);
        break;
      case "pong":
        break;
    }
  }
  async onHello(conn, playerId) {
    if (typeof playerId !== "string" || playerId.length < 4 || playerId.length > 100) {
      conn.send(encode({ t: "error", message: "invalid playerId" }));
      conn.close();
      return;
    }
    let assigned = null;
    let resuming = false;
    const room = await this.store.mutate((r) => {
      const existing = r.slots.findIndex((s) => s?.playerId === playerId);
      if (existing >= 0) {
        assigned = existing;
        resuming = r.phase === "match";
        r.slots[existing].connected = true;
        return;
      }
      const free = r.slots.findIndex((s) => s === null);
      if (free >= 0) {
        assigned = free;
        r.slots[free] = { playerId, connected: true, ready: false, deck: null };
      }
    });
    if (assigned === null) {
      conn.send(encode({ t: "roomFull" }));
      conn.close();
      return;
    }
    const slot = assigned;
    const previous = this.sockets.get(slot);
    if (previous && previous !== conn && previous.alive) {
      previous.send(encode({ t: "kicked", reason: "Voc\xEA abriu o jogo em outra aba." }));
      previous.close();
      this.playerOf.delete(previous);
    }
    this.sockets.set(slot, conn);
    this.playerOf.set(conn, { slot, playerId });
    console.log(`[claudeclash] slot${slot} joined${resuming ? " (resuming a match)" : ""}`);
    conn.send(encode({ t: "helloAck", slot, balance: BALANCE, resuming }));
    await this.broadcastRoomState(room);
    if (room.phase === "match") {
      if (this.holdsLease && this.match) {
        this.sendHand(slot);
        this.broadcastSnapshot();
      }
    }
  }
  async onSetReady(conn, ready, deck) {
    const who = this.playerOf.get(conn);
    if (!who) return;
    let clean = null;
    if (ready) {
      const filtered = sanitizeDeck(BALANCE, Array.isArray(deck) ? deck : []);
      if (filtered.length !== BALANCE.deckSize) {
        conn.send(encode({ t: "error", message: "Deck inv\xE1lido." }));
        return;
      }
      clean = filtered;
    }
    const room = await this.store.mutate((r) => {
      const s = r.slots[who.slot];
      if (!s) return;
      s.ready = ready;
      if (clean) s.deck = clean;
    });
    await this.broadcastRoomState(room);
    await this.maybeStartMatch(room);
  }
  async onDeploy(conn, cardId, x, y) {
    const who = this.playerOf.get(conn);
    if (!who) return;
    if (typeof cardId !== "string" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.holdsLease && this.match) {
      this.applyDeploy(who.slot, cardId, x, y);
    } else {
      await this.store.publish({
        from: this.instanceId,
        kind: "input",
        payload: { slot: who.slot, cardId, x, y }
      });
    }
  }
  /** Coordinates arrive in the sender's own perspective. */
  applyDeploy(slot, cardId, x, y) {
    if (!this.match) return;
    if (!this.match.timer) return;
    const p = slot === 1 ? flipPoint(x, y) : { x, y };
    const hand = this.match.hands[slot];
    const index = hand.hand.indexOf(cardId);
    if (index < 0) return;
    if (!this.match.world.deploy(slot, cardId, p.x, p.y)) return;
    hand.play(index);
    this.sendHand(slot);
  }
  async onLeave(conn) {
    await this.dropConn(conn);
  }
  async onDisconnect(conn) {
    await this.dropConn(conn);
  }
  /** Same handling for a deliberate exit and a dropped connection. */
  async dropConn(conn) {
    const who = this.playerOf.get(conn);
    this.playerOf.delete(conn);
    if (!who) return;
    if (this.sockets.get(who.slot) === conn) this.sockets.delete(who.slot);
    const room = await this.store.mutate((r) => {
      const s = r.slots[who.slot];
      if (!s || s.playerId !== who.playerId) return;
      s.connected = false;
      if (r.phase === "match") {
        r.hadDisconnect = true;
      } else {
        s.ready = false;
      }
      if (r.phase !== "match") r.slots[who.slot] = null;
    });
    await this.broadcastRoomState(room);
  }
  // ------------------------------------------------------------- room state
  async broadcastRoomState(known) {
    const room = known ?? await this.store.getRoom();
    const count = room.slots.filter((s) => s?.connected).length;
    const view = (s) => s ? { connected: s.connected, ready: s.ready } : { connected: false, ready: false };
    for (const slot of [0, 1]) {
      const other = room.slots[slot === 0 ? 1 : 0];
      this.sendTo(slot, {
        t: "roomState",
        count,
        you: view(room.slots[slot]),
        opponent: other ? view(other) : null,
        phase: room.phase
      });
    }
    if (this.store.label !== "memory") {
      void this.store.publish({ from: this.instanceId, kind: "roomChanged" });
    }
  }
  // ------------------------------------------------------------------ match
  async maybeStartMatch(room) {
    const [a, b] = room.slots;
    const bothReady = Boolean(a?.connected && a.ready && b?.connected && b.ready);
    if (!bothReady || room.phase !== "lobby") return;
    const gotLease = await this.store.acquireLease(this.instanceId, LEASE_TTL_MS);
    if (!gotLease) return;
    const updated = await this.store.mutate((r) => {
      if (r.phase !== "lobby") return;
      const [x, y] = r.slots;
      if (!(x?.connected && x.ready && y?.connected && y.ready)) return;
      r.phase = "match";
      r.hadDisconnect = false;
      r.matchId += 1;
    });
    if (updated.phase !== "match") return;
    this.becomeAuthority();
    this.startMatch(updated);
  }
  startMatch(room) {
    const deckA = room.slots[0]?.deck ?? BALANCE.deck;
    const deckB = room.slots[1]?.deck ?? BALANCE.deck;
    this.match = {
      world: new World(BALANCE),
      hands: [new Hand(deckA), new Hand(deckB)],
      matchId: room.matchId,
      timer: null
    };
    this.sendBoth(() => ({ t: "matchStart" }));
    this.sendHand(0);
    this.sendHand(1);
    const matchId = room.matchId;
    setTimeout(() => {
      if (!this.match || this.match.matchId !== matchId) return;
      this.match.timer = setInterval(() => this.tickMatch(), STEP_SEC * 1e3);
    }, COUNTDOWN_MS);
  }
  sendHand(slot) {
    if (!this.match) return;
    const h = this.match.hands[slot];
    this.sendTo(slot, { t: "hand", hand: [...h.hand], next: h.next });
  }
  tickMatch() {
    const m = this.match;
    if (!m || !this.holdsLease) return;
    m.world.step(STEP_SEC);
    this.broadcastSnapshot();
    if (m.world.phase === "over") void this.endMatch(m.world.result ?? "draw");
  }
  broadcastSnapshot() {
    const m = this.match;
    if (!m) return;
    const w = m.world;
    const snap = {
      entities: w.entities,
      projectiles: w.projectiles,
      pendingSpells: w.pendingSpells,
      rageZones: w.rageZones,
      elixir: w.elixir,
      time: w.time,
      timeLeft: w.timeLeft,
      phase: w.phase,
      result: w.result,
      crowns: w.crowns,
      lastPlayed: w.lastPlayed
    };
    const effects = w.effects.splice(0, w.effects.length);
    for (const slot of [0, 1]) {
      const flip = slot === 1;
      this.sendTo(slot, {
        t: "snapshot",
        world: viewSnapshotAs(snap, flip),
        effects: viewEffectsAs(effects, flip)
      });
    }
  }
  async endMatch(trueResult) {
    const m = this.match;
    if (!m) return;
    if (m.timer) clearInterval(m.timer);
    this.match = null;
    const room = await this.store.mutate((r) => {
      if (r.hadDisconnect) {
        r.slots = [null, null];
        r.phase = "lobby";
      } else {
        r.phase = "lobby";
        for (const s of r.slots) if (s) s.ready = false;
      }
    });
    const routeTo = room.slots[0] === null && room.slots[1] === null ? "home" : "deckSelect";
    const crowns = m.world.crowns;
    for (const slot of [0, 1]) {
      const flip = slot === 1;
      this.sendTo(slot, {
        t: "matchOver",
        result: flip ? trueResult === "win" ? "lose" : trueResult === "lose" ? "win" : "draw" : trueResult,
        crowns: flip ? [crowns[1], crowns[0]] : [crowns[0], crowns[1]],
        routeTo
      });
    }
    await this.store.clearSnapshot();
    await this.releaseAuthority();
    await this.broadcastRoomState(room);
    if (routeTo === "home") {
      this.sockets.clear();
      this.playerOf.clear();
    }
  }
  // -------------------------------------------------------------- authority
  becomeAuthority() {
    if (this.holdsLease) return;
    this.holdsLease = true;
    this.leaseTimer = setInterval(() => {
      void this.store.acquireLease(this.instanceId, LEASE_TTL_MS).then((ok) => {
        if (!ok) void this.releaseAuthority();
      });
    }, LEASE_RENEW_MS);
  }
  async releaseAuthority() {
    if (this.leaseTimer) {
      clearInterval(this.leaseTimer);
      this.leaseTimer = null;
    }
    if (this.match?.timer) clearInterval(this.match.timer);
    if (this.holdsLease) await this.store.releaseLease(this.instanceId);
    this.holdsLease = false;
  }
  /**
   * Keeps authority attached to an instance that actually has a player. If the
   * authority died mid-match its in-memory `World` is gone; rather than freeze
   * the survivor we end the match cleanly and send everyone home.
   */
  async tickWatchdog() {
    const haveLocalPlayer = [...this.sockets.values()].some((c) => c.alive);
    if (!haveLocalPlayer) {
      if (this.holdsLease && !this.match) await this.releaseAuthority();
      return;
    }
    const room = await this.store.getRoom();
    if (room.phase !== "match") return;
    if (this.match) return;
    const got = await this.store.acquireLease(this.instanceId, LEASE_TTL_MS);
    if (!got) return;
    console.warn("[claudeclash] took over an orphaned match \u2014 ending it and resetting the room.");
    this.becomeAuthority();
    await this.store.mutate((r) => {
      r.slots = [null, null];
      r.phase = "lobby";
      r.hadDisconnect = false;
    });
    this.sendBoth(() => ({
      t: "matchOver",
      result: "draw",
      crowns: [0, 0],
      routeTo: "home"
    }));
    this.sockets.clear();
    this.playerOf.clear();
    await this.releaseAuthority();
  }
};

// server/store.ts
var EMPTY_ROOM = {
  slots: [null, null],
  phase: "lobby",
  hadDisconnect: false,
  matchId: 0
};
var MemoryStore = class {
  label = "memory";
  room = structuredClone(EMPTY_ROOM);
  lease = null;
  snapshot = null;
  handlers = [];
  chain = Promise.resolve();
  async getRoom() {
    return structuredClone(this.room);
  }
  /** Serialised through a promise chain so mutations can't interleave. */
  async mutate(fn) {
    const run = this.chain.then(async () => {
      await fn(this.room);
      return structuredClone(this.room);
    });
    this.chain = run.catch(() => void 0);
    return run;
  }
  async acquireLease(owner, ttlMs) {
    const now = Date.now();
    if (this.lease && this.lease.owner !== owner && this.lease.expires > now) return false;
    this.lease = { owner, expires: now + ttlMs };
    return true;
  }
  async releaseLease(owner) {
    if (this.lease?.owner === owner) this.lease = null;
  }
  async saveSnapshot(json) {
    this.snapshot = json;
  }
  async loadSnapshot() {
    return this.snapshot;
  }
  async clearSnapshot() {
    this.snapshot = null;
  }
  // Single process: nothing to relay, everything is already local.
  async publish() {
  }
  async subscribe(handler) {
    this.handlers.push(handler);
  }
  async close() {
    this.handlers = [];
  }
};
var KEY = {
  room: "cc:room",
  lease: "cc:lease",
  snapshot: "cc:snapshot",
  channel: "cc:events"
};
var RedisStore = class {
  constructor(redis) {
    this.redis = redis;
  }
  label = "redis";
  sub = null;
  async getRoom() {
    const raw = await this.redis.get(KEY.room);
    if (!raw) return structuredClone(EMPTY_ROOM);
    try {
      return JSON.parse(raw);
    } catch {
      return structuredClone(EMPTY_ROOM);
    }
  }
  /**
   * Optimistic lock via a short-lived mutex key. At two players contention is
   * effectively nil, but this still rules out one instance clobbering the
   * other's `ready` flag — which would silently hang the match start.
   */
  async mutate(fn) {
    const token = `${Date.now()}-${Math.random()}`;
    const lockKey = `${KEY.room}:lock`;
    for (let attempt = 0; attempt < 50; attempt++) {
      const got = await this.redis.set(lockKey, token, "PX", 2e3, "NX");
      if (got) {
        try {
          const room2 = await this.getRoom();
          await fn(room2);
          await this.redis.set(KEY.room, JSON.stringify(room2));
          return room2;
        } finally {
          await this.redis.eval(
            `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
            1,
            lockKey,
            token
          );
        }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    const room = await this.getRoom();
    await fn(room);
    await this.redis.set(KEY.room, JSON.stringify(room));
    return room;
  }
  async acquireLease(owner, ttlMs) {
    const held = await this.redis.eval(
      `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("pexpire",KEYS[1],ARGV[2]) else return 0 end`,
      1,
      KEY.lease,
      owner,
      String(ttlMs)
    );
    if (held) return true;
    const got = await this.redis.set(KEY.lease, owner, "PX", ttlMs, "NX");
    return Boolean(got);
  }
  async releaseLease(owner) {
    await this.redis.eval(
      `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
      1,
      KEY.lease,
      owner
    );
  }
  async saveSnapshot(json) {
    await this.redis.set(KEY.snapshot, json, "PX", 6e4);
  }
  async loadSnapshot() {
    return this.redis.get(KEY.snapshot);
  }
  async clearSnapshot() {
    await this.redis.del(KEY.snapshot);
  }
  async publish(msg) {
    await this.redis.publish(KEY.channel, JSON.stringify(msg));
  }
  async subscribe(handler) {
    const sub = this.redis.duplicate();
    this.sub = sub;
    sub.on("message", ((_channel, raw) => {
      try {
        handler(JSON.parse(raw));
      } catch {
      }
    }));
    await sub.subscribe(KEY.channel);
  }
  async close() {
    await this.sub?.quit().catch(() => void 0);
    await this.redis.quit().catch(() => void 0);
  }
};
async function createStore() {
  const url = process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL ?? process.env.STORAGE_REDIS_URL;
  if (!url) {
    console.warn(
      "[claudeclash] No REDIS_URL \u2014 using in-memory room state. Fine for local dev and for two players on one instance; set REDIS_URL to make it correct across instances."
    );
    return new MemoryStore();
  }
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    console.log("[claudeclash] Redis store enabled.");
    return new RedisStore(client);
  } catch (err) {
    console.error("[claudeclash] Redis unavailable, falling back to memory:", err);
    return new MemoryStore();
  }
}

// server/ws.ts
var HEARTBEAT_MS = 15e3;
var server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/ws")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "claudeclash-ws" }));
    return;
  }
  res.writeHead(404);
  res.end();
});
var wss = new WebSocketServer({ server });
var instanceId = randomUUID();
var hubReady = (async () => {
  const store = await createStore();
  const hub = new Hub(store, instanceId);
  await hub.start();
  return hub;
})();
wss.on("connection", (ws) => {
  let closed = false;
  const conn = {
    send(data) {
      if (!closed && ws.readyState === ws.OPEN) ws.send(data);
    },
    close() {
      closed = true;
      try {
        ws.close();
      } catch {
      }
    },
    get alive() {
      return !closed && ws.readyState === ws.OPEN;
    }
  };
  let awaitingPong = false;
  const heartbeat = setInterval(() => {
    if (!conn.alive) return;
    if (awaitingPong) {
      conn.close();
      return;
    }
    awaitingPong = true;
    conn.send(encode({ t: "ping" }));
  }, HEARTBEAT_MS);
  void hubReady.then((hub) => {
    ws.on("message", (raw) => {
      const msg = decode(typeof raw === "string" ? raw : raw.toString("utf8"));
      if (!msg) return;
      if (msg.t === "pong") {
        awaitingPong = false;
        return;
      }
      void hub.onMessage(conn, msg).catch((err) => {
        console.error("[claudeclash] message handler failed:", err);
      });
    });
    const teardown = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      void hub.onDisconnect(conn).catch(() => void 0);
    };
    ws.on("close", teardown);
    ws.on("error", teardown);
  });
});
var ws_default = server;
export {
  ws_default as default
};
