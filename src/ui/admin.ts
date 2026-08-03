import { DEFAULT_BALANCE, resetBalance, saveBalance } from '../balance';
import type { SpeedMultiplier } from '../dev/settings';
import type { Balance, CardDef, TargetKind } from '../sim/types';

interface NumField {
  key: string;
  label: string;
  step: number;
  wide?: boolean;
}

const CARD_FIELDS: NumField[] = [
  { key: 'hp', label: 'Vida', step: 1 },
  { key: 'damage', label: 'Dano', step: 1 },
  { key: 'speed', label: 'Veloc. (tiles/s)', step: 0.01 },
  { key: 'attackSpeed', label: 'Ataque (s)', step: 0.1 },
  { key: 'range', label: 'Alcance', step: 0.1 },
  { key: 'splashRadius', label: 'Área', step: 0.1 },
  { key: 'cost', label: 'Elixir', step: 1 },
  { key: 'count', label: 'Unidades', step: 1 },
  { key: 'sightRange', label: 'Visão', step: 0.1 },
  { key: 'deployTime', label: 'Atraso (s)', step: 0.1 },
  { key: 'radius', label: 'Raio', step: 0.02 },
  { key: 'projectileSpeed', label: 'Projétil', step: 0.5 },
];

const GLOBAL_FIELDS: NumField[] = [
  { key: 'matchDurationSec', label: 'Partida (s)', step: 5 },
  { key: 'overtimeSec', label: 'Prorrog. (s)', step: 5 },
  { key: 'elixirRateSec', label: 'Elixir (s)', step: 0.1 },
  { key: 'elixirStart', label: 'Elixir inicial', step: 1 },
  { key: 'elixirMax', label: 'Elixir máx.', step: 1 },
  { key: 'doubleElixirLastSec', label: 'Elixir 2x (s)', step: 5 },
  { key: 'tripleElixirLastSec', label: 'Elixir 3x (s)', step: 5 },
];

const TOWER_FIELDS: NumField[] = [
  { key: 'hp', label: 'Vida', step: 1 },
  { key: 'damage', label: 'Dano', step: 1 },
  { key: 'attackSpeed', label: 'Ataque (s)', step: 0.1 },
  { key: 'range', label: 'Alcance', step: 0.1 },
];

const TARGETS: Array<{ value: TargetKind; label: string }> = [
  { value: 'ground', label: 'Terrestre' },
  { value: 'air+ground', label: 'Ar + terra' },
  { value: 'buildings', label: 'Só construções' },
];

