import { DEFAULT_BALANCE, resetBalance, saveBalance } from '../balance';
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

  constructor(
    balance: Balance,
    private onApply: (balance: Balance) => void,
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

  open(balance: Balance) {
    this.draft = structuredClone(balance);
    this.render();
    this.el.classList.add('show');
  }

  close() {
    this.el.classList.remove('show');
  }

  // ----------------------------------------------------------------- render

  private render() {
    this.body.innerHTML = '';
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
