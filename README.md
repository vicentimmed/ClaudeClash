# ClaudeClash — protótipo v2

Jogo estilo Clash Royale no navegador. Esta versão é **local** (você contra um bot),
feita para testar jogabilidade e balanceamento antes de entrar a parte online.

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. A tela é travada em 9:16 (celular); no desktop
aparece com moldura.

## Fluxo

```
Deck builder (escolha 8 de 16)  →  Jogar  →  Partida  →  Resultado  →  Deck builder
```

O botão de cartas na barra de cima volta ao deck builder a qualquer momento. O deck
escolhido fica salvo. O bot sorteia 8 cartas a cada partida.

## O que já funciona

- Arena 18 × 32 tiles com rio, duas pontes e 3 torres por lado
- **Rei** em cima das torres centrais e **Princesa** nas laterais, como no original
- Elixir (5 inicial, +1 a cada 2,8 s, máx. 10, dobrado no último minuto)
- Mão de 4 cartas + "próxima", com ciclo igual ao Clash Royale
- 3 min de partida + 1 min de prorrogação por morte súbita
- Torre do Rei só ativa ao levar dano ou perder uma Princesa
- Tropas, construções e feitiços; unidades aéreas, travessia só por ponte, e o
  Corredor que pula o rio
- Bot adversário (defende, contra-ataca e joga feitiço quando você agrupa tropas)
- **Música e efeitos sonoros** sintetizados na hora (Web Audio, zero arquivos)
- Editor de balanceamento no botão de ajustes

## As 16 cartas

**Tropas**

| Carta | 💧 | Vida | Dano | Veloc. | Mira | Observação |
|---|---|---|---|---|---|---|
| Esqueletos ×3 | 1 | 81 | 81 | 1,33 | terrestre | distração de 1 elixir |
| Goblins ×3 | 2 | 202 | 120 | 1,67 | terrestre | dano rápido e barato |
| Cavaleiro | 3 | 1766 | 202 | 1,0 | terrestre | tanque genérico |
| Arqueiras ×2 | 3 | 304 | 118 | 1,0 | ar + terra | suporte curinga |
| Servos ×3 | 3 | 190 | 84 | 1,33 | ar + terra | **voa** |
| Mosqueteira | 4 | 720 | 218 | 1,0 | ar + terra | alcance 6,0 |
| Mini P.E.K.K.A | 4 | 1361 | 720 | 1,33 | terrestre | mata tanque |
| Valquíria | 4 | 1908 | 243 | 1,0 | terrestre | área 360° |
| Dragão Bebê | 4 | 1152 | 133 | 1,0 | ar + terra | **voa**, área |
| Corredor | 4 | 1696 | 264 | 1,67 | só construções | **pula o rio** |
| Gigante | 5 | 3275 | 211 | 0,67 | só construções | ignora tropas |
| Mago | 5 | 720 | 281 | 1,0 | ar + terra | área à distância |

**Construção**

| Carta | 💧 | Vida | Dano | Observação |
|---|---|---|---|---|
| Canhão | 3 | 742 | 127 | não anda, vive 30 s perdendo vida |

**Feitiços** — jogáveis em qualquer lugar do campo

| Carta | 💧 | Dano | Raio | Observação |
|---|---|---|---|---|
| Zap | 2 | 159 | 2,5 | atordoa 0,5 s |
| Flechas | 3 | 243 | 4,0 | antienxame |
| Bola de Fogo | 4 | 572 | 2,5 | o maior dano |

Feitiços causam só **35 %** do dano em torres (`towerDamageFactor`).

## Som

Tudo é gerado por osciladores e ruído filtrado — nenhum arquivo de áudio.

- **Música**: loop de 4 compassos em lá menor (Am–F–C–G) a 104 bpm, com baixo,
  arpejo, pad e percussão leve, agendado com lookahead de 120 ms
- **Efeitos**: seleção de carta, invocação, golpe corpo a corpo, tiro, dano em área,
  cada feitiço com o seu timbre, morte, queda de torre, elixir cheio, contagem
  regressiva dos últimos 5 s, vitória e derrota

O botão de alto-falante liga/desliga tudo e a escolha fica salva. O navegador só
libera áudio depois do primeiro toque na tela — isso é política de autoplay, não bug.

## Mexer nos números

Dois caminhos, os dois valem para todo mundo que jogar:

1. **Botão de ajustes** (o de três controles deslizantes) — edita vida, dano,
   velocidade, alcance, área, custo, mira etc. de cada carta e das torres.
   *Salvar e reiniciar* grava no navegador e recomeça.
2. **`src/balance/cards.json`** — é o padrão de fábrica. Editar esse arquivo muda o
   ponto de partida de todo mundo. *Restaurar padrão* volta para ele.

Use **Exportar** para baixar um `cards.json` com seus ajustes e **Importar** para
carregar um de volta. Quando o servidor entrar, esse mesmo arquivo passa a viver lá.

### Campos por carta

| Campo | Significado |
|---|---|
| `kind` | `troop` · `building` · `spell` |
| `hp` / `damage` | vida e dano por golpe |
| `speed` | tiles por segundo (0,67 lento · 1,0 médio · 1,33 rápido · 1,67 muito rápido) |
| `attackSpeed` | segundos entre golpes |
| `range` | alcance em tiles (≥ 2,5 vira ataque com projétil) |
| `splashRadius` | 0 = alvo único; > 0 = dano em área. Nos feitiços é o raio do estouro |
| `targets` | `ground` · `air+ground` · `buildings` |
| `flying` | voa: ignora quem só mira terrestre e atravessa o rio direto |
| `jumpsRiver` | atravessa fora da ponte sem voar (Corredor) |
| `sightRange` | quão longe enxerga para desviar e atacar algo |
| `count` | quantas unidades saem por carta |
| `radius` | tamanho de colisão em tiles |
| `lifetimeSec` | construções: segundos até sumir sozinha |
| `stunSec` | feitiços: quanto tempo congela o alvo |
| `towerDamageFactor` | feitiços: fração do dano que chega nas torres |

## Testar rápido no console

Em desenvolvimento o jogo fica exposto como `window.__game`:

```js
__game.startMatch(['giant','wizard','fireball','skeletons','knight','archers','zap','cannon'])
__game.debugPlay('hogrider', 4, 18)   // coloca de graça (x, y em tiles)
__game.debugAdvance(5)                // avança 5 segundos na hora
__game.world.entities                 // estado bruto
```

## Estrutura

```
src/
├─ balance/cards.json     ← os números
├─ balance/index.ts       carrega, mescla com o que está salvo, persiste
├─ audio/index.ts         música e efeitos sintetizados
├─ sim/                   simulação pura (sem Pixi) — reaproveitável no servidor
│  ├─ arena.ts            grid, rio, pontes, posições das torres
│  ├─ world.ts            tick, movimento, mira, combate, feitiços, elixir, vitória
│  └─ bot.ts              adversário
├─ render/                PixiJS
│  ├─ shapes.ts           cada personagem, o Rei e a Princesa desenhados por código
│  └─ renderer.ts         arena, sprites, projéteis, partículas
├─ ui/                    deck builder, HUD e editor de balanceamento (DOM)
└─ game.ts                cola tudo: telas, loop, input, áudio
```

`src/sim/` não importa nada do Pixi de propósito: quando a parte online entrar, esse
mesmo código roda no servidor Node como fonte da verdade, e o cliente só desenha.