export class AdminPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private draft: Balance;
  private speed = 1 as SpeedMultiplier;
  private elixirSpeed = 1 as SpeedMultiplier;
  private botEnabled = true;
  private crowdEnabled = true;
  private speedBtns: HTMLButtonElement[] = [];
  private elixirSpeedBtns: HTMLButtonElement[] = [];

  constructor(
    balance: Balance,
    private onApply: (balance: Balance) => void,
    private onSpeedChange: (speed: SpeedMultiplier) => void,
    private onElixirSpeedChange: (speed: SpeedMultiplier) => void,
    private onBotEnabledChange: (enabled: boolean) => void,
    private onCrowdEnabledChange: (enabled: boolean) => void,
  ) {
    this.draft = structuredClone(balance);
    this.el = document.getElementById('admin')!;
    this.el.innerHTML = `
      <div class="admin-head">
        <strong>Balanceamento</strong>
        <button class="icon-btn" data-role="export">Exportar</button>
        <button class="icon-btn" data-role="import">Importar</button>
        <button class="icon-btn" data-role="close">Fechar</button>
      </div>
      <div class="admin-body" data-role="body"></div>
      <div class="admin-foot">
        <button class="ghost-btn" data-role="reset">Restaurar padrão</button>
        <button class="big-btn" data-role="save">Salvar e reiniciar</button>
      </div>
      <input type="file" accept="application/json" data-role="file" hidden />
    `;
    this.body = this.q('body');
    this.q('close').addEventListener('click', () => this.close());
    this.q('save').addEventListener('click', () => this.save());
    this.q('reset').addEventListener('click', () => this.reset());
    this.q('export').addEventListener('click', () => this.exportJson());
    this.q('import').addEventListener('click', () => this.q<HTMLInputElement>('file').click());
    this.q<HTMLInputElement>('file').addEventListener('change', (ev) => this.importJson(ev));
  }

  private q<T extends HTMLElement = HTMLElement>(role: string): T {
    return this.el.querySelector<T>(`[data-role="${role}"]`)!;
  }

  open(
    balance: Balance,
    gameSpeed: SpeedMultiplier = 1,
    elixirSpeed: SpeedMultiplier = 1,
    botEnabled = true,
    crowdEnabled = true,
  ) {
    this.draft = structuredClone(balance);
    this.speed = gameSpeed;
    this.elixirSpeed = elixirSpeed;
    this.botEnabled = botEnabled;
    this.crowdEnabled = crowdEnabled;
    this.render();
    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
  }

  // ----------------------------------------------------------------- render

  private render() {
    this.body.innerHTML = '';
    this.body.appendChild(this.testGroup());
    this.body.appendChild(this.sceneGroup());
    this.body.appendChild(
      this.group('Partida', null, null, GLOBAL_FIELDS, this.draft.global as unknown as Record<string, number>),
    );
    this.body.appendChild(
      this.group(
        'Torre Princesa',
        null,
        null,
        TOWER_FIELDS,
        this.draft.towers.princess as unknown as Record<string, number>,
      ),
    );
    this.body.appendChild(
      this.group(
        'Torre do Rei',
        null,
        null,
        TOWER_FIELDS,
        this.draft.towers.king as unknown as Record<string, number>,
      ),
    );

    for (const [id, card] of Object.entries(this.draft.cards)) {
      this.body.appendChild(this.cardGroup(id, card));
    }
  }

  private testGroup(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'group';
    const head = document.createElement('h3');
    head.textContent = 'Teste';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'dev';
    head.appendChild(tag);
    box.appendChild(head);

    const note = document.createElement('p');
    note.className = 'group-note';
    note.textContent =
      'Atalhos de teste — não alteram o balanceamento salvo. Velocidade acelera tudo; Elixir acelera só a regeneração.';
    box.appendChild(note);

    box.appendChild(this.speedRow('Velocidade do jogo', this.speed, (s) => this.setSpeed(s), 'speedBtns'));
    box.appendChild(
      this.speedRow('Velocidade do elixir', this.elixirSpeed, (s) => this.setElixirSpeed(s), 'elixirSpeedBtns'),
    );
    box.appendChild(
      this.toggleRow('Inimigo (CPU)', 'Joga cartas', this.botEnabled, (on) => {
        this.botEnabled = on;
        this.onBotEnabledChange(on);
      }),
    );
    return box;
  }

  /** Opções visuais da arena — não mexem em regra nem em balanceamento. */
  private sceneGroup(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'group';
    const head = document.createElement('h3');
    head.textContent = 'Cenário';
    box.appendChild(head);

    const note = document.createElement('p');
    note.className = 'group-note';
    note.textContent =
      'Com a plateia ligada, a arena abre espaço para as arquibancadas nas laterais e fica um pouco mais estreita. Desligando, o campo volta a ocupar a tela inteira.';
    box.appendChild(note);

    box.appendChild(
      this.toggleRow('Plateia', 'Goblins e caveiras', this.crowdEnabled, (on) => {
        this.crowdEnabled = on;
        this.onCrowdEnabledChange(on);
      }),
    );
    return box;
  }

  private toggleRow(
    labelText: string,
    toggleText: string,
    checked: boolean,
    onChange: (on: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'speed-row';
    const label = document.createElement('span');
    label.className = 'speed-label';
    label.textContent = labelText;
    row.appendChild(label);

    const toggle = document.createElement('label');
    toggle.className = 'dev-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    toggle.append(input, document.createTextNode(` ${toggleText}`));
    row.appendChild(toggle);
    return row;
  }

  private speedRow(
    labelText: string,
    active: SpeedMultiplier,
    onPick: (speed: SpeedMultiplier) => void,
    btnStore: 'speedBtns' | 'elixirSpeedBtns',
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'speed-row';
    const label = document.createElement('span');
    label.className = 'speed-label';
    label.textContent = labelText;
    row.appendChild(label);

    const seg = document.createElement('div');
    seg.className = 'speed-seg';
    const btns: HTMLButtonElement[] = [];
    for (const speed of [1, 2, 3] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'speed-btn';
      btn.textContent = `${speed}x`;
      btn.setAttribute('aria-pressed', String(active === speed));
      btn.classList.toggle('active', active === speed);
      btn.addEventListener('click', () => onPick(speed));
      seg.appendChild(btn);
      btns.push(btn);
    }
    row.appendChild(seg);

    if (btnStore === 'speedBtns') this.speedBtns = btns;
    else this.elixirSpeedBtns = btns;

    return row;
  }

  private setSpeed(speed: SpeedMultiplier) {
    this.speed = speed;
    this.syncSpeedBtns(this.speedBtns, speed);
    this.onSpeedChange(speed);
  }

  private setElixirSpeed(speed: SpeedMultiplier) {
    this.elixirSpeed = speed;
    this.syncSpeedBtns(this.elixirSpeedBtns, speed);
    this.onElixirSpeedChange(speed);
  }

  private syncSpeedBtns(btns: HTMLButtonElement[], speed: SpeedMultiplier) {
    for (const btn of btns) {
      const on = btn.textContent === `${speed}x`;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  private group(
    title: string,
    swatch: string | null,
    tag: string | null,
    fields: NumField[],
    target: Record<string, number>,
  ): HTMLElement {
    const box = document.createElement('div');
    box.className = 'group';
    const head = document.createElement('h3');
    if (swatch) {
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = swatch;
      head.appendChild(dot);
    }
    head.appendChild(document.createTextNode(title));
    if (tag) {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = tag;
      head.appendChild(tagEl);
    }
    box.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'fields';
    for (const f of fields) {
      grid.appendChild(this.numberField(f, target));
    }
    box.appendChild(grid);
    return box;
  }

  private cardGroup(id: string, card: CardDef): HTMLElement {
    const box = this.group(
      card.name,
      card.visual.body,
      `${card.cost} elixir`,
      CARD_FIELDS,
      card as unknown as Record<string, number>,
    );
    const grid = box.querySelector('.fields')!;

    const targetField = document.createElement('div');
    targetField.className = 'field wide';
    targetField.innerHTML = `<label>Mira</label>`;
    const select = document.createElement('select');
    for (const opt of TARGETS) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (card.targets === opt.value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      card.targets = select.value as TargetKind;
    });
    targetField.appendChild(select);
    grid.appendChild(targetField);

    const flyField = document.createElement('div');
    flyField.className = 'field';
    flyField.innerHTML = `<label>Voa</label>`;
    const flySelect = document.createElement('select');
    for (const [value, label] of [
      ['false', 'Não'],
      ['true', 'Sim'],
    ] as const) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      if (String(card.flying) === value) o.selected = true;
      flySelect.appendChild(o);
    }
    flySelect.addEventListener('change', () => {
      card.flying = flySelect.value === 'true';
    });
    flyField.appendChild(flySelect);
    grid.appendChild(flyField);

    void id;
    return box;
  }

  private numberField(f: NumField, target: Record<string, number>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = f.wide ? 'field wide' : 'field';
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(f.step);
    input.value = String(target[f.key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) target[f.key] = v;
    });
    wrap.append(label, input);
    return wrap;
  }

  // ---------------------------------------------------------------- actions

  private save() {
    saveBalance(this.draft);
    this.close();
    this.onApply(structuredClone(this.draft));
  }

  private reset() {
    resetBalance();
    this.draft = structuredClone(DEFAULT_BALANCE);
    this.render();
    this.close();
    this.onApply(structuredClone(this.draft));
  }

  private exportJson() {
    const blob = new Blob([JSON.stringify(this.draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cards.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private async importJson(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Balance;
      if (!parsed.cards || !parsed.global) throw new Error('formato inválido');
      this.draft = parsed;
      this.render();
    } catch (err) {
      alert(`Não consegui ler esse JSON: ${(err as Error).message}`);
    }
  }
}
